import {
  PBKDF2_ITERS,
  PBKDF2_LEGACY_ITERS,
  aesGcmDecrypt,
  aesGcmEncrypt,
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  generateMnemonic12,
  isValidMnemonic,
  keypairFromMnemonic,
  keypairFromPrivateKeyB64,
} from './crypto';
import {
  PROXY_URL,
  UPSTREAM_RELAYER,
} from '../../../shared/constants';

const VAULT_KEY_V1 = 'octra:vault:v1';      // legacy single-account vault
const VAULT_KEY    = 'octra:vault:v2';      // current multi-account vault
const SETTINGS_KEY = 'octra:settings:v1';
const SESSION_KEY  = 'octra:session:v2';

// ---------------- public types ----------------

export type AccountSource = 'generated' | 'imported-mnemonic' | 'imported-priv';

export interface AccountInVault {
  id: string;
  label: string;
  address: string;
  publicKeyB64: string;
  privSeed32B64: string;
  source: AccountSource;
  /** present iff this account was derived from a 12+ word mnemonic */
  mnemonic?: string;
  /** if generated from the vault's hdMaster, the index used */
  hdIndex?: number;
  createdAt: number;
}

/** Public-safe view (no private material) — what the popup UI sees. */
export interface AccountPublic {
  id: string;
  label: string;
  address: string;
  source: AccountSource;
  hdIndex?: number;
  /** true if a mnemonic export is possible (account has its own mnemonic) */
  hasMnemonic: boolean;
  createdAt: number;
}

export interface VaultPlaintextV2 {
  version: 2;
  accounts: AccountInVault[];
  activeAccountId: string;
  /** master mnemonic + next free HD index, used by 'generate new account' so
   *  every HD-derived account is recoverable from this single seed */
  hdMaster?: { mnemonic: string; nextHdIndex: number };
}

export interface VaultBlob {
  ciphertextB64: string;
  /** non-sensitive surfacing for UI: how many accounts are inside */
  accountCount: number;
  createdAt: number;
  /** PBKDF2 iteration count used to derive the encryption key. Optional for
   *  back-compat — blobs written before this field was introduced used 250k. */
  iters?: number;
}

export interface Settings {
  rpcUrl: string;
  relayerUrl: string;
  explorerUrl: string;
  ethRpcUrl: string;
  claimUrl: string;
  /** plays the bundled punjabi.mp3 in an offscreen audio host when the user
   *  hits 'bridge to eth'. defaults to true. */
  musicEnabled: boolean;
}

export interface UnlockedSession {
  /** kept in session memory so re-encrypts on add/remove/rename don't need
   *  to re-prompt for the PIN. session storage clears on browser restart. */
  pin: string;
  accounts: Record<string, { address: string; publicKeyB64: string; privSeed32B64: string }>;
  /** cached public metadata (label, source, hdIndex, etc) so listAccountsPublic
   *  doesn't re-decrypt the vault on every STATUS call. write ops refresh it
   *  via plainToSession after they re-encrypt. */
  meta: AccountPublic[];
  activeAccountId: string;
}

// ---------------- defaults / settings ----------------

const DEFAULTS: Settings = {
  // proxy ON by default: bridge POSTs to the upstream relayer fail in
  // browsers due to a duplicate-CORS-header bug at Octra's nginx (see
  // relayer-proxy/README.md). once that's fixed upstream, default can flip.
  rpcUrl: PROXY_URL,
  relayerUrl: PROXY_URL,
  explorerUrl: 'https://octrascan.io',
  ethRpcUrl: 'https://ethereum-rpc.publicnode.com',
  claimUrl: 'https://octra.ac420.org/',
  musicEnabled: true,
};

