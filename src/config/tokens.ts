import { PublicKey } from '@solana/web3.js';

export const REVENUE_WALLET = new PublicKey('JEU5P2A5KqjfMzgwBdtoVYzv81tDHjDAXwrSN7wLQDQ');

export const TOKENS = {
  SOL: {
    mint: null, // Native SOL
    decimals: 9,
    amount: 0.005, // ~$1.00
    lamports: 5_000_000, // 0.005 SOL in lamports
  },
  USDC: {
    mint: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
    decimals: 6,
    amount: 1.00,
    rawAmount: 1_000_000, // 1.00 USDC in smallest unit (6 decimals)
  },
  SKR: {
    mint: new PublicKey('SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3'),
    decimals: 6,
    amount: 15,
    rawAmount: 15_000_000, // 15 SKR (Seeker) in smallest unit (6 decimals)
  },
  POOP: {
    mint: new PublicKey('5VfRK4fgsDAsV9ajNE8qDMdhUvDueRTtRcACv2zKg5ST'),
    decimals: 0,
    amount: 50,
    rawAmount: 50, // 50 POOP (0 decimals)
  },
} as const;

export type PaymentToken = keyof typeof TOKENS;

export const RPC_ENDPOINT = 'https://api.mainnet-beta.solana.com';
export const APP_IDENTITY = {
  name: 'Eastern Fortune 2026',
  uri: 'https://saju-2026.vercel.app',
  icon: 'favicon.ico',
};
