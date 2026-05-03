let rid = 0;

export interface RelayerOk<T = unknown> { ok: true; result: T }
export interface RelayerErr { ok: false; error: string }
export type RelayerResult<T = unknown> = RelayerOk<T> | RelayerErr;

export type RelayerMethod =
  | 'bridgeStatus'
  | 'bridgeHeader'
  | 'bridgeMessagesByEpoch'
  | 'bridgeProofByLeafIndex'
  | 'bridgeClaimCalldata';

export async function relayerCall<T = unknown>(
  url: string,
  method: RelayerMethod,
  params: unknown[] = [],
  timeoutMs = 15_000,
): Promise<RelayerResult<T>> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // The relayer is fronted by an nginx layer that caches POST responses
    // (X-Cache-Status: HIT seen in production). Once an empty bridgeHeader
    // response gets cached, every poll keeps seeing the empty version even
    // after the relayer has actually published. The ?cb=<ts> query param
    // defeats the cache because it makes each request URL-unique.
    //
    // DO NOT add Cache-Control / Pragma request headers here: the relayer's
    // CORS preflight only echoes 'Access-Control-Allow-Headers: Content-Type',
    // so adding Cache-Control causes the browser to reject the preflight and
    // the actual POST never leaves the browser. (silent fetch failure that
    // looks like 'relayer never publishes', cost ~3 hours of debugging.)
    const r = await fetch(`${url}?cb=${Date.now()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rid, method, params }),
      signal: ctrl.signal,
    });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const j = await r.json();
    if ('result' in j) return { ok: true, result: j.result as T };
    return { ok: false, error: j.error?.message ?? 'relayer error' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(t);
  }
}

export interface BridgeMessage {
  recipient: string;
  amount?: string;
  leaf_index: number;
}

export interface BridgeHeaderResult {
  message_count?: number;
}

export async function findOurMessage(relayerUrl: string, epoch: number, ethRecipient: string): Promise<BridgeMessage | null> {
  const r = await relayerCall<{ messages: BridgeMessage[] }>(relayerUrl, 'bridgeMessagesByEpoch', [epoch]);
  if (!r.ok) throw new Error(r.error);
  const want = ethRecipient.toLowerCase();
  return r.result.messages.find((m) => m.recipient.toLowerCase() === want) ?? null;
}

export async function getClaimCalldata(relayerUrl: string, epoch: number, leafIndex: number): Promise<string | null> {
  const r = await relayerCall<{ calldata: string }>(relayerUrl, 'bridgeClaimCalldata', [epoch, leafIndex]);
  if (!r.ok) throw new Error(r.error);
  return r.result?.calldata ?? null;
}

// Recovery JSON: the relayer publishes a static file at /recovery.json that
// indexes ALL unclaimed bridge messages by recipient. ~170KB, refreshed every
// 30s (verified: Cache-Control: max-age=30, Last-Modified updates each poll).
// Crucially, this file lives on a different code path than the cached
// bridgeHeader/bridgeMessagesByEpoch JSON-RPC endpoints — it's served fresh
// while those are sometimes hot-cached with stale empty responses. We use it
// as a parallel signal: if our lock tx_hash appears here, we have epoch +
// leaf_index without ever needing bridgeHeader to succeed.
export interface RecoveryEntry {
  epoch: number;
  leaf_index: number;
  amount_raw: string;
  src_nonce: number;
  message_id: string;
  tx_hash: string;
  found_at: number;
}

export interface RecoveryDoc {
  updated_at: number;
  latest_scanned_epoch: number;
  total_unclaimed: number;
  by_recipient: Record<string, RecoveryEntry[]>;
}

export async function fetchRecovery(relayerUrl: string, signal?: AbortSignal): Promise<RecoveryDoc | null> {
  try {
    // No Cache-Control / Pragma headers — relayer CORS rejects them. ?cb=ts
    // alone is enough to bypass any URL-keyed nginx cache.
    const r = await fetch(`${relayerUrl}/recovery.json?cb=${Date.now()}`, { signal });
    if (!r.ok) return null;
    return await r.json() as RecoveryDoc;
  } catch {
    return null;
  }
}

export type RecoveryLookup =
  | { kind: 'found'; epoch: number; leaf_index: number }
  | { kind: 'already_claimed' }
  | { kind: 'not_yet' };

export function findLockInRecovery(doc: RecoveryDoc, recipient: string, lockTxHash: string, ourEpoch: number): RecoveryLookup {
  const wanted = recipient.toLowerCase();
  const wantedTx = lockTxHash.toLowerCase();
  const list = doc.by_recipient?.[wanted];
  if (Array.isArray(list)) {
    const hit = list.find((e) => (e.tx_hash || '').toLowerCase() === wantedTx);
    if (hit) return { kind: 'found', epoch: hit.epoch, leaf_index: hit.leaf_index };
  }
  // not in our recipient bucket. if the relayer has scanned past our epoch,
  // that means our message was either claimed already or routed to a different
  // recipient. defensively scan ALL recipients for our tx_hash before deciding.
  if (doc.latest_scanned_epoch >= ourEpoch) {
    for (const entries of Object.values(doc.by_recipient ?? {})) {
      if (Array.isArray(entries) && entries.some((e) => (e.tx_hash || '').toLowerCase() === wantedTx)) {
        // anomaly: tx exists but under a different recipient. can't claim with our wallet — surface as not_yet.
        return { kind: 'not_yet' };
      }
    }
    return { kind: 'already_claimed' };
  }
  return { kind: 'not_yet' };
}
