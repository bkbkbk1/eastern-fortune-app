import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from '@solana/spl-token';
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import { TOKENS, REVENUE_WALLET, RPC_ENDPOINT, APP_IDENTITY, PaymentToken } from '../config/tokens';

const connection = new Connection(RPC_ENDPOINT, 'confirmed');

async function buildSolTransfer(sender: PublicKey): Promise<Transaction> {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: sender,
      toPubkey: REVENUE_WALLET,
      lamports: TOKENS.SOL.lamports,
    })
  );
  tx.feePayer = sender;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  return tx;
}

async function buildSplTransfer(
  sender: PublicKey,
  tokenKey: 'USDC' | 'SKR' | 'POOP'
): Promise<Transaction> {
  const token = TOKENS[tokenKey];
  const mint = token.mint!;

  const senderAta = await getAssociatedTokenAddress(mint, sender);
  const recipientAta = await getAssociatedTokenAddress(mint, REVENUE_WALLET);

  const tx = new Transaction();

  // Check if recipient ATA exists, create if not
  try {
    await getAccount(connection, recipientAta);
  } catch {
    tx.add(
      createAssociatedTokenAccountInstruction(
        sender, // payer
        recipientAta,
        REVENUE_WALLET,
        mint
      )
    );
  }

  tx.add(
    createTransferInstruction(
      senderAta,
      recipientAta,
      sender,
      token.rawAmount
    )
  );

  tx.feePayer = sender;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  return tx;
}

export async function executePayment(
  tokenKey: PaymentToken
): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    const result = await transact(async (wallet) => {
      // Authorize
      const authResult = await wallet.authorize({
        cluster: 'mainnet-beta',
        identity: APP_IDENTITY,
      });

      // MWA returns address as base64 string or Uint8Array
      const rawAddress = authResult.accounts[0].address;
      let sender: PublicKey;
      if (typeof rawAddress === 'string') {
        // base64 string → decode to bytes → PublicKey
        const bytes = Buffer.from(rawAddress, 'base64');
        sender = new PublicKey(bytes);
      } else {
        sender = new PublicKey(new Uint8Array(rawAddress));
      }

      // Build transaction
      let tx: Transaction;
      if (tokenKey === 'SOL') {
        tx = await buildSolTransfer(sender);
      } else {
        tx = await buildSplTransfer(sender, tokenKey);
      }

      // Sign and send
      const signedTxs = await wallet.signAndSendTransactions({
        transactions: [tx],
      });

      return signedTxs[0];
    });

    // Confirm transaction
    if (result) {
      // MWA may return signature as Uint8Array
      const signature = typeof result === 'string'
        ? result
        : bs58.encode(new Uint8Array(result as any));

      const confirmation = await connection.confirmTransaction(
        signature,
        'confirmed'
      );

      if (confirmation.value.err) {
        return { success: false, error: 'Transaction failed on-chain' };
      }

      return { success: true, signature };
    }

    return { success: false, error: 'No transaction signature returned' };
  } catch (error) {
    console.error('Payment error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown payment error',
    };
  }
}
