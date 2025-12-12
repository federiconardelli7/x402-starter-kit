"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBudget } from "@/lib/agent-authorization";
import { AGENT_AUTHORIZATION } from "@/lib/constants";

export interface ServiceCall {
  id: string;
  service: string;
  token: string;
  result?: {
    price: number;
    change24h: number;
  };
  cost: number;
  timestamp: Date;
  status: "pending" | "success" | "error";
}

interface ServiceNetworkProps {
  serviceCalls: ServiceCall[];
  totalEarned: number;
  isProcessing: boolean;
}

export function ServiceNetwork({ serviceCalls, totalEarned, isProcessing }: ServiceNetworkProps) {
  const successfulCalls = serviceCalls.filter(c => c.status === "success");
  const pendingCalls = serviceCalls.filter(c => c.status === "pending");

  return (
    <div className="space-y-4">
      {/* Price Oracle Service Card */}
      <Card className="border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">📡</span>
              <CardTitle className="text-base">Price Oracle Agent</CardTitle>
            </div>
            <span className="text-xs font-medium text-emerald-600 bg-emerald-100 px-2 py-1 rounded-full">
              {formatBudget(AGENT_AUTHORIZATION.SERVICE_COST)}/call
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Calls received:</span>
            <span className="font-medium">{successfulCalls.length}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total earned:</span>
            <span className="font-medium text-emerald-600">{formatBudget(totalEarned)}</span>
          </div>

          {/* Live Results */}
          {successfulCalls.length > 0 && (
            <div className="space-y-2 pt-2 border-t">
              <p className="text-xs font-medium text-muted-foreground">Recent Results:</p>
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                {successfulCalls.slice(-5).reverse().map((call) => (
                  <div
                    key={call.id}
                    className="flex items-center justify-between bg-white/80 rounded-lg px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-500">✓</span>
                      <span className="font-medium">{call.token}</span>
                    </div>
                    {call.result && (
                      <div className="text-right">
                        <span className="font-mono">
                          ${call.result.price < 1
                            ? call.result.price.toFixed(4)
                            : call.result.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                        <span className={`ml-2 text-xs ${call.result.change24h >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {call.result.change24h >= 0 ? '+' : ''}{call.result.change24h.toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Processing indicator */}
          {pendingCalls.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
              Processing {pendingCalls.length} request{pendingCalls.length > 1 ? 's' : ''}...
            </div>
          )}
        </CardContent>
      </Card>

      {/* Future Services (coming soon) */}
      <Card className="border border-dashed border-slate-300 bg-slate-50/50 opacity-60">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🔮</span>
              <CardTitle className="text-base text-slate-500">Analysis Agent</CardTitle>
            </div>
            <span className="text-xs text-slate-400">Coming Soon</span>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-400">AI-powered market analysis and insights</p>
        </CardContent>
      </Card>

      {/* Live Payment Feed */}
      {serviceCalls.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              Live Payments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-[120px] overflow-y-auto text-xs font-mono">
              {serviceCalls.slice(-8).reverse().map((call) => (
                <div
                  key={call.id}
                  className={`flex items-center gap-2 ${
                    call.status === "pending" ? "text-amber-600" :
                    call.status === "success" ? "text-slate-600" : "text-red-500"
                  }`}
                >
                  <span className="text-slate-400">
                    {call.timestamp.toLocaleTimeString()}
                  </span>
                  <span className={call.status === "success" ? "text-emerald-600" : ""}>
                    {formatBudget(call.cost)}
                  </span>
                  <span className="text-slate-400">→</span>
                  <span>Price Oracle ({call.token})</span>
                  {call.status === "pending" && <span className="animate-pulse">...</span>}
                  {call.status === "success" && <span className="text-emerald-500">✓</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