export async function getSettings(): Promise<Settings> {
  const r = await chrome.storage.local.get(SETTINGS_KEY);
  const merged = { ...DEFAULTS, ...(r[SETTINGS_KEY] ?? {}) };
  let migrated = false;
  if (merged.ethRpcUrl === 'https://eth.llamarpc.com') {
    merged.ethRpcUrl = 'https://ethereum-rpc.publicnode.com';
    migrated = true;
  }
  if (merged.rpcUrl === 'https://octra.network' || merged.rpcUrl === 'https://octra.network/rpc') {
    merged.rpcUrl = PROXY_URL;
    migrated = true;
  }
  if (merged.relayerUrl === UPSTREAM_RELAYER) {
    merged.relayerUrl = PROXY_URL;
    migrated = true;
  }
  if (migrated) await chrome.storage.local.set({ [SETTINGS_KEY]: merged });
  return merged;
}

export async function saveSettings(s: Partial<Settings>): Promise<Settings> {
  const cur = await getSettings();
  const merged = { ...cur, ...s };
  await chrome.storage.local.set({ [SETTINGS_KEY]: merged });
  return merged;
}

// ---------------- vault read/write ----------------

export async function readVault(): Promise<VaultBlob | null> {
  const r = await chrome.storage.local.get(VAULT_KEY);
  return (r[VAULT_KEY] as VaultBlob) ?? null;
}

export async function hasVault(): Promise<boolean> {
  if ((await readVault()) != null) return true;
  // also detect v1 vaults that haven't been migrated yet
  const r = await chrome.storage.local.get(VAULT_KEY_V1);
  return r[VAULT_KEY_V1] != null;
}

async function writeVaultV2(plain: VaultPlaintextV2, pin: string): Promise<VaultBlob> {
  // Always write at the current PBKDF2_ITERS — this is the lazy migration path
  // for legacy 250k blobs: any rename/add/remove/setActive bumps them to 600k.
  const ct = await aesGcmEncrypt(JSON.stringify(plain), pin, PBKDF2_ITERS);
  const blob: VaultBlob = {
    ciphertextB64: ct,
    accountCount: plain.accounts.length,
    createdAt: Date.now(),
    iters: PBKDF2_ITERS,
  };
  await chrome.storage.local.set({ [VAULT_KEY]: blob });
  return blob;
}

export async function destroyVault(): Promise<void> {
  // Comprehensive wipe — clear() nukes EVERYTHING in the extension's
  // chrome.storage namespace, not just the specific keys we know about.
  // Stronger guarantee against any latent state we forgot to track (or
  // browser storage glitches that could leave stale entries behind).
  // Settings get reset too — small price for a true clean slate.
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
}

// ---------------- session ----------------

async function setSession(s: UnlockedSession | null): Promise<void> {
  if (s == null) await chrome.storage.session.remove(SESSION_KEY);
  else await chrome.storage.session.set({ [SESSION_KEY]: s });
}

export async function getSession(): Promise<UnlockedSession | null> {
  const r = await chrome.storage.session.get(SESSION_KEY);
  return (r[SESSION_KEY] as UnlockedSession) ?? null;
}

export async function lockVault(): Promise<void> {
  await setSession(null);
}

// ---------------- v1 → v2 migration ----------------

interface V1Plain {
  address: string;
  publicKeyB64: string;
  privSeed32B64: string;
  mnemonic?: string;
  hdIndex?: number;
  hdVersion?: 1 | 2;
}

interface V1Blob {
  ciphertextB64: string;
  address: string;
  createdAt: number;
}

async function readV1Blob(): Promise<V1Blob | null> {
  const r = await chrome.storage.local.get(VAULT_KEY_V1);
  return (r[VAULT_KEY_V1] as V1Blob) ?? null;
}

/** If a v1 vault exists, decrypt with `pin`, convert to v2, write v2, drop v1.
 *  Returns the v2 plaintext after conversion. */
