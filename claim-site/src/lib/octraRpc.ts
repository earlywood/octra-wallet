let id = 0;

export interface RpcOk<T = unknown> { ok: true; result: T }
export interface RpcErr { ok: false; error: string }
export type RpcResult<T = unknown> = RpcOk<T> | RpcErr;

export async function octraRpcCall<T = unknown>(url: string, method: string, params: unknown[] = [], timeoutMs = 30_000): Promise<RpcResult<T>> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method, params, id: ++id }),
      signal: ctrl.signal,
    });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const j = await r.json();
    if ('result' in j) return { ok: true, result: j.result as T };
    if (j.error) {
      const msg = typeof j.error === 'object' ? (j.error.message ?? JSON.stringify(j.error)) : String(j.error);
      return { ok: false, error: msg };
    }
    return { ok: false, error: 'unknown rpc response' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(t);
  }
}

export interface BalanceInfo {
  balance_raw?: string;
  balance?: string | number;
}

export async function getOctraBalanceRaw(rpcUrl: string, addr: string): Promise<bigint> {
  const r = await octraRpcCall<BalanceInfo>(rpcUrl, 'octra_balance', [addr]);
  if (!r.ok || !r.result) return 0n;
  if (typeof r.result.balance_raw === 'string') return BigInt(r.result.balance_raw);
  if (typeof r.result.balance_raw === 'number') return BigInt(r.result.balance_raw);
  return 0n;
}

export async function getOctraTxEpoch(rpcUrl: string, hash: string): Promise<number | null> {
  const r = await octraRpcCall<{ epoch?: number }>(rpcUrl, 'octra_transaction', [hash], 10_000);
  if (!r.ok || !r.result) return null;
  return r.result.epoch ?? null;
}
