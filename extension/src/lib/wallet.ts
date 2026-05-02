import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  base64ToBytes,
  bytesToBase64,
  generateMnemonic12,
  isValidMnemonic,
  keypairFromMnemonic,
  keypairFromPrivateKeyB64,
} from './crypto';

const VAULT_KEY = 'octra:vault:v1';
const SETTINGS_KEY = 'octra:settings:v1';
const SESSION_KEY = 'octra:session:v1';

export interface VaultPlaintext {
  address: string;
  publicKeyB64: string;
  privSeed32B64: string;
  mnemonic?: string;
  hdIndex?: number;
  hdVersion?: 1 | 2;
}

export interface VaultBlob {
  ciphertextB64: string;
  address: string;
  createdAt: number;
}

export interface Settings {
  rpcUrl: string;
  relayerUrl: string;
  explorerUrl: string;
  ethRpcUrl: string;
  claimUrl: string;
}

const DEFAULTS: Settings = {
  rpcUrl: 'https://octra.network',
  relayerUrl: 'https://relayer-002838819188.octra.network',
  explorerUrl: 'https://octrascan.io',
  ethRpcUrl: 'https://eth.llamarpc.com',
  claimUrl: 'https://octra.ac420.org/',
};

export async function getSettings(): Promise<Settings> {
  const r = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULTS, ...(r[SETTINGS_KEY] ?? {}) };
}

export async function saveSettings(s: Partial<Settings>): Promise<Settings> {
  const cur = await getSettings();
  const merged = { ...cur, ...s };
  await chrome.storage.local.set({ [SETTINGS_KEY]: merged });
  return merged;
}

export async function readVault(): Promise<VaultBlob | null> {
  const r = await chrome.storage.local.get(VAULT_KEY);
  return (r[VAULT_KEY] as VaultBlob) ?? null;
}

export async function hasVault(): Promise<boolean> {
  return (await readVault()) != null;
}

async function writeVault(plain: VaultPlaintext, pin: string): Promise<VaultBlob> {
  const ct = await aesGcmEncrypt(JSON.stringify(plain), pin);
  const blob: VaultBlob = { ciphertextB64: ct, address: plain.address, createdAt: Date.now() };
  await chrome.storage.local.set({ [VAULT_KEY]: blob });
  return blob;
}

export async function destroyVault(): Promise<void> {
  await chrome.storage.local.remove(VAULT_KEY);
  await chrome.storage.session.remove(SESSION_KEY);
}

export interface UnlockedSession {
  address: string;
  publicKeyB64: string;
  privSeed32B64: string;
}

export async function setSession(s: UnlockedSession | null): Promise<void> {
  if (s == null) await chrome.storage.session.remove(SESSION_KEY);
  else await chrome.storage.session.set({ [SESSION_KEY]: s });
}

export async function getSession(): Promise<UnlockedSession | null> {
  const r = await chrome.storage.session.get(SESSION_KEY);
  return (r[SESSION_KEY] as UnlockedSession) ?? null;
}

export async function unlockVault(pin: string): Promise<UnlockedSession> {
  const blob = await readVault();
  if (!blob) throw new Error('no wallet');
  let plain: VaultPlaintext;
  try {
    const json = await aesGcmDecrypt(blob.ciphertextB64, pin);
    plain = JSON.parse(json);
  } catch {
    throw new Error('wrong PIN');
  }
  const session: UnlockedSession = {
    address: plain.address,
    publicKeyB64: plain.publicKeyB64,
    privSeed32B64: plain.privSeed32B64,
  };
  await setSession(session);
  return session;
}

export async function lockVault(): Promise<void> {
  await setSession(null);
}

export async function createNewWallet(pin: string): Promise<{ address: string; mnemonic: string }> {
  if ((await hasVault())) throw new Error('vault already exists');
  const mnemonic = generateMnemonic12();
  const kp = keypairFromMnemonic(mnemonic, 0, 2);
  const plain: VaultPlaintext = {
    address: kp.address,
    publicKeyB64: bytesToBase64(kp.publicKey),
    privSeed32B64: bytesToBase64(kp.privateKey),
    mnemonic,
    hdIndex: 0,
    hdVersion: 2,
  };
  await writeVault(plain, pin);
  return { address: kp.address, mnemonic };
}

export async function importFromMnemonic(mnemonic: string, pin: string, hdVersion: 1 | 2 = 2): Promise<{ address: string }> {
  if (!isValidMnemonic(mnemonic)) throw new Error('invalid mnemonic');
  if ((await hasVault())) throw new Error('vault already exists');
  const kp = keypairFromMnemonic(mnemonic, 0, hdVersion);
  const plain: VaultPlaintext = {
    address: kp.address,
    publicKeyB64: bytesToBase64(kp.publicKey),
    privSeed32B64: bytesToBase64(kp.privateKey),
    mnemonic,
    hdIndex: 0,
    hdVersion,
  };
  await writeVault(plain, pin);
  return { address: kp.address };
}

export async function importFromPrivateKey(privB64: string, pin: string): Promise<{ address: string }> {
  if ((await hasVault())) throw new Error('vault already exists');
  const kp = keypairFromPrivateKeyB64(privB64.trim());
  const plain: VaultPlaintext = {
    address: kp.address,
    publicKeyB64: bytesToBase64(kp.publicKey),
    privSeed32B64: bytesToBase64(kp.privateKey),
  };
  await writeVault(plain, pin);
  return { address: kp.address };
}

export function sessionToSeed(s: UnlockedSession): Uint8Array {
  return base64ToBytes(s.privSeed32B64);
}
