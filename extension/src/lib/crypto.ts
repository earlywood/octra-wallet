import * as ed from '@noble/ed25519';
import { sha256, sha512 } from '@noble/hashes/sha2';
import { hmac } from '@noble/hashes/hmac';
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import bs58 from 'bs58';
import { isValidOctraAddress } from '../../../shared/address';

ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

const te = new TextEncoder();

export function bytesToBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}

export function base64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}

export function deriveAddress(pubkey: Uint8Array): string {
  if (pubkey.length !== 32) throw new Error('pubkey must be 32 bytes');
  const h = sha256(pubkey);
  let b58 = bs58.encode(h);
  while (b58.length < 44) b58 = '1' + b58;
  return 'oct' + b58;
}

// Re-exported from shared so existing call sites keep working.
export const isValidAddress = isValidOctraAddress;

export interface Keypair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  address: string;
}

export function keypairFromSeed(seed32: Uint8Array): Keypair {
  if (seed32.length !== 32) throw new Error('seed must be 32 bytes');
  const publicKey = ed.getPublicKey(seed32);
  return { privateKey: seed32, publicKey, address: deriveAddress(publicKey) };
}

export function deriveHdSeed(masterSeed64: Uint8Array, index: number, hdVersion: 1 | 2 = 2): Uint8Array {
  if (masterSeed64.length !== 64) throw new Error('master seed must be 64 bytes');
  if (hdVersion === 1 && index === 0) return masterSeed64.slice(0, 32);
  const key = te.encode('Octra seed');
  if (hdVersion === 2 && index === 0) {
    return hmac(sha512, key, masterSeed64).slice(0, 32);
  }
  const data = new Uint8Array(68);
  data.set(masterSeed64, 0);
  data[64] = index & 0xff;
  data[65] = (index >> 8) & 0xff;
  data[66] = (index >> 16) & 0xff;
  data[67] = (index >> 24) & 0xff;
  return hmac(sha512, key, data).slice(0, 32);
}

export function generateMnemonic12(): string {
  return generateMnemonic(wordlist, 128);
}

export function isValidMnemonic(m: string): boolean {
  return validateMnemonic(m, wordlist);
}

export function keypairFromMnemonic(mnemonic: string, index = 0, hdVersion: 1 | 2 = 2): Keypair & { masterSeed: Uint8Array } {
  if (!validateMnemonic(mnemonic, wordlist)) throw new Error('invalid mnemonic');
  const masterSeed = mnemonicToSeedSync(mnemonic);
  const hdSeed = deriveHdSeed(masterSeed, index, hdVersion);
  const kp = keypairFromSeed(hdSeed);
  return { ...kp, masterSeed };
}

export function keypairFromPrivateKeyB64(privB64: string): Keypair {
  const raw = base64ToBytes(privB64);
  if (raw.length === 32) return keypairFromSeed(raw);
  if (raw.length === 64) {
    // tweetnacl expanded form: first 32 bytes = seed
    return keypairFromSeed(raw.slice(0, 32));
  }
  throw new Error('private key must be 32 or 64 bytes (base64)');
}

export function signEd25519(msg: Uint8Array, seed32: Uint8Array): Uint8Array {
  return ed.sign(msg, seed32);
}

// PBKDF2 iteration count. OWASP 2023 recommends 600k for SHA-256. The legacy
// value was 250k — vaults encrypted with that count are still readable because
// the iter count is now persisted in the blob (see VaultBlob.iters in wallet.ts);
// when an old blob is rewritten it gets re-encrypted at the current count.
export const PBKDF2_ITERS = 600_000;
export const PBKDF2_LEGACY_ITERS = 250_000;

function asBuf(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

async function deriveKey(pin: string, salt: Uint8Array, iters: number): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw', asBuf(te.encode(pin)), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: asBuf(salt), iterations: iters, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function aesGcmEncrypt(plaintext: string, pin: string, iters: number = PBKDF2_ITERS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt, iters);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: asBuf(iv) }, key, asBuf(te.encode(plaintext))));
  const out = new Uint8Array(salt.length + iv.length + ct.length);
  out.set(salt, 0);
  out.set(iv, salt.length);
  out.set(ct, salt.length + iv.length);
  return bytesToBase64(out);
}

export async function aesGcmDecrypt(blobB64: string, pin: string, iters: number = PBKDF2_ITERS): Promise<string> {
  const data = base64ToBytes(blobB64);
  if (data.length < 16 + 12 + 16) throw new Error('vault too small');
  const salt = data.slice(0, 16);
  const iv = data.slice(16, 28);
  const ct = data.slice(28);
  const key = await deriveKey(pin, salt, iters);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: asBuf(iv) }, key, asBuf(ct));
  return new TextDecoder().decode(pt);
}
