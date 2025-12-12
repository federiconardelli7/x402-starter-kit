"use client";

import { cn } from "@/lib/utils";

export type PaymentMode = "human" | "ai-agent";

interface ModeNavigationProps {
  activeMode: PaymentMode;
  onModeChange: (mode: PaymentMode) => void;
}

export function ModeNavigation({ activeMode, onModeChange }: ModeNavigationProps) {
  return (
    <div className="flex justify-center">
      <div className="inline-flex items-center gap-1 p-1 bg-slate-900 rounded-full">
        <button
          onClick={() => onModeChange("human")}
          className={cn(
            "px-6 py-2 rounded-full text-sm font-medium transition-all duration-200",
            activeMode === "human"
              ? "bg-red-500 text-white shadow-lg"
              : "text-slate-400 hover:text-slate-200"
          )}
        >
          Human Payment
        </button>
        <button
          onClick={() => onModeChange("ai-agent")}
          className={cn(
            "px-6 py-2 rounded-full text-sm font-medium transition-all duration-200",
            activeMode === "ai-agent"
              ? "bg-red-500 text-white shadow-lg"
              : "text-slate-400 hover:text-slate-200"
          )}
        >
          AI Agents
        </button>
      </div>
    </div>
  );
}