async function migrateV1ToV2(pin: string): Promise<VaultPlaintextV2 | null> {
  const v1 = await readV1Blob();
  if (!v1) return null;
  let plain: V1Plain;
  try {
    // v1 blobs predate the explicit iters field; they were always 250k.
    plain = JSON.parse(await aesGcmDecrypt(v1.ciphertextB64, pin, PBKDF2_LEGACY_ITERS));
  } catch {
    throw new Error('wrong PIN');
  }
  const id = newAccountId();
  const account: AccountInVault = {
    id,
    label: 'Account 1',
    address: plain.address,
    publicKeyB64: plain.publicKeyB64,
    privSeed32B64: plain.privSeed32B64,
    source: plain.mnemonic ? 'generated' : 'imported-priv',
    mnemonic: plain.mnemonic,
    hdIndex: plain.hdIndex,
    createdAt: v1.createdAt,
  };
  const v2: VaultPlaintextV2 = {
    version: 2,
    accounts: [account],
    activeAccountId: id,
    // if v1 had a mnemonic at hdIndex 0, retain it as the master for future
    // 'generate' calls. nextHdIndex starts at the v1 hdIndex + 1.
    hdMaster: plain.mnemonic ? { mnemonic: plain.mnemonic, nextHdIndex: (plain.hdIndex ?? 0) + 1 } : undefined,
  };
  await writeVaultV2(v2, pin);
  await chrome.storage.local.remove(VAULT_KEY_V1);
  return v2;
}

// ---------------- unlock / change pin ----------------

async function decryptVault(pin: string): Promise<VaultPlaintextV2> {
  const blob = await readVault();
  if (blob) {
    // Use the iter count baked into the blob; default to legacy 250k for
    // blobs written before that field existed. The next write op (rename/
    // add/etc) will re-encrypt at the current PBKDF2_ITERS — see writeVaultV2.
    const iters = blob.iters ?? PBKDF2_LEGACY_ITERS;
    let json: string;
    try { json = await aesGcmDecrypt(blob.ciphertextB64, pin, iters); }
    catch { throw new Error('wrong PIN'); }
    return JSON.parse(json) as VaultPlaintextV2;
  }
  // try v1 → v2 migration
  const migrated = await migrateV1ToV2(pin);
  if (migrated) return migrated;
  throw new Error('no wallet');
}

function plainToSession(plain: VaultPlaintextV2, pin: string): UnlockedSession {
  const accounts: UnlockedSession['accounts'] = {};
  for (const a of plain.accounts) {
    accounts[a.id] = { address: a.address, publicKeyB64: a.publicKeyB64, privSeed32B64: a.privSeed32B64 };
  }
  return { pin, accounts, meta: plain.accounts.map(toPublic), activeAccountId: plain.activeAccountId };
}

export async function unlockVault(pin: string): Promise<{ activeAccount: AccountPublic; accounts: AccountPublic[] }> {
  const plain = await decryptVault(pin);
  const session = plainToSession(plain, pin);
  await setSession(session);
  // If the blob is still on legacy iters, transparently re-encrypt at the
  // current count. Costs one extra PBKDF2 on first unlock after upgrade,
  // then never again. No user-visible behaviour change.
  const blob = await readVault();
  if (blob && (blob.iters ?? PBKDF2_LEGACY_ITERS) !== PBKDF2_ITERS) {
    await writeVaultV2(plain, pin);
  }
  return {
    activeAccount: toPublic(plain.accounts.find((a) => a.id === plain.activeAccountId)!),
    accounts: plain.accounts.map(toPublic),
  };
}

// ---------------- account ops (require unlocked session) ----------------

async function requireSession(): Promise<UnlockedSession> {
  const s = await getSession();
  if (!s) throw new Error('locked');
  return s;
}

async function readPlainViaSession(): Promise<{ plain: VaultPlaintextV2; pin: string }> {
  const session = await requireSession();
  const plain = await decryptVault(session.pin);
  return { plain, pin: session.pin };
}

function toPublic(a: AccountInVault): AccountPublic {
  return {
    id: a.id,
    label: a.label,
    address: a.address,
    source: a.source,
    hdIndex: a.hdIndex,
    hasMnemonic: !!a.mnemonic,
    createdAt: a.createdAt,
  };
}

