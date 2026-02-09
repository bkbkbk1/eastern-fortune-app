import { Linking } from 'react-native';
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from '@solana/spl-token';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { TOKENS, REVENUE_WALLET, RPC_ENDPOINT, PaymentToken } from '../config/tokens';

const connection = new Connection(RPC_ENDPOINT, 'confirmed');

const APP_URL = 'https://saju2026.com';
const REDIRECT_SCHEME = 'easternfortune';
const PHANTOM_CONNECT_URL = 'https://phantom.app/ul/v1/connect';
const PHANTOM_SIGN_SEND_URL = 'https://phantom.app/ul/v1/signAndSendTransaction';

// Session state
let dappKeyPair: nacl.BoxKeyPair | null = null;
let sharedSecret: Uint8Array | null = null;
let phantomPublicKey: PublicKey | null = null;
let sessionToken: string | null = null;

function getDappKeyPair(): nacl.BoxKeyPair {
  if (!dappKeyPair) {
    dappKeyPair = nacl.box.keyPair();
  }
  return dappKeyPair;
}

function encryptPayload(payload: object, nonce: Uint8Array): string {
  if (!sharedSecret) throw new Error('No shared secret');
  const messageBytes = Buffer.from(JSON.stringify(payload));
  const encrypted = nacl.box.after(messageBytes, nonce, sharedSecret);
  return bs58.encode(encrypted);
}

function decryptPayload(data: string, nonce: string): any {
  if (!sharedSecret) throw new Error('No shared secret');
  const decrypted = nacl.box.open.after(
    bs58.decode(data),
    bs58.decode(nonce),
    sharedSecret
  );
  if (!decrypted) throw new Error('Failed to decrypt');
  return JSON.parse(Buffer.from(decrypted).toString('utf8'));
}

function waitForDeepLink(prefix: string, timeoutMs = 120000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      sub.remove();
      reject(new Error('Timeout waiting for wallet response'));
    }, timeoutMs);

    const sub = Linking.addEventListener('url', ({ url }) => {
      if (url.startsWith(prefix)) {
        clearTimeout(timer);
        sub.remove();
        resolve(url);
      }
    });
  });
}

async function connectPhantom(): Promise<PublicKey> {
  if (phantomPublicKey && sharedSecret) {
    return phantomPublicKey;
  }

  const kp = getDappKeyPair();

  const params = new URLSearchParams({
    dapp_encryption_public_key: bs58.encode(kp.publicKey),
    cluster: 'mainnet-beta',
    app_url: APP_URL,
    redirect_link: `${REDIRECT_SCHEME}://onConnect`,
  });

  const connectUrl = `${PHANTOM_CONNECT_URL}?${params.toString()}`;
  const deepLinkPromise = waitForDeepLink(`${REDIRECT_SCHEME}://onConnect`);

  await Linking.openURL(connectUrl);
  const responseUrl = await deepLinkPromise;

  const url = new URL(responseUrl);
  const phantomPubKey = url.searchParams.get('phantom_encryption_public_key');
  const nonce = url.searchParams.get('nonce');
  const data = url.searchParams.get('data');
  const errorCode = url.searchParams.get('errorCode');

  if (errorCode) {
    throw new Error(`Phantom connect error: ${errorCode} - ${url.searchParams.get('errorMessage')}`);
  }

  if (!phantomPubKey || !nonce || !data) {
    throw new Error('Missing connect response data');
  }

  const phantomPubKeyBytes = bs58.decode(phantomPubKey);
  sharedSecret = nacl.box.before(phantomPubKeyBytes, kp.secretKey);

  const decrypted = decryptPayload(data, nonce);
  phantomPublicKey = new PublicKey(decrypted.public_key);
  sessionToken = decrypted.session;

  return phantomPublicKey;
}

async function buildTransaction(
  sender: PublicKey,
  tokenKey: PaymentToken
): Promise<Transaction> {
  const tx = new Transaction();

  if (tokenKey === 'SOL') {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: sender,
        toPubkey: REVENUE_WALLET,
        lamports: TOKENS.SOL.lamports,
      })
    );
  } else {
    const token = TOKENS[tokenKey];
    const mint = token.mint!;
    const senderAta = await getAssociatedTokenAddress(mint, sender);
    const recipientAta = await getAssociatedTokenAddress(mint, REVENUE_WALLET);

    try {
      await getAccount(connection, recipientAta);
    } catch {
      tx.add(
        createAssociatedTokenAccountInstruction(sender, recipientAta, REVENUE_WALLET, mint)
      );
    }

    tx.add(
      createTransferInstruction(senderAta, recipientAta, sender, token.rawAmount)
    );
  }

  tx.feePayer = sender;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;

  return tx;
}

export async function executePayment(
  tokenKey: PaymentToken
): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    // Step 1: Connect to Phantom
    const sender = await connectPhantom();

    // Step 2: Build transaction
    const tx = await buildTransaction(sender, tokenKey);

    // Step 3: Serialize and encrypt
    const serializedTx = tx.serialize({
      requireAllSignatures: false,
    });

    const nonce = nacl.randomBytes(24);
    const payload = {
      transaction: bs58.encode(serializedTx),
      session: sessionToken,
    };
    const encryptedPayload = encryptPayload(payload, nonce);

    const params = new URLSearchParams({
      dapp_encryption_public_key: bs58.encode(getDappKeyPair().publicKey),
      nonce: bs58.encode(nonce),
      redirect_link: `${REDIRECT_SCHEME}://onSignAndSend`,
      payload: encryptedPayload,
    });

    const signUrl = `${PHANTOM_SIGN_SEND_URL}?${params.toString()}`;
    const deepLinkPromise = waitForDeepLink(`${REDIRECT_SCHEME}://onSignAndSend`);

    await Linking.openURL(signUrl);
    const responseUrl = await deepLinkPromise;

    const url = new URL(responseUrl);
    const errorCode = url.searchParams.get('errorCode');

    if (errorCode) {
      return {
        success: false,
        error: `Transaction rejected: ${url.searchParams.get('errorMessage') || errorCode}`,
      };
    }

    const responseNonce = url.searchParams.get('nonce');
    const responseData = url.searchParams.get('data');

    if (!responseNonce || !responseData) {
      return { success: false, error: 'Missing transaction response data' };
    }

    const decrypted = decryptPayload(responseData, responseNonce);
    const signature = decrypted.signature;

    // Step 4: Confirm
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    if (confirmation.value.err) {
      return { success: false, error: 'Transaction failed on-chain' };
    }

    return { success: true, signature };
  } catch (error) {
    console.error('Payment error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown payment error',
    };
  }
}
