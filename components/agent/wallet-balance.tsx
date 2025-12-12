"use client";

import { useState, useEffect } from "react";
import { createThirdwebClient } from "thirdweb";
import { useActiveAccount } from "thirdweb/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getAgentWalletAddress,
  getUSDCBalance,
  formatUSDCBalance,
} from "@/lib/agent-wallet";

const client = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID!,
});

interface WalletBalanceProps {
  agentWalletAddress: string | null;
  onRefresh?: () => void;
  onWithdraw?: () => void;
  showWithdraw?: boolean;
}

export function WalletBalance({
  agentWalletAddress,
  onRefresh,
  onWithdraw,
  showWithdraw = true,
}: WalletBalanceProps) {
  const mainAccount = useActiveAccount();
  const [agentBalance, setAgentBalance] = useState<bigint>(BigInt(0));
  const [mainBalance, setMainBalance] = useState<bigint>(BigInt(0));
  const [isLoading, setIsLoading] = useState(false);

  const fetchBalances = async () => {
    setIsLoading(true);
    try {
      if (agentWalletAddress) {
        const balance = await getUSDCBalance(agentWalletAddress, client);
        setAgentBalance(balance);
      }
      if (mainAccount?.address) {
        const balance = await getUSDCBalance(mainAccount.address, client);
        setMainBalance(balance);
      }
    } catch (error) {
      console.error("Failed to fetch balances:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBalances();
    // Refresh balance every 10 seconds
    const interval = setInterval(fetchBalances, 10000);
    return () => clearInterval(interval);
  }, [agentWalletAddress, mainAccount?.address]);

  const handleRefresh = () => {
    fetchBalances();
    onRefresh?.();
  };

  if (!agentWalletAddress) {
    return null;
  }

  const shortAddress = `${agentWalletAddress.slice(0, 6)}...${agentWalletAddress.slice(-4)}`;

  return (
    <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="text-xl">🤖</span>
            Agent Wallet
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100"
          >
            {isLoading ? "..." : "↻"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Agent Wallet Info */}
        <div className="bg-white/60 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Address:</span>
            <code className="text-xs bg-slate-100 px-2 py-1 rounded font-mono">
              {shortAddress}
            </code>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">USDC Balance:</span>
            <span className="text-lg font-bold text-emerald-600">
              {formatUSDCBalance(agentBalance)}
            </span>
          </div>
        </div>

        {/* Main Wallet Reference */}
        {mainAccount && (
          <div className="text-xs text-slate-500 flex items-center justify-between">
            <span>Your main wallet:</span>
            <span>{formatUSDCBalance(mainBalance)} USDC</span>
          </div>
        )}

        {/* Withdraw Button */}
        {showWithdraw && agentBalance > BigInt(0) && (
          <Button
            variant="outline"
            size="sm"
            onClick={onWithdraw}
            className="w-full text-emerald-600 border-emerald-300 hover:bg-emerald-50"
          >
            Withdraw to Main Wallet
          </Button>
        )}

        {/* Warning */}
        <p className="text-xs text-amber-600 bg-amber-50 rounded p-2">
          ⚠️ This is a hot wallet for agent spending. Only fund with small amounts.
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Compact version for inline display
 */
export function WalletBalanceCompact({
  agentWalletAddress,
}: {
  agentWalletAddress: string | null;
}) {
  const [balance, setBalance] = useState<bigint>(BigInt(0));

  useEffect(() => {
    if (agentWalletAddress) {
      getUSDCBalance(agentWalletAddress, client).then(setBalance);
    }
  }, [agentWalletAddress]);

  if (!agentWalletAddress) return null;

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-slate-500">Agent Balance:</span>
      <span className="font-medium text-emerald-600">
        {formatUSDCBalance(balance)}
      </span>
    </div>
  );
}