export async function listAccountsPublic(): Promise<{ accounts: AccountPublic[]; activeAccountId: string }> {
  // Reads from the session cache — no PBKDF2 decrypt on every call.
  // Write ops (add/rename/remove/setActive) refresh the cache via
  // plainToSession after re-encrypting, so this stays in sync.
  const session = await requireSession();
  return { accounts: session.meta, activeAccountId: session.activeAccountId };
}

export async function getActiveAccountSeed(): Promise<{ address: string; publicKeyB64: string; privSeed32B64: string }> {
  const session = await requireSession();
  const seed = session.accounts[session.activeAccountId];
  if (!seed) throw new Error('active account not found in session');
  return seed;
}

export async function getActiveAccountAddress(): Promise<string> {
  return (await getActiveAccountSeed()).address;
}

export async function setActiveAccount(id: string): Promise<AccountPublic> {
  const { plain, pin } = await readPlainViaSession();
  if (!plain.accounts.find((a) => a.id === id)) throw new Error('account not found');
  plain.activeAccountId = id;
  await writeVaultV2(plain, pin);
  await setSession(plainToSession(plain, pin));
  return toPublic(plain.accounts.find((a) => a.id === id)!);
}

export async function renameAccount(id: string, label: string): Promise<AccountPublic> {
  const trimmed = label.trim();
  if (!trimmed) throw new Error('label cannot be empty');
  if (trimmed.length > 40) throw new Error('label too long (max 40 chars)');
  const { plain, pin } = await readPlainViaSession();
  const acc = plain.accounts.find((a) => a.id === id);
  if (!acc) throw new Error('account not found');
  acc.label = trimmed;
  await writeVaultV2(plain, pin);
  // CRITICAL: refresh the session's meta cache too. listAccountsPublic
  // reads from session.meta (perf optimisation) so without this the popup
  // keeps showing the old label even though the encrypted vault has the
  // new one. every other write op already does this; this one was missed.
  await setSession(plainToSession(plain, pin));
  return toPublic(acc);
}

export async function removeAccount(id: string, confirmPin: string): Promise<{ accounts: AccountPublic[]; activeAccountId: string }> {
  const session = await requireSession();
  if (confirmPin !== session.pin) throw new Error('wrong PIN');
  const plain = await decryptVault(session.pin);
  if (plain.accounts.length <= 1) throw new Error('cannot remove the last account');
  const idx = plain.accounts.findIndex((a) => a.id === id);
  if (idx < 0) throw new Error('account not found');
  plain.accounts.splice(idx, 1);
  if (plain.activeAccountId === id) plain.activeAccountId = plain.accounts[0].id;
  await writeVaultV2(plain, session.pin);
  await setSession(plainToSession(plain, session.pin));
  return { accounts: plain.accounts.map(toPublic), activeAccountId: plain.activeAccountId };
}

export async function exportPrivateKey(id: string, confirmPin: string): Promise<{ privSeed32B64: string }> {
  const session = await requireSession();
  if (confirmPin !== session.pin) throw new Error('wrong PIN');
  const seed = session.accounts[id];
  if (!seed) throw new Error('account not found');
  return { privSeed32B64: seed.privSeed32B64 };
}

export async function exportMnemonic(id: string, confirmPin: string): Promise<{ mnemonic: string }> {
  const session = await requireSession();
  if (confirmPin !== session.pin) throw new Error('wrong PIN');
  const plain = await decryptVault(session.pin);
  const acc = plain.accounts.find((a) => a.id === id);
  if (!acc) throw new Error('account not found');
  if (!acc.mnemonic) throw new Error('this account was imported by private key — no mnemonic stored');
  return { mnemonic: acc.mnemonic };
}

// ---------------- creating accounts ----------------

