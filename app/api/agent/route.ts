import { settlePayment, facilitator } from "thirdweb/x402";
import { createThirdwebClient } from "thirdweb";
import { avalancheFuji } from "thirdweb/chains";
import { USDC_FUJI_ADDRESS, AGENT_AUTHORIZATION } from "@/lib/constants";
import { parseRequestedToken } from "@/lib/agent-authorization";

const client = createThirdwebClient({
  secretKey: process.env.THIRDWEB_SECRET_KEY!,
});

const thirdwebFacilitator = facilitator({
  client,
  serverWalletAddress: process.env.THIRDWEB_SERVER_WALLET_ADDRESS!,
});

// CoinGecko ID mapping
const COINGECKO_IDS: Record<string, string> = {
  ETH: "ethereum",
  BTC: "bitcoin",
  AVAX: "avalanche-2",
  SOL: "solana",
  USDC: "usd-coin",
  USDT: "tether",
  LINK: "chainlink",
  UNI: "uniswap",
  AAVE: "aave",
};

async function fetchTokenPrice(symbol: string) {
  const coingeckoId = COINGECKO_IDS[symbol.toUpperCase()];
  if (!coingeckoId) {
    console.log(`Unknown token symbol: ${symbol}`);
    return null;
  }

  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd&include_24hr_change=true`;
    console.log(`Fetching from CoinGecko: ${url}`);

    const response = await fetch(url, {
      headers: { "Accept": "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(`CoinGecko API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    console.log(`CoinGecko response:`, data);

    const tokenData = data[coingeckoId];
    if (!tokenData) {
      console.error(`No data for ${coingeckoId} in response`);
      return null;
    }

    return {
      symbol: symbol.toUpperCase(),
      price: tokenData.usd,
      change24h: tokenData.usd_24h_change ? Number(tokenData.usd_24h_change.toFixed(2)) : 0,
    };
  } catch (error) {
    console.error(`Error fetching price for ${symbol}:`, error);
    return null;
  }
}

export async function POST(request: Request) {
  try {
    // Clone request to read body multiple times
    const clonedRequest = request.clone();
    const body = await clonedRequest.json();
    const { message } = body;

    if (!message) {
      return Response.json({ error: "Message is required" }, { status: 400 });
    }

    // Parse requested token first
    const requestedToken = parseRequestedToken(message);
    if (!requestedToken) {
      return Response.json({
        success: false,
        agentResponse: "I couldn't identify a cryptocurrency. Try ETH, BTC, AVAX, etc.",
        serviceUsed: false,
      });
    }

    const serviceCost = AGENT_AUTHORIZATION.SERVICE_COST;
    const paymentData = request.headers.get("x-payment");
    const resourceUrl = new URL(request.url).href;

    // STEP 1: If no payment, return 402 to trigger x402 flow
    if (!paymentData) {
      console.log("No payment data, returning 402");
      const result = await settlePayment({
        resourceUrl,
        method: "POST",
        paymentData: null,
        payTo: process.env.MERCHANT_WALLET_ADDRESS!,
        network: avalancheFuji,
        price: {
          amount: String(serviceCost), // $0.02 per service call
          asset: {
            address: USDC_FUJI_ADDRESS,
          },
        },
        facilitator: thirdwebFacilitator,
      });

      // Return 402 Payment Required
      if (result.status !== 200) {
        return Response.json(result.responseBody, {
          status: result.status,
          headers: result.responseHeaders,
        });
      }
      return Response.json({ error: "Unexpected state" }, { status: 500 });
    }

    // STEP 2: Payment exists, settle it
    console.log("Payment data received, settling payment");
    const result = await settlePayment({
      resourceUrl,
      method: "POST",
      paymentData,
      payTo: process.env.MERCHANT_WALLET_ADDRESS!,
      network: avalancheFuji,
      price: {
        amount: String(serviceCost),
        asset: {
          address: USDC_FUJI_ADDRESS,
        },
      },
      facilitator: thirdwebFacilitator,
    });

    if (result.status !== 200) {
      console.error("Payment settlement failed:", result.responseBody);
      return Response.json(result.responseBody, {
        status: result.status,
        headers: result.responseHeaders,
      });
    }

    // STEP 3: Payment successful, fetch the price data
    console.log(`Payment settled, fetching price for ${requestedToken}`);
    const priceData = await fetchTokenPrice(requestedToken);

    if (!priceData) {
      return Response.json({
        error: `Could not fetch price for ${requestedToken}`,
      }, { status: 500 });
    }

    // Format response
    const changeEmoji = priceData.change24h >= 0 ? "📈" : "📉";
    const priceStr = priceData.price < 1
      ? `$${priceData.price.toFixed(4)}`
      : `$${priceData.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

    return Response.json({
      success: true,
      agentResponse: `**${priceData.symbol}** ${changeEmoji}\n\nPrice: ${priceStr}\n24h Change: ${priceData.change24h >= 0 ? '+' : ''}${priceData.change24h}%`,
      priceData,
      serviceUsed: true,
      cost: serviceCost,
      paymentSettled: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Agent error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

