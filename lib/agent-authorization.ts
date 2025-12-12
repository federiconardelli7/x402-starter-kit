/**
 * Format USDC amount for display
 */
export function formatBudget(amount: number): string {
  const dollars = amount / 1_000_000;
  return `$${dollars.toFixed(2)}`;
}

/**
 * Parse supported crypto symbols from user message
 */
export function parseRequestedToken(message: string): string | null {
  const tokens = ["ETH", "BTC", "AVAX", "SOL", "USDC", "USDT", "MATIC", "LINK", "UNI", "AAVE"];
  const upperMessage = message.toUpperCase();

  for (const token of tokens) {
    if (upperMessage.includes(token)) {
      return token;
    }
  }

  return null;
}
