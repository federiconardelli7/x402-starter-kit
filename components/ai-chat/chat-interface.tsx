"use client";

import { useState } from "react";
import { createThirdwebClient } from "thirdweb";
import { useActiveWallet } from "thirdweb/react";
import { wrapFetchWithPayment } from "thirdweb/x402";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./message-bubble";
import { TokenDisplay } from "./token-display";
import { createNormalizedFetch } from "@/lib/payment";
import { AVALANCHE_FUJI_CHAIN_ID, API_ENDPOINTS, TOKEN_PRICING } from "@/lib/constants";
import { formatUSDCShort } from "@/lib/token-pricing";

const client = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID!,
});

// Max cap for payment authorization - actual charge is based on token usage
const MAX_PAYMENT = BigInt(TOKEN_PRICING.MAX_CHAT_PAYMENT); // $0.50

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  tokens?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  formattedCost?: string;
}

export function ChatInterface() {
  const wallet = useActiveWallet();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [totalSpent, setTotalSpent] = useState(0);

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading || !wallet) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // Use wrapFetchWithPayment - handles 402 → payment → retry automatically
      const normalizedFetch = createNormalizedFetch(AVALANCHE_FUJI_CHAIN_ID);
      const fetchWithPay = wrapFetchWithPayment(
        normalizedFetch,
        client,
        wallet,
        { maxValue: MAX_PAYMENT }
      );

      const response = await fetchWithPay(API_ENDPOINTS.AI_CHAT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: userMessage.content }),
      });

      const data = await response.json();

      if (response.status === 200 && data.response) {
        // Add assistant message
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.response,
          tokens: data.tokens,
          formattedCost: data.formattedCost,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setTotalSpent((prev) => prev + (data.cost || 1000));
      } else {
        throw new Error(data.error || "Failed to get response");
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: `Error: ${error instanceof Error ? error.message : "Failed to get response"}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">AI Chat (Pay-per-Message)</CardTitle>
          {totalSpent > 0 && (
            <div className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
              Total spent: {formatUSDCShort(totalSpent)}
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Pay based on actual token usage ($0.001 per 1K tokens). Max cap: $0.50 per message.
        </p>
      </CardHeader>

      <CardContent className="p-0">
        <ScrollArea className="h-[400px] px-4">
          <div className="space-y-4 py-4">
            {messages.length === 0 ? (
              <div className="text-center text-slate-400 py-12">
                <p>Send a message to start chatting</p>
                <p className="text-xs mt-1">Pay only for tokens used</p>
              </div>
            ) : (
              messages.map((message) => (
                <div key={message.id} className="space-y-2">
                  <MessageBubble
                    role={message.role}
                    content={message.content}
                  />
                  {message.role === "assistant" && message.tokens && (
                    <div className="pl-2">
                      <TokenDisplay
                        inputTokens={message.tokens.inputTokens}
                        outputTokens={message.tokens.outputTokens}
                        totalTokens={message.tokens.totalTokens}
                        formattedCost={message.formattedCost || "$0.001"}
                      />
                    </div>
                  )}
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-100 rounded-2xl rounded-bl-md px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:0.1s]" />
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>

      <CardFooter className="flex-col gap-3 pt-3 border-t">
        {!wallet && (
          <div className="w-full bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
            <p className="text-sm text-amber-800">Connect your wallet to chat</p>
          </div>
        )}

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
            placeholder={wallet ? "Type your message..." : "Connect wallet first"}
            disabled={isLoading || !wallet}
            className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-400"
          />
          <Button
            onClick={handleSendMessage}
            disabled={!input.trim() || isLoading || !wallet}
            size="sm"
          >
            Send
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
