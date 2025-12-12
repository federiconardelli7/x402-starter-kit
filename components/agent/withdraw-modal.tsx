"use client";

import { useState, useEffect } from "react";
import { createThirdwebClient, prepareContractCall, getContract, sendTransaction, prepareTransaction } from "thirdweb";
import { privateKeyToAccount } from "thirdweb/wallets";
import { useSendTransaction } from "thirdweb/react";
import { avalancheFuji } from "thirdweb/chains";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { USDC_FUJI_ADDRESS } from "@/lib/constants";
import { AgentWallet, formatUSDCBalance } from "@/lib/agent-wallet";

const client = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID!,
});

// Minimum AVAX needed for gas (0.002 AVAX is plenty for ERC20 transfer)
const MIN_GAS_AVAX = BigInt("2000000000000000"); // 0.002 AVAX in wei
// Amount to send when funding gas (0.01 AVAX)
const GAS_FUND_AMOUNT = BigInt("10000000000000000"); // 0.01 AVAX in wei

interface WithdrawModalProps {
  agentWallet: AgentWallet;
  agentBalance: bigint;
  destinationAddress: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function WithdrawModal({
  agentWallet,
  agentBalance,
  destinationAddress,
  onClose,
  onSuccess,
}: WithdrawModalProps) {
  const { mutate: sendTx, isPending: isSendingGas } = useSendTransaction();
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentAvaxBalance, setAgentAvaxBalance] = useState<bigint>(BigInt(0));
  const [needsGas, setNeedsGas] = useState(false);
  const [gasSent, setGasSent] = useState(false);

  // Check agent wallet's AVAX balance for gas
  const checkAvaxBalance = async () => {
    try {
      // Use direct RPC call for more reliable results
      const rpcResponse = await fetch("https://api.avax-test.network/ext/bc/C/rpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_getBalance",
          params: [agentWallet.address, "latest"],
          id: 1,
        }),
      });
      const rpcData = await rpcResponse.json();
      if (rpcData.result) {
        const balance = BigInt(rpcData.result);
        console.log("Agent AVAX balance:", balance.toString());
        setAgentAvaxBalance(balance);
        setNeedsGas(balance < MIN_GAS_AVAX);
        return balance;
      }
    } catch (err) {
      console.error("Failed to check AVAX balance:", err);
      // Fallback: assume needs gas if we can't check
      setNeedsGas(true);
    }
    return BigInt(0);
  };

  useEffect(() => {
    checkAvaxBalance();
  }, [agentWallet.address]);

  const handleSendGasToAgent = async () => {
    setError(null);
    try {
      // Send 0.01 AVAX from main wallet to agent wallet for gas
      const transaction = prepareTransaction({
        chain: avalancheFuji,
        client,
        to: agentWallet.address as `0x${string}`,
        value: GAS_FUND_AMOUNT,
      });

      sendTx(transaction, {
        onSuccess: async () => {
          console.log("Gas sent to agent wallet");
          setGasSent(true);
          
          // Poll for balance update (transaction needs to confirm)
          let attempts = 0;
          const maxAttempts = 10;
          const pollInterval = setInterval(async () => {
            attempts++;
            const balance = await checkAvaxBalance();
            console.log(`Checking balance attempt ${attempts}:`, balance.toString());
            
            if (balance >= MIN_GAS_AVAX || attempts >= maxAttempts) {
              clearInterval(pollInterval);
            }
          }, 2000);
        },
        onError: (err) => {
          console.error("Failed to send gas:", err);
          setError("Failed to send AVAX for gas. Make sure you have AVAX in your main wallet.");
        },
      });
    } catch (err) {
      console.error("Failed to prepare gas transaction:", err);
      setError("Failed to prepare gas transaction");
    }
  };

  const handleWithdraw = async () => {
    if (agentBalance <= BigInt(0)) return;

    setIsWithdrawing(true);
    setError(null);

    try {
      // Create account from agent wallet's private key
      const agentAccount = privateKeyToAccount({
        client,
        privateKey: agentWallet.privateKey as `0x${string}`,
      });

      // Get USDC contract
      const contract = getContract({
        client,
        chain: avalancheFuji,
        address: USDC_FUJI_ADDRESS,
      });

      // Prepare transfer transaction
      const transaction = prepareContractCall({
        contract,
        method: "function transfer(address to, uint256 amount) returns (bool)",
        params: [destinationAddress as `0x${string}`, agentBalance],
      });

      // Send transaction using agent's private key
      const result = await sendTransaction({
        transaction,
        account: agentAccount,
      });

      console.log("Withdraw transaction sent:", result.transactionHash);
      
      // Wait a moment for the transaction to be processed
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      onSuccess();
      onClose();
    } catch (err) {
      console.error("Withdraw failed:", err);
      const errorMsg = err instanceof Error ? err.message : "Withdrawal failed";
      
      // Check if it's a gas-related error
      if (errorMsg.toLowerCase().includes("gas") || errorMsg.toLowerCase().includes("funds")) {
        setError("Insufficient AVAX for gas. Please send AVAX to agent wallet first.");
        setNeedsGas(true);
      } else {
        setError(errorMsg);
      }
    } finally {
      setIsWithdrawing(false);
    }
  };

  const shortDestination = `${destinationAddress.slice(0, 6)}...${destinationAddress.slice(-4)}`;
  const shortAgentAddress = `${agentWallet.address.slice(0, 6)}...${agentWallet.address.slice(-4)}`;
  const formatAvax = (wei: bigint) => `${(Number(wei) / 1e18).toFixed(4)} AVAX`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle className="text-lg">Withdraw from Agent Wallet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-slate-50 rounded-lg p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">USDC Amount:</span>
              <span className="font-bold text-emerald-600">
                {formatUSDCBalance(agentBalance)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">To:</span>
              <code className="text-xs bg-slate-200 px-2 py-0.5 rounded">
                {shortDestination}
              </code>
            </div>
          </div>

          {/* Gas Warning */}
          {needsGas && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
              <p className="text-sm text-amber-800 font-medium">
                ⛽ Agent wallet needs AVAX for gas
              </p>
              <p className="text-xs text-amber-700">
                The agent wallet has {formatAvax(agentAvaxBalance)} but needs at least ~0.002 AVAX for gas.
              </p>
              <Button
                onClick={handleSendGasToAgent}
                disabled={isSendingGas}
                size="sm"
                className="w-full bg-amber-600 hover:bg-amber-700"
              >
                {isSendingGas ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin">◌</span>
                    Sending AVAX...
                  </span>
                ) : (
                  "Send 0.01 AVAX for Gas"
                )}
              </Button>
            </div>
          )}

          {/* Success: Gas sent */}
          {gasSent && !needsGas && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <p className="text-sm text-emerald-700">
                ✓ Gas sent! You can now withdraw.
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 text-red-600 rounded-lg p-3 text-sm">
              {error}
            </div>
          )}

          <p className="text-xs text-slate-500">
            This will transfer all USDC from your agent wallet back to your main wallet.
          </p>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isWithdrawing || isSendingGas}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleWithdraw}
              disabled={isWithdrawing || agentBalance <= BigInt(0) || needsGas}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
            >
              {isWithdrawing ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin">◌</span>
                  Withdrawing...
                </span>
              ) : (
                "Withdraw All"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
