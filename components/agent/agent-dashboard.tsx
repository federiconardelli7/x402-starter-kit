"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createThirdwebClient, prepareContractCall, getContract } from "thirdweb";
import { useActiveAccount, useSendTransaction } from "thirdweb/react";
import { privateKeyAccount } from "thirdweb/wallets";
import { wrapFetchWithPayment } from "thirdweb/x402";
import { avalancheFuji } from "thirdweb/chains";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AuthorizationPanel } from "./authorization-panel";
import { WalletBalance } from "./wallet-balance";
import { ServiceNetwork, ServiceCall } from "./service-network";
import { WithdrawModal } from "./withdraw-modal";
import { createNormalizedFetch } from "@/lib/payment";
import { AVALANCHE_FUJI_CHAIN_ID, API_ENDPOINTS, AGENT_AUTHORIZATION, USDC_FUJI_ADDRESS } from "@/lib/constants";
import {
  AgentWallet,
  getUSDCBalance,
  formatUSDCBalance,
  createAgentAccount,
} from "@/lib/agent-wallet";
import { formatBudget } from "@/lib/agent-authorization";

const client = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID!,
});

// Service cost as BigInt for x402 payments
const SERVICE_COST_BIGINT = BigInt(AGENT_AUTHORIZATION.SERVICE_COST);

// Smart commands that trigger multiple service calls
const SMART_COMMANDS: Record<string, { tokens: string[]; description: string }> = {
  "market summary": {
    tokens: ["BTC", "ETH", "AVAX"],
    description: "Get prices for top 3 cryptocurrencies",
  },
  "top coins": {
    tokens: ["BTC", "ETH", "SOL", "AVAX", "LINK"],
    description: "Get prices for top 5 cryptocurrencies",
  },
  "defi check": {
    tokens: ["ETH", "AAVE", "UNI", "LINK"],
    description: "Check major DeFi tokens",
  },
  "stablecoins": {
    tokens: ["USDC", "USDT"],
    description: "Check stablecoin prices",
  },
};

interface AgentMessage {
  id: string;
  sender: "user" | "agent" | "system";
  content: string;
  timestamp: Date;
  tokens?: string[];
  totalCost?: number;
}

