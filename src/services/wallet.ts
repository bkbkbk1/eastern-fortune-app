import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import { PublicKey } from '@solana/web3.js';
import { APP_IDENTITY } from '../config/tokens';

export async function connectWallet(): Promise<{ publicKey: PublicKey }> {
  const result = await transact(async (wallet) => {
    const authResult = await wallet.authorize({
      cluster: 'mainnet-beta',
      identity: APP_IDENTITY,
    });
    return {
      publicKey: new PublicKey(authResult.accounts[0].address),
    };
  });
  return result;
}