function newAccountId(): string {
  // 16-char hex (8 bytes of entropy). Plenty unique for our small set.
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  return bytesToHex(buf);
}

function nextDefaultLabel(plain: VaultPlaintextV2): string {
  // 'Account N' where N is the smallest positive integer not already used
  const used = new Set<number>();
  for (const a of plain.accounts) {
    const m = /^Account (\d+)$/.exec(a.label);
    if (m) used.add(parseInt(m[1], 10));
  }
  let n = 1;
  while (used.has(n)) n++;
  return `Account ${n}`;
}

/** Initial vault creation — only for the first-ever wallet (when nothing exists). */
export async function createInitialWallet(pin: string): Promise<{ address: string; mnemonic: string }> {
  if (await hasVault()) throw new Error('vault already exists');
  const mnemonic = generateMnemonic12();
  const kp = keypairFromMnemonic(mnemonic, 0, 2);
  const id = newAccountId();
  const plain: VaultPlaintextV2 = {
    version: 2,
    accounts: [{
      id,
      label: 'Account 1',
      address: kp.address,
      publicKeyB64: bytesToBase64(kp.publicKey),
      privSeed32B64: bytesToBase64(kp.privateKey),
      source: 'generated',
      mnemonic,
      hdIndex: 0,
      createdAt: Date.now(),
    }],
    activeAccountId: id,
    hdMaster: { mnemonic, nextHdIndex: 1 },
  };
  await writeVaultV2(plain, pin);
  await setSession(plainToSession(plain, pin));
  return { address: kp.address, mnemonic };
}

export async function importInitialFromMnemonic(mnemonic: string, pin: string, hdVersion: 1 | 2 = 2): Promise<{ address: string }> {
  if (!isValidMnemonic(mnemonic)) throw new Error('invalid mnemonic');
  if (await hasVault()) throw new Error('vault already exists');
  const kp = keypairFromMnemonic(mnemonic, 0, hdVersion);
  const id = newAccountId();
  const plain: VaultPlaintextV2 = {
    version: 2,
    accounts: [{
      id,
      label: 'Account 1',
      address: kp.address,
      publicKeyB64: bytesToBase64(kp.publicKey),
      privSeed32B64: bytesToBase64(kp.privateKey),
      source: 'generated',
      mnemonic,
      hdIndex: 0,
      createdAt: Date.now(),
    }],
    activeAccountId: id,
    hdMaster: { mnemonic, nextHdIndex: 1 },
  };
  await writeVaultV2(plain, pin);
  await setSession(plainToSession(plain, pin));
  return { address: kp.address };
}

export async function importInitialFromPrivateKey(privB64: string, pin: string): Promise<{ address: string }> {
  if (await hasVault()) throw new Error('vault already exists');
  const kp = keypairFromPrivateKeyB64(privB64.trim());
  const id = newAccountId();
  const plain: VaultPlaintextV2 = {
    version: 2,
    accounts: [{
      id,
      label: 'Account 1',
      address: kp.address,
      publicKeyB64: bytesToBase64(kp.publicKey),
      privSeed32B64: bytesToBase64(kp.privateKey),
      source: 'imported-priv',
      createdAt: Date.now(),
    }],
    activeAccountId: id,
  };
  await writeVaultV2(plain, pin);
  await setSession(plainToSession(plain, pin));
  return { address: kp.address };
}

/** Generate next HD-derived account from the vault's existing master mnemonic.
 *  If no master exists (e.g. wallet was bootstrapped by importing a single
 *  private key), we generate a fresh mnemonic and store it on this account. */
