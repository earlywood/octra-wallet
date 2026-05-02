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
    const r = await fetch(url, {
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
