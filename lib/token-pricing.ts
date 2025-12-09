import { TOKEN_PRICING } from "./constants";

/**
 * Estimate token count from text (rough approximation)
 * Rule of thumb: ~4 characters per token for English text
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Calculate USDC cost from token count
 * Rate: $0.001 per 1000 tokens
 * Minimum: $0.001 (1000 USDC units) - x402 protocol minimum
 * Returns amount in USDC smallest units (6 decimals)
 */
export function calculateTokenCost(tokens: number): number {
  // tokens / 1000 * RATE_PER_1K_TOKENS
  const cost = Math.ceil((tokens / 1000) * TOKEN_PRICING.RATE_PER_1K_TOKENS);
  // Minimum $0.001 (1000 units) - x402 protocol requirement
  return Math.max(cost, 1000);
}

/**
 * Format USDC amount (6 decimals) to readable string
 */
export function formatUSDC(amount: number): string {
  const dollars = amount / Math.pow(10, TOKEN_PRICING.USDC_DECIMALS);
  return `$${dollars.toFixed(6)}`;
}

/**
 * Format USDC amount for display (shorter format)
 */
export function formatUSDCShort(amount: number): string {
  const dollars = amount / Math.pow(10, TOKEN_PRICING.USDC_DECIMALS);
  if (dollars < 0.01) {
    return `$${dollars.toFixed(4)}`;
  }
  return `$${dollars.toFixed(2)}`;
}

/**
 * Calculate total cost for a chat interaction
 */
export function calculateChatCost(inputText: string, outputText: string): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costInUSDC: number;
  formattedCost: string;
} {
  const inputTokens = estimateTokens(inputText);
  const outputTokens = estimateTokens(outputText);
  const totalTokens = inputTokens + outputTokens;
  const costInUSDC = calculateTokenCost(totalTokens);

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    costInUSDC,
    formattedCost: formatUSDCShort(costInUSDC),
  };
}

/**
 * Parse token usage from OpenRouter response
 * OpenRouter returns usage in the response body
 */
export function parseOpenRouterUsage(response: {
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
} {
  const usage = response.usage || {};
  return {
    inputTokens: usage.prompt_tokens || 0,
    outputTokens: usage.completion_tokens || 0,
    totalTokens: usage.total_tokens || 0,
  };
}
