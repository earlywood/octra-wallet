export type BridgeDirection = 'o2e' | 'e2o';

export type BridgeStatus =
  | 'locked'           // OCT lock submitted, waiting confirmation
  | 'lock_confirmed'   // OCT lock on-chain, waiting epoch
  | 'epoch_known'      // we have the epoch, waiting for relayer to publish header
  | 'header_ready'     // header on ETH, ready to claim
  | 'claiming'         // claim ETH tx submitted
  | 'claimed'          // claim confirmed
  | 'approving'        // wOCT approve tx submitted
  | 'burning'          // wOCT burn tx submitted
  | 'burn_confirmed'   // burn confirmed, waiting OCT-side unlock
  | 'unlocked'         // OCT received
  | 'failed';

export interface BridgeEntry {
  id: string;
  direction: BridgeDirection;
  createdAt: number;
  amountRaw: string;            // micro-OCT for o2e; wei-derived for e2o (also represented as micro-OCT for display)
  status: BridgeStatus;

  // OCT → ETH fields
  ethRecipient?: string;
  octraLockTxHash?: string;
  epoch?: number;
  leafIndex?: number;
  claimTxHash?: string;

  // ETH → OCT fields
  octraRecipient?: string;
  ethBurnTxHash?: string;
  ethApproveTxHash?: string;

  // shared
  lastError?: string;
  updatedAt: number;
}

const KEY = 'octra:bridges:v1';

export async function listBridges(): Promise<BridgeEntry[]> {
  const r = await chrome.storage.local.get(KEY);
  const arr = (r[KEY] as BridgeEntry[]) ?? [];
  return arr.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getBridge(id: string): Promise<BridgeEntry | null> {
  const all = await listBridges();
  return all.find((e) => e.id === id) ?? null;
}

export async function upsertBridge(entry: BridgeEntry): Promise<void> {
  const all = await listBridges();
  const idx = all.findIndex((e) => e.id === entry.id);
  entry.updatedAt = Date.now();
  if (idx >= 0) all[idx] = entry;
  else all.push(entry);
  await chrome.storage.local.set({ [KEY]: all });
}

export async function patchBridge(id: string, patch: Partial<BridgeEntry>): Promise<BridgeEntry | null> {
  const all = await listBridges();
  const idx = all.findIndex((e) => e.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...patch, updatedAt: Date.now() };
  await chrome.storage.local.set({ [KEY]: all });
  return all[idx];
}

export async function deleteBridge(id: string): Promise<void> {
  const all = await listBridges();
  const filtered = all.filter((e) => e.id !== id);
  await chrome.storage.local.set({ [KEY]: filtered });
}

/** wipe every stored bridge entry. used by destroyVault so a fresh wallet
 *  doesn't inherit the previous wallet's bridge history. */
export async function clearAllBridges(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
