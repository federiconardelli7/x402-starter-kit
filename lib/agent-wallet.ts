import { createThirdwebClient } from "thirdweb";
import { privateKeyToAccount } from "thirdweb/wallets";
import { avalancheFuji } from "thirdweb/chains";
import { getContract, readContract } from "thirdweb";
import { USDC_FUJI_ADDRESS } from "./constants";

// Storage keys
const AGENT_WALLET_KEY = "x402_agent_wallet";
const AGENT_WALLET_CREATED_KEY = "x402_agent_wallet_created";

// Simple encryption using a derived key from a password
// Note: For production, use a more robust encryption library
function simpleEncrypt(text: string, password: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const key = encoder.encode(password.padEnd(32, "0").slice(0, 32));
  
  const encrypted = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    encrypted[i] = data[i] ^ key[i % key.length];
  }
  
  return btoa(String.fromCharCode(...encrypted));
}

function simpleDecrypt(encryptedText: string, password: string): string {
  const encoder = new TextEncoder();
  const key = encoder.encode(password.padEnd(32, "0").slice(0, 32));
  
  const encrypted = Uint8Array.from(atob(encryptedText), c => c.charCodeAt(0));
  const decrypted = new Uint8Array(encrypted.length);
  
  for (let i = 0; i < encrypted.length; i++) {
    decrypted[i] = encrypted[i] ^ key[i % key.length];
  }
  
  return new TextDecoder().decode(decrypted);
}

/**
 * Generate a random private key
 */
function generatePrivateKey(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return "0x" + Array.from(array).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Derive address from private key (simplified - uses thirdweb)
 */
export async function getAddressFromPrivateKey(
  privateKey: string,
  client: ReturnType<typeof createThirdwebClient>
): Promise<string> {
  const account = privateKeyToAccount({ client, privateKey: privateKey as `0x${string}` });
  return account.address;
}

export interface AgentWalletData {
  address: string;
  encryptedPrivateKey: string;
  createdAt: number;
}

export interface AgentWallet {
  address: string;
  privateKey: string;
  createdAt: number;
}

/**
 * Check if an agent wallet exists
 */
export function hasAgentWallet(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(AGENT_WALLET_KEY) !== null;
}

/**
 * Create a new agent wallet
 * Uses the user's main wallet address as the encryption key
 */
export async function createAgentWallet(
  userAddress: string,
  client: ReturnType<typeof createThirdwebClient>
): Promise<AgentWallet> {
  const privateKey = generatePrivateKey();
  const address = await getAddressFromPrivateKey(privateKey, client);
  
  // Encrypt private key using user's address as password
  const encryptedPrivateKey = simpleEncrypt(privateKey, userAddress);
  
  const walletData: AgentWalletData = {
    address,
    encryptedPrivateKey,
    createdAt: Date.now(),
  };
  
  // Store in localStorage
  localStorage.setItem(AGENT_WALLET_KEY, JSON.stringify(walletData));
  localStorage.setItem(AGENT_WALLET_CREATED_KEY, "true");
  
  return {
    address,
    privateKey,
    createdAt: walletData.createdAt,
  };
}

/**
 * Load existing agent wallet
 */
export function loadAgentWallet(userAddress: string): AgentWallet | null {
  if (typeof window === "undefined") return null;
  
  const stored = localStorage.getItem(AGENT_WALLET_KEY);
  if (!stored) return null;
  
  try {
    const walletData: AgentWalletData = JSON.parse(stored);
    const privateKey = simpleDecrypt(walletData.encryptedPrivateKey, userAddress);
    
    return {
      address: walletData.address,
      privateKey,
      createdAt: walletData.createdAt,
    };
  } catch (error) {
    console.error("Failed to load agent wallet:", error);
    return null;
  }
}

/**
 * Get agent wallet address only (no decryption needed)
 */
export function getAgentWalletAddress(): string | null {
  if (typeof window === "undefined") return null;
  
  const stored = localStorage.getItem(AGENT_WALLET_KEY);
  if (!stored) return null;
  
  try {
    const walletData: AgentWalletData = JSON.parse(stored);
    return walletData.address;
  } catch {
    return null;
  }
}

/**
 * Delete agent wallet
 */
export function deleteAgentWallet(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AGENT_WALLET_KEY);
  localStorage.removeItem(AGENT_WALLET_CREATED_KEY);
}

/**
 * Create a thirdweb account from the agent wallet's private key
 * This account can sign transactions automatically
 */
export function createAgentAccount(
  agentWallet: AgentWallet,
  client: ReturnType<typeof createThirdwebClient>
) {
  return privateKeyToAccount({
    client,
    privateKey: agentWallet.privateKey as `0x${string}`,
  });
}

/**
 * Get USDC balance for an address
 */
export async function getUSDCBalance(
  address: string,
  client: ReturnType<typeof createThirdwebClient>
): Promise<bigint> {
  try {
    const contract = getContract({
      client,
      chain: avalancheFuji,
      address: USDC_FUJI_ADDRESS,
    });

    const balance = await readContract({
      contract,
      method: "function balanceOf(address account) view returns (uint256)",
      params: [address as `0x${string}`],
    });

    return balance;
  } catch (error) {
    console.error("Failed to get USDC balance:", error);
    return BigInt(0);
  }
}

/**
 * Format USDC balance for display
 */
export function formatUSDCBalance(balance: bigint): string {
  const dollars = Number(balance) / 1_000_000;
  return `$${dollars.toFixed(2)}`;
}

/**
 * Export agent wallet private key (for backup)
 */
export function exportAgentWallet(userAddress: string): string | null {
  const wallet = loadAgentWallet(userAddress);
  if (!wallet) return null;
  return wallet.privateKey;
}

