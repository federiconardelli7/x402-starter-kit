"use client";

import { cn } from "@/lib/utils";

export type AIScenario = "token-chat" | "autonomous-agents";

interface ScenarioNavigationProps {
  activeScenario: AIScenario;
  onScenarioChange: (scenario: AIScenario) => void;
}

export function ScenarioNavigation({ activeScenario, onScenarioChange }: ScenarioNavigationProps) {
  return (
    <div className="flex justify-center">
      <div className="inline-flex items-center gap-2 p-1 bg-slate-100 rounded-lg border border-slate-200">
        <button
          onClick={() => onScenarioChange("token-chat")}
          className={cn(
            "px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200",
            activeScenario === "token-chat"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          )}
        >
          Token-Based Chat
        </button>
        <button
          onClick={() => onScenarioChange("autonomous-agents")}
          className={cn(
            "px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200",
            activeScenario === "autonomous-agents"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          )}
        >
          Autonomous Agents
        </button>
      </div>
    </div>
  );
}