export function AgentDashboard() {
  const mainAccount = useActiveAccount();
  const { mutate: sendTransaction, isPending: isFunding } = useSendTransaction();
  const [agentWallet, setAgentWallet] = useState<AgentWallet | null>(null);
  const [agentBalance, setAgentBalance] = useState<bigint>(BigInt(0));
  const [mainBalance, setMainBalance] = useState<bigint>(BigInt(0));
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [serviceCalls, setServiceCalls] = useState<ServiceCall[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showAddFunds, setShowAddFunds] = useState(false);
  const [fundAmount, setFundAmount] = useState(500000); // $0.50 default
  
  // Store the agent's signing wallet
  const agentSignerRef = useRef<ReturnType<typeof privateKeyAccount> | null>(null);
  const fetchWithPayRef = useRef<ReturnType<typeof wrapFetchWithPayment> | null>(null);

  // Initialize agent signer when wallet is ready
  useEffect(() => {
    if (agentWallet) {
      // Create a private key account that can sign automatically
      const agentAccount = createAgentAccount(agentWallet, client);
      agentSignerRef.current = agentAccount;
      
      // Create a wallet-like object for wrapFetchWithPayment
      // wrapFetchWithPayment needs a wallet that has getAccount()
      const agentWalletWrapper = {
        getAccount: () => agentAccount,
        getChain: () => ({ id: AVALANCHE_FUJI_CHAIN_ID }),
      };
      
      const normalizedFetch = createNormalizedFetch(AVALANCHE_FUJI_CHAIN_ID);
      fetchWithPayRef.current = wrapFetchWithPayment(
        normalizedFetch,
        client,
        agentWalletWrapper as any,
        { maxValue: SERVICE_COST_BIGINT }
      );
      
      console.log("Agent wallet ready for autonomous signing:", agentWallet.address);
    } else {
      agentSignerRef.current = null;
      fetchWithPayRef.current = null;
    }
  }, [agentWallet]);

  // Fetch balances
  useEffect(() => {
    const fetchBalances = async () => {
      if (agentWallet) {
        const balance = await getUSDCBalance(agentWallet.address, client);
        setAgentBalance(balance);
      }
      if (mainAccount?.address) {
        const balance = await getUSDCBalance(mainAccount.address, client);
        setMainBalance(balance);
      }
    };
    
    fetchBalances();
    const interval = setInterval(fetchBalances, 5000);
    return () => clearInterval(interval);
  }, [agentWallet, mainAccount?.address]);

  const handleAgentWalletReady = useCallback((wallet: AgentWallet) => {
    setAgentWallet(wallet);
    setMessages([{
      id: Date.now().toString(),
      sender: "agent",
      content: `Agent wallet ready! I can now make payments automatically from my dedicated wallet.\n\nTry these commands:\n• "market summary" - Top 3 cryptos\n• "top coins" - Top 5 cryptos\n• "price of ETH" - Single lookup\n• "defi check" - DeFi tokens\n\n✅ All payments are automatic - no popups!`,
      timestamp: new Date(),
    }]);
    setServiceCalls([]);
  }, []);

  const handleWithdraw = () => {
    setShowWithdrawModal(true);
  };

  const handleWithdrawSuccess = () => {
    // Refresh balance after withdrawal
    if (agentWallet) {
      getUSDCBalance(agentWallet.address, client).then(setAgentBalance);
    }
  };

  const handleAddFunds = async () => {
    if (!mainAccount?.address || !agentWallet) return;

    try {
      const contract = getContract({
        client,
        chain: avalancheFuji,
        address: USDC_FUJI_ADDRESS,
      });

      const transaction = prepareContractCall({
        contract,
        method: "function transfer(address to, uint256 amount) returns (bool)",
        params: [agentWallet.address as `0x${string}`, BigInt(fundAmount)],
      });

      sendTransaction(transaction, {
        onSuccess: () => {
          console.log("Funding transaction sent");
          setShowAddFunds(false);
          // Balance will update via polling
        },
        onError: (error) => {
          console.error("Funding failed:", error);
        },
      });
    } catch (error) {
      console.error("Failed to prepare funding transaction:", error);
    }
  };

  const formatDollars = (amount: number) => `$${(amount / 1_000_000).toFixed(2)}`;

  // Detect smart command or extract single token
  const parseUserIntent = (message: string): { tokens: string[]; isSmartCommand: boolean; commandName?: string } => {
    const lowerMessage = message.toLowerCase().trim();

    // Check for smart commands
    for (const [command, config] of Object.entries(SMART_COMMANDS)) {
      if (lowerMessage.includes(command)) {
        return { tokens: config.tokens, isSmartCommand: true, commandName: command };
      }
    }

    // Extract single token
    const tokenMatch = lowerMessage.match(/\b(eth|btc|avax|sol|usdc|usdt|matic|link|uni|aave)\b/i);
    if (tokenMatch) {
      return { tokens: [tokenMatch[1].toUpperCase()], isSmartCommand: false };
    }

    return { tokens: [], isSmartCommand: false };
  };

  // Make a single service call with REAL x402 payment using agent wallet
  const callPriceService = async (token: string): Promise<ServiceCall> => {
    const callId = `${Date.now()}-${token}`;
    const serviceCost = AGENT_AUTHORIZATION.SERVICE_COST;

    // Add pending call
    const pendingCall: ServiceCall = {
      id: callId,
      service: "Price Oracle",
      token,
      cost: serviceCost,
      timestamp: new Date(),
      status: "pending",
    };
    setServiceCalls(prev => [...prev, pendingCall]);

    try {
      if (!fetchWithPayRef.current) {
        throw new Error("Agent wallet not ready");
      }

      // AUTONOMOUS x402 PAYMENT using agent wallet!
      // The agent wallet's private key allows automatic signing - no popups!
      console.log(`[Agent] Making autonomous payment for ${token} price lookup...`);
      
      const response = await fetchWithPayRef.current(API_ENDPOINTS.AGENT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `price of ${token}` }),
      });

      const data = await response.json();

      if (response.status === 200 && data.success) {
        console.log(`[Agent] Payment settled for ${token}:`, data.paymentSettled);
        
        const successCall: ServiceCall = {
          ...pendingCall,
          status: "success",
          result: data.priceData ? {
            price: data.priceData.price,
            change24h: data.priceData.change24h,
          } : undefined,
        };
        setServiceCalls(prev => prev.map(c => c.id === callId ? successCall : c));

        return successCall;
      } else {
        console.error(`[Agent] Service call failed for ${token}:`, data);
        const errorCall: ServiceCall = { ...pendingCall, status: "error" };
        setServiceCalls(prev => prev.map(c => c.id === callId ? errorCall : c));
        return errorCall;
      }
    } catch (error) {
      console.error(`[Agent] Error calling price service for ${token}:`, error);
      const errorCall: ServiceCall = { ...pendingCall, status: "error" };
      setServiceCalls(prev => prev.map(c => c.id === callId ? errorCall : c));
      return errorCall;
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isProcessing || !agentWallet) return;

    const userMessage: AgentMessage = {
      id: Date.now().toString(),
      sender: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsProcessing(true);

    const { tokens, isSmartCommand, commandName } = parseUserIntent(userMessage.content);

    if (tokens.length === 0) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        sender: "agent",
        content: "I couldn't identify any cryptocurrencies in your request. Try asking about ETH, BTC, AVAX, or use commands like \"market summary\".",
        timestamp: new Date(),
      }]);
      setIsProcessing(false);
      return;
    }

    // Check budget (agent wallet balance)
    const totalCost = BigInt(tokens.length * AGENT_AUTHORIZATION.SERVICE_COST);

    if (agentBalance < totalCost) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        sender: "agent",
        content: `I need ${formatBudget(Number(totalCost))} for ${tokens.length} lookup${tokens.length > 1 ? 's' : ''}, but only ${formatUSDCBalance(agentBalance)} remains in my wallet. Please add more funds.`,
        timestamp: new Date(),
      }]);
      setIsProcessing(false);
      return;
    }

    // Add agent thinking message
    const thinkingMsg: AgentMessage = {
      id: (Date.now() + 1).toString(),
      sender: "agent",
      content: isSmartCommand
        ? `Executing "${commandName}"... I'll query ${tokens.length} prices (paying ${formatBudget(Number(totalCost))} automatically).`
        : `Querying price for ${tokens[0]}... (paying ${formatBudget(AGENT_AUTHORIZATION.SERVICE_COST)})`,
      timestamp: new Date(),
      tokens,
    };
    setMessages(prev => [...prev, thinkingMsg]);

    // Make service calls sequentially (to show the animation)
    const results: ServiceCall[] = [];
    for (const token of tokens) {
      const result = await callPriceService(token);
      results.push(result);
      // Small delay between calls for visual effect
      if (tokens.length > 1) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    // Build summary response
    const successResults = results.filter(r => r.status === "success" && r.result);
    const actualCost = successResults.length * AGENT_AUTHORIZATION.SERVICE_COST;

    if (successResults.length === 0) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 2).toString(),
        sender: "agent",
        content: "Sorry, I couldn't fetch the price data. The service might be temporarily unavailable or there was a payment issue.",
        timestamp: new Date(),
      }]);
    } else if (isSmartCommand && successResults.length > 1) {
      // Multi-result summary
      const summaryLines = successResults.map(r => {
        const changeEmoji = r.result!.change24h >= 0 ? "📈" : "📉";
        const priceStr = r.result!.price < 1
          ? `$${r.result!.price.toFixed(4)}`
          : `$${r.result!.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
        const changeStr = `${r.result!.change24h >= 0 ? '+' : ''}${r.result!.change24h.toFixed(1)}%`;
        return `**${r.token}** ${changeEmoji} ${priceStr} (${changeStr})`;
      });

      setMessages(prev => [...prev, {
        id: (Date.now() + 2).toString(),
        sender: "agent",
        content: `Here's your ${commandName}:\n\n${summaryLines.join('\n')}\n\n✅ Paid ${formatBudget(actualCost)} for ${successResults.length} queries`,
        timestamp: new Date(),
        totalCost: actualCost,
      }]);
    } else if (successResults.length === 1) {
      // Single result
      const r = successResults[0];
      const changeEmoji = r.result!.change24h >= 0 ? "📈" : "📉";
      const priceStr = r.result!.price < 1
        ? `$${r.result!.price.toFixed(4)}`
        : `$${r.result!.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

      setMessages(prev => [...prev, {
        id: (Date.now() + 2).toString(),
        sender: "agent",
        content: `**${r.token}** ${changeEmoji}\n\nPrice: ${priceStr}\n24h Change: ${r.result!.change24h >= 0 ? '+' : ''}${r.result!.change24h.toFixed(2)}%\n\n✅ Paid ${formatBudget(actualCost)}`,
        timestamp: new Date(),
        totalCost: actualCost,
      }]);
    }

    setIsProcessing(false);
  };

  const isReady = agentWallet && agentBalance > BigInt(0);
  const totalServiceEarnings = serviceCalls.filter(c => c.status === "success").length * AGENT_AUTHORIZATION.SERVICE_COST;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-4">
      {/* Withdraw Modal */}
      {showWithdrawModal && agentWallet && mainAccount && (
        <WithdrawModal
          agentWallet={agentWallet}
          agentBalance={agentBalance}
          destinationAddress={mainAccount.address}
          onClose={() => setShowWithdrawModal(false)}
          onSuccess={handleWithdrawSuccess}
        />
      )}

      {/* Authorization / Wallet Setup */}
      <AuthorizationPanel
        onAgentWalletReady={handleAgentWalletReady}
        agentWallet={agentWallet}
      />

      {/* Agent Ready - Show Dashboard */}
      {isReady && (
        <>
          {/* Wallet Balance Display */}
          <WalletBalance
            agentWalletAddress={agentWallet.address}
            onWithdraw={handleWithdraw}
            showWithdraw={true}
          />

          {/* Add Funds Panel */}
          {showAddFunds && (
            <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Add More Funds</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAddFunds(false)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={100000}
                      max={Math.min(Number(mainBalance), 2000000)}
                      step={100000}
                      value={fundAmount}
                      onChange={(e) => setFundAmount(Number(e.target.value))}
                      className="flex-1 accent-emerald-600"
                      disabled={mainBalance === BigInt(0)}
                    />
                    <span className="text-sm font-medium text-emerald-700 w-16 text-right">
                      {formatDollars(fundAmount)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Your main wallet: {formatUSDCBalance(mainBalance)} USDC
                  </p>
                </div>
                <Button
                  onClick={handleAddFunds}
                  disabled={isFunding || mainBalance < BigInt(fundAmount)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  {isFunding ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin">◌</span>
                      Sending...
                    </span>
                  ) : (
                    `Add ${formatDollars(fundAmount)} to Agent`
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Quick Add Funds Button (when not showing panel) */}
          {!showAddFunds && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddFunds(true)}
                className="text-emerald-600 border-emerald-300 hover:bg-emerald-50"
              >
                + Add More Funds
              </Button>
            </div>
          )}

          {/* Two-panel layout */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Left Panel - Agent Chat (3/5 width) */}
            <div className="lg:col-span-3">
              <Card className="h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🤖</span>
                      <CardTitle className="text-lg">Your AI Agent</CardTitle>
                    </div>
                    <div className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">
                      {formatUSDCBalance(agentBalance)} available
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Autonomous payments from agent wallet
                  </p>
                </CardHeader>

                <CardContent className="p-0">
                  <ScrollArea className="h-[350px] px-4">
                    <div className="space-y-3 py-4">
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                              message.sender === "user"
                                ? "bg-amber-600 text-white rounded-br-md"
                                : message.sender === "agent"
                                ? "bg-amber-50 text-amber-900 rounded-bl-md border border-amber-200"
                                : "bg-amber-100 text-amber-900 rounded-bl-md border border-amber-300"
                            }`}
                          >
                            {message.sender === "agent" && (
                              <div className="text-xs font-medium mb-1 opacity-70 flex items-center gap-1">
                                🤖 Agent
                              </div>
                            )}
                            <p className="whitespace-pre-wrap">{message.content}</p>
                            {message.totalCost && (
                              <div className="text-xs mt-2 pt-2 border-t border-amber-200 opacity-70 flex items-center gap-1">
                                <span className="text-green-600">●</span> Payment confirmed
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {isProcessing && (
                        <div className="flex justify-start">
                          <div className="bg-amber-50 border border-amber-200 rounded-2xl rounded-bl-md px-4 py-2.5">
                            <div className="flex items-center gap-2 text-sm text-amber-700">
                              <div className="flex gap-1">
                                <div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce" />
                                <div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce [animation-delay:0.1s]" />
                                <div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                              </div>
                              <span>Processing autonomous payments...</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>

                <CardFooter className="flex-col gap-3 pt-3 border-t">
                  <div className="flex w-full gap-2">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder="Try: market summary, price of ETH, top coins..."
                      disabled={isProcessing}
                      className="flex-1 px-3 py-2 text-sm border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent disabled:bg-amber-50"
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={!input.trim() || isProcessing}
                      size="sm"
                      className="bg-amber-600 hover:bg-amber-700"
                    >
                      Send
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 w-full">
                    {Object.entries(SMART_COMMANDS).slice(0, 3).map(([cmd, config]) => (
                      <button
                        key={cmd}
                        onClick={() => setInput(cmd)}
                        disabled={isProcessing}
                        className="text-xs px-2 py-1 rounded-full bg-amber-100 hover:bg-amber-200 text-amber-700 disabled:opacity-50"
                      >
                        {cmd} ({config.tokens.length})
                      </button>
                    ))}
                  </div>
                </CardFooter>
              </Card>
            </div>

            {/* Right Panel - Service Network (2/5 width) */}
            <div className="lg:col-span-2">
              <ServiceNetwork
                serviceCalls={serviceCalls}
                totalEarned={totalServiceEarnings}
                isProcessing={isProcessing}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
