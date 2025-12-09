"use client";

import { useState, useEffect } from "react";
import { createThirdwebClient } from "thirdweb";
import { useActiveAccount, useSendTransaction } from "thirdweb/react";
import { prepareContractCall, getContract } from "thirdweb";
import { avalancheFuji } from "thirdweb/chains";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  createAgentWallet,
  loadAgentWallet,
  hasAgentWallet,
  getAgentWalletAddress,
  getUSDCBalance,
  formatUSDCBalance,
  deleteAgentWallet,
  AgentWallet,
} from "@/lib/agent-wallet";
import { USDC_FUJI_ADDRESS, AGENT_AUTHORIZATION } from "@/lib/constants";

const client = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID!,
});

interface AuthorizationPanelProps {
  onAgentWalletReady: (wallet: AgentWallet) => void;
  agentWallet: AgentWallet | null;
}

type Step = "no-wallet" | "wallet-created" | "funding" | "ready";

export function AuthorizationPanel({ onAgentWalletReady, agentWallet }: AuthorizationPanelProps) {
  const mainAccount = useActiveAccount();
  const { mutate: sendTransaction, isPending: isSending } = useSendTransaction();
  
  const [step, setStep] = useState<Step>("no-wallet");
  const [isCreating, setIsCreating] = useState(false);
  const [fundAmount, setFundAmount] = useState(750000); // $0.75 default
  const [agentAddress, setAgentAddress] = useState<string | null>(null);
  const [agentBalance, setAgentBalance] = useState<bigint>(BigInt(0));
  const [mainBalance, setMainBalance] = useState<bigint>(BigInt(0));
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);

  // Check for existing wallet on mount
  useEffect(() => {
    if (mainAccount?.address) {
      const existingWallet = loadAgentWallet(mainAccount.address);
      if (existingWallet) {
        setAgentAddress(existingWallet.address);
        onAgentWalletReady(existingWallet);
        setStep("ready");
      } else if (hasAgentWallet()) {
        // Wallet exists but couldn't decrypt (different user?)
        setAgentAddress(getAgentWalletAddress());
        setStep("wallet-created");
      }
    }
  }, [mainAccount?.address]);

  // Fetch balances
  useEffect(() => {
    const fetchBalances = async () => {
      setIsLoadingBalances(true);
      try {
        if (agentAddress) {
          const balance = await getUSDCBalance(agentAddress, client);
          setAgentBalance(balance);
          
          // If agent has balance and we're waiting to fund, mark as ready
          if (balance > BigInt(0) && (step === "wallet-created" || step === "funding")) {
            const wallet = loadAgentWallet(mainAccount!.address);
            if (wallet) {
              onAgentWalletReady(wallet);
              setStep("ready");
            }
          }
          
          // If agent has NO balance and we're "ready", go back to funding step
          if (balance === BigInt(0) && step === "ready") {
            setStep("wallet-created");
          }
        }
        if (mainAccount?.address) {
          const balance = await getUSDCBalance(mainAccount.address, client);
          setMainBalance(balance);
        }
      } catch (error) {
        console.error("Failed to fetch balances:", error);
      } finally {
        setIsLoadingBalances(false);
      }
    };

    fetchBalances();
    const interval = setInterval(fetchBalances, 5000);
    return () => clearInterval(interval);
  }, [agentAddress, mainAccount?.address, step]);

  const handleCreateWallet = async () => {
    if (!mainAccount?.address) return;
    
    setIsCreating(true);
    try {
      const wallet = await createAgentWallet(mainAccount.address, client);
      setAgentAddress(wallet.address);
      setStep("wallet-created");
    } catch (error) {
      console.error("Failed to create agent wallet:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleFundWallet = async () => {
    if (!mainAccount?.address || !agentAddress) return;

    try {
      const contract = getContract({
        client,
        chain: avalancheFuji,
        address: USDC_FUJI_ADDRESS,
      });

      const transaction = prepareContractCall({
        contract,
        method: "function transfer(address to, uint256 amount) returns (bool)",
        params: [agentAddress as `0x${string}`, BigInt(fundAmount)],
      });

      sendTransaction(transaction, {
        onSuccess: () => {
          console.log("Funding transaction sent");
          // Balance will update via the polling
        },
        onError: (error) => {
          console.error("Funding failed:", error);
        },
      });
    } catch (error) {
      console.error("Failed to prepare funding transaction:", error);
    }
  };

  const handleDeleteWallet = () => {
    if (confirm("Are you sure? This will delete your agent wallet. Make sure to withdraw any remaining funds first.")) {
      deleteAgentWallet();
      setAgentAddress(null);
      setAgentBalance(BigInt(0));
      setStep("no-wallet");
    }
  };

  const formatBudget = (amount: number) => `$${(amount / 1_000_000).toFixed(2)}`;
  const shortAddress = agentAddress ? `${agentAddress.slice(0, 6)}...${agentAddress.slice(-4)}` : "";

  // Already ready - show minimal info
  if (agentWallet && agentBalance > BigInt(0)) {
    return null; // Dashboard will show the wallet info
  }

  return (
    <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg text-amber-900 flex items-center gap-2">
          <span className="text-2xl">🤖</span>
          {step === "no-wallet" && "Create Agent Wallet"}
          {step === "wallet-created" && "Fund Your Agent"}
          {step === "funding" && "Funding..."}
          {step === "ready" && "Agent Ready"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        
        {/* Step 1: No wallet - Create one */}
        {step === "no-wallet" && (
          <>
            <p className="text-sm text-amber-800">
              Create a dedicated wallet for your AI agent. You'll fund it with USDC,
              and the agent can spend automatically without popups.
            </p>
            
            <div className="bg-white/60 rounded-lg p-3 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-emerald-500">1.</span>
                <span>Create agent wallet (one-time)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-500">2.</span>
                <span>Fund with USDC from your main wallet</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-500">3.</span>
                <span>Agent pays automatically - no more popups!</span>
              </div>
            </div>

            <Button
              onClick={handleCreateWallet}
              disabled={isCreating || !mainAccount}
              className="w-full bg-amber-600 hover:bg-amber-700"
            >
              {isCreating ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin">◌</span>
                  Creating Wallet...
                </span>
              ) : (
                "Create Agent Wallet"
              )}
            </Button>
          </>
        )}

        {/* Step 2: Wallet created - Fund it */}
        {(step === "wallet-created" || step === "funding") && agentAddress && (
          <>
            <div className="bg-white/60 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Agent Wallet:</span>
                <code className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded font-mono">
                  {shortAddress}
                </code>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Current Balance:</span>
                <span className={`font-bold ${agentBalance > BigInt(0) ? "text-emerald-600" : "text-slate-400"}`}>
                  {formatUSDCBalance(agentBalance)}
                </span>
              </div>
            </div>

            {agentBalance === BigInt(0) && (
              <>
                <p className="text-sm text-amber-800">
                  Fund your agent wallet with USDC. This is the budget your agent can spend.
                </p>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-amber-900">Amount to Fund</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={100000}
                      max={Math.min(Number(mainBalance), 5000000)}
                      step={100000}
                      value={fundAmount}
                      onChange={(e) => setFundAmount(Number(e.target.value))}
                      className="flex-1 accent-amber-600"
                      disabled={mainBalance === BigInt(0)}
                    />
                    <span className="text-sm font-medium text-amber-900 w-16 text-right">
                      {formatBudget(fundAmount)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Your main wallet: {formatUSDCBalance(mainBalance)} USDC
                  </p>
                </div>

                <Button
                  onClick={handleFundWallet}
                  disabled={isSending || mainBalance < BigInt(fundAmount)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  {isSending ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin">◌</span>
                      Sending USDC...
                    </span>
                  ) : (
                    `Fund Agent with ${formatBudget(fundAmount)}`
                  )}
                </Button>

                {mainBalance < BigInt(100000) && (
                  <p className="text-xs text-red-600 bg-red-50 rounded p-2">
                    Your main wallet needs USDC. Get testnet USDC from the Avalanche Fuji faucet.
                  </p>
                )}
              </>
            )}

            {agentBalance > BigInt(0) && (
              <div className="bg-emerald-100 rounded-lg p-3 text-center">
                <p className="text-emerald-700 font-medium">
                  ✓ Agent wallet funded! Loading agent...
                </p>
              </div>
            )}

            <button
              onClick={handleDeleteWallet}
              className="text-xs text-red-500 hover:text-red-700 underline"
            >
              Delete agent wallet
            </button>
          </>
        )}

        {/* Warning */}
        <p className="text-xs text-amber-700 bg-amber-100/50 rounded p-2">
          ⚠️ Agent wallet is a hot wallet. Private key is stored encrypted in your browser.
          Only fund with amounts you're comfortable spending.
        </p>
      </CardContent>
    </Card>
  );
}
