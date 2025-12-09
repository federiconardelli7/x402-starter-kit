import { settlePayment, facilitator } from "thirdweb/x402";
import { createThirdwebClient } from "thirdweb";
import { avalancheFuji } from "thirdweb/chains";
import { USDC_FUJI_ADDRESS, API_ENDPOINTS, OPENROUTER_CONFIG, TOKEN_PRICING } from "@/lib/constants";
import { calculateTokenCost, parseOpenRouterUsage, formatUSDCShort, estimateTokens } from "@/lib/token-pricing";

const client = createThirdwebClient({
  secretKey: process.env.THIRDWEB_SECRET_KEY!,
});

const thirdwebFacilitator = facilitator({
  client,
  serverWalletAddress: process.env.THIRDWEB_SERVER_WALLET_ADDRESS!,
});

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export async function POST(request: Request) {
  try {
    const clonedRequest = request.clone();
    const body = await clonedRequest.json();
    const { message } = body;

    if (!message) {
      return Response.json({ error: "Message is required" }, { status: 400 });
    }

    const paymentData = request.headers.get("x-payment");

    // STEP 1: If no payment, return 402 with MAX price ($0.50) upfront
    // User must authorize BEFORE we call OpenRouter
    if (!paymentData) {
      const result = await settlePayment({
        resourceUrl: API_ENDPOINTS.AI_CHAT,
        method: "POST",
        paymentData: null,
        payTo: process.env.MERCHANT_WALLET_ADDRESS!,
        network: avalancheFuji,
        scheme: "upto", // Variable pricing - user authorizes MAX, we charge actual
        price: {
          amount: String(TOKEN_PRICING.MAX_CHAT_PAYMENT), // $0.50 max cap
          asset: {
            address: USDC_FUJI_ADDRESS,
          },
        },
        facilitator: thirdwebFacilitator,
      });

      // This will return 402 Payment Required
      if (result.status !== 200) {
        return Response.json(result.responseBody, {
          status: result.status,
          headers: result.responseHeaders,
        });
      }
      // This shouldn't happen (no payment data means 402), but handle it
      return Response.json({ error: "Unexpected state" }, { status: 500 });
    }

    // STEP 2: Payment exists! User has authorized up to $0.50
    // NOW we can safely call OpenRouter
    const openRouterResponse = await fetch(OPENROUTER_CONFIG.API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000",
        "X-Title": "x402 AI Chat Demo",
      },
      body: JSON.stringify({
        model: OPENROUTER_CONFIG.FREE_MODEL,
        messages: [{ role: "user", content: message }],
      }),
    });

    if (!openRouterResponse.ok) {
      const errorText = await openRouterResponse.text();
      console.error("OpenRouter error:", errorText);
      return Response.json({ error: "Failed to get AI response" }, { status: 500 });
    }

    const aiData: OpenRouterResponse = await openRouterResponse.json();
    const aiMessage = aiData.choices?.[0]?.message?.content || "No response generated";

    // STEP 3: Calculate ACTUAL cost based on tokens used
    let tokenUsage = parseOpenRouterUsage(aiData);
    if (tokenUsage.totalTokens === 0) {
      // Free models don't return usage, estimate based on text length
      const inputTokens = estimateTokens(message);
      const outputTokens = estimateTokens(aiMessage);
      tokenUsage = {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      };
    }

    const actualCost = calculateTokenCost(tokenUsage.totalTokens);

    // STEP 4: Settle payment for ACTUAL cost (not max cap)
    // User signed for $0.50, but we only charge what was used
    const result = await settlePayment({
      resourceUrl: API_ENDPOINTS.AI_CHAT,
      method: "POST",
      paymentData,
      payTo: process.env.MERCHANT_WALLET_ADDRESS!,
      network: avalancheFuji,
      scheme: "upto", // Variable pricing - charge actual cost (<= signed amount)
      price: {
        amount: String(actualCost), // Actual cost based on tokens!
        asset: {
          address: USDC_FUJI_ADDRESS,
        },
      },
      facilitator: thirdwebFacilitator,
    });

    if (result.status !== 200) {
      return Response.json(result.responseBody, {
        status: result.status,
        headers: result.responseHeaders,
      });
    }

    // Success! Return AI response with cost breakdown
    return Response.json({
      response: aiMessage,
      tokens: tokenUsage,
      cost: actualCost,
      formattedCost: formatUSDCShort(actualCost),
      maxAuthorized: TOKEN_PRICING.MAX_CHAT_PAYMENT,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("AI Chat error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