export async function addGeneratedAccount(label?: string): Promise<{ account: AccountPublic; mnemonic?: string }> {
  const { plain, pin } = await readPlainViaSession();
  let mnemonic: string;
  let hdIndex: number;
  let returnedMnemonic: string | undefined;
  if (plain.hdMaster) {
    mnemonic = plain.hdMaster.mnemonic;
    hdIndex = plain.hdMaster.nextHdIndex;
  } else {
    // no master — bootstrap one with this account
    mnemonic = generateMnemonic12();
    hdIndex = 0;
    plain.hdMaster = { mnemonic, nextHdIndex: 0 };
    returnedMnemonic = mnemonic;
  }
  // Walk forward until we find an HD index whose derived address isn't already
  // in the wallet. Covers the rare case where the user previously imported the
  // same address by hand. Bumping nextHdIndex past every collision means the
  // next 'generate' click will succeed cleanly instead of repeatedly hitting
  // the same dup.
  for (let attempts = 0; attempts < 10_000; attempts++) {
    const kp = keypairFromMnemonic(mnemonic, hdIndex, 2);
    if (!plain.accounts.some((a) => a.address === kp.address)) {
      plain.hdMaster.nextHdIndex = hdIndex + 1;
      const id = newAccountId();
      const acc: AccountInVault = {
        id,
        label: label ?? nextDefaultLabel(plain),
        address: kp.address,
        publicKeyB64: bytesToBase64(kp.publicKey),
        privSeed32B64: bytesToBase64(kp.privateKey),
        source: 'generated',
        mnemonic,
        hdIndex,
        createdAt: Date.now(),
      };
      plain.accounts.push(acc);
      plain.activeAccountId = id;
      await writeVaultV2(plain, pin);
      await setSession(plainToSession(plain, pin));
      return { account: toPublic(acc), mnemonic: returnedMnemonic };
    }
    hdIndex++;
  }
  throw new Error('too many HD collisions — wallet state is unusual');
}

export async function addImportedMnemonicAccount(mnemonic: string, label?: string, hdVersion: 1 | 2 = 2): Promise<AccountPublic> {
  if (!isValidMnemonic(mnemonic)) throw new Error('invalid mnemonic');
  const { plain, pin } = await readPlainViaSession();
  const kp = keypairFromMnemonic(mnemonic, 0, hdVersion);
  if (plain.accounts.some((a) => a.address === kp.address)) {
    throw new Error('this account is already in your wallet');
  }
  const id = newAccountId();
  const acc: AccountInVault = {
    id,
    label: label ?? nextDefaultLabel(plain),
    address: kp.address,
    publicKeyB64: bytesToBase64(kp.publicKey),
    privSeed32B64: bytesToBase64(kp.privateKey),
    source: 'imported-mnemonic',
    mnemonic,
    hdIndex: 0,
    createdAt: Date.now(),
  };
  plain.accounts.push(acc);
  plain.activeAccountId = id;
  await writeVaultV2(plain, pin);
  await setSession(plainToSession(plain, pin));
  return toPublic(acc);
}

export async function addImportedPrivateKeyAccount(privB64: string, label?: string): Promise<AccountPublic> {
  const { plain, pin } = await readPlainViaSession();
  const kp = keypairFromPrivateKeyB64(privB64.trim());
  if (plain.accounts.some((a) => a.address === kp.address)) {
    throw new Error('this account is already in your wallet');
  }
  const id = newAccountId();
  const acc: AccountInVault = {
    id,
    label: label ?? nextDefaultLabel(plain),
    address: kp.address,
    publicKeyB64: bytesToBase64(kp.publicKey),
    privSeed32B64: bytesToBase64(kp.privateKey),
    source: 'imported-priv',
    createdAt: Date.now(),
  };
  plain.accounts.push(acc);
  plain.activeAccountId = id;
  await writeVaultV2(plain, pin);
  await setSession(plainToSession(plain, pin));
  return toPublic(acc);
}

// ---------------- legacy aliases (kept so old call sites still link) ----------------

export const createNewWallet = createInitialWallet;
export const importFromMnemonic = importInitialFromMnemonic;
export const importFromPrivateKey = importInitialFromPrivateKey;

export function sessionToSeed(s: { privSeed32B64: string }): Uint8Array {
  return base64ToBytes(s.privSeed32B64);
}
