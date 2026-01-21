import { settlePayment, facilitator } from "thirdweb/x402";
import { createThirdwebClient } from "thirdweb";
import { avalancheFuji } from "thirdweb/chains";
import { USDC_FUJI_ADDRESS, PAYMENT_AMOUNTS } from "@/lib/constants";

const client = createThirdwebClient({
  secretKey: process.env.THIRDWEB_SECRET_KEY!,
});

const thirdwebFacilitator = facilitator({
  client,
  serverWalletAddress: process.env.THIRDWEB_SERVER_WALLET_ADDRESS!,
});

export async function GET(request: Request) {
  const paymentData = request.headers.get("x-payment");
  const resourceUrl = new URL(request.url).href;

  const result = await settlePayment({
    resourceUrl,
    method: "GET",
    paymentData,
    payTo: process.env.MERCHANT_WALLET_ADDRESS!,
    network: avalancheFuji,
    price: {
      amount: PAYMENT_AMOUNTS.BASIC.amount,
      asset: {
        address: USDC_FUJI_ADDRESS,
      },
    },
    facilitator: thirdwebFacilitator,
  });

  // Debug logging for payment settlement
  console.log('=== Payment Settlement Debug ===');
  console.log('Status:', result.status);
  console.log('Payment Data received:', paymentData ? 'yes' : 'no');
  console.log('Resource URL:', resourceUrl);
  if (result.status === 200) {
    console.log('Payment Receipt:', JSON.stringify(result.paymentReceipt, null, 2));
  } else {
    console.log('Response Body:', JSON.stringify(result.responseBody, null, 2));
  }
  console.log('================================');

  if (result.status === 200) {
    return Response.json({
      tier: "basic",
      data: "Welcome to Basic tier! You now have access to standard features.",
      timestamp: new Date().toISOString(),
    });
  } else {
    return Response.json(result.responseBody, {
      status: result.status,
      headers: result.responseHeaders,
    });
  }
}
