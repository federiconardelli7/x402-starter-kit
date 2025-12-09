// Network Configuration
export const AVALANCHE_FUJI_CHAIN_ID = 43113;

// Token Addresses (Avalanche Fuji Testnet)
export const USDC_FUJI_ADDRESS = "0x5425890298aed601595a70AB815c96711a31Bc65" as `0x${string}`;

// API Configuration
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";
export const API_ENDPOINTS = {
  BASIC: `${API_BASE_URL}/api/basic`,
  PREMIUM: `${API_BASE_URL}/api/premium`,
  AI_CHAT: `${API_BASE_URL}/api/ai-chat`,
  AGENT: `${API_BASE_URL}/api/agent`,
} as const;

// Payment Amounts (USDC with 6 decimals)
export const PAYMENT_AMOUNTS = {
  BASIC: {
    amount: "10000", // $0.01 USDC
    bigInt: BigInt(10000),
  },
  PREMIUM: {
    amount: "150000", // $0.15 USDC
    bigInt: BigInt(150000),
  },
} as const;

// Token-based pricing for AI chat (USDC with 6 decimals)
export const TOKEN_PRICING = {
  RATE_PER_1K_TOKENS: 1000, // $0.001 per 1K tokens = 1000 USDC units
  MAX_CHAT_PAYMENT: 500000, // $0.50 max cap per message
  USDC_DECIMALS: 6,
} as const;

// Agent authorization settings
export const AGENT_AUTHORIZATION = {
  SERVICE_COST: 20000, // $0.02 per service call (USDC with 6 decimals)
  DEFAULT_BUDGET: 750000, // $0.75 default budget
  DEFAULT_EXPIRY_HOURS: 1, // 1 hour default expiry
  MAX_BUDGET: 5000000, // $5.00 max budget
} as const;

// OpenRouter configuration for AI chat
export const OPENROUTER_CONFIG = {
  API_URL: "https://openrouter.ai/api/v1/chat/completions",
  FREE_MODEL: "amazon/nova-2-lite-v1:free",
} as const;
