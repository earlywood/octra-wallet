export interface RpcOk<T = unknown> { ok: true; result: T }
export interface RpcErr { ok: false; error: string }
export type RpcResult<T = unknown> = RpcOk<T> | RpcErr;

let rpcId = 0;

export async function rpcCall<T = unknown>(url: string, method: string, params: unknown[] = [], timeoutMs = 30_000): Promise<RpcResult<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method, params, id: ++rpcId }),
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
    clearTimeout(timer);
  }
}

export interface BalanceInfo {
  balance_raw?: string;
  balance?: string | number;
  nonce?: number;
  pending_nonce?: number;
}

export const DEFAULT_RPC = 'https://octra.network';

export async function getBalance(rpc: string, addr: string) {
  return rpcCall<BalanceInfo>(rpc, 'octra_balance', [addr]);
}

export interface StagingView {
  transactions?: Array<{ from?: string; nonce?: number }>;
}
export async function stagingView(rpc: string) {
  return rpcCall<StagingView>(rpc, 'staging_view', [], 5_000);
}

export async function submitTx(rpc: string, tx: unknown) {
  return rpcCall<{ tx_hash?: string }>(rpc, 'octra_submit', [tx]);
}

export async function getTransaction(rpc: string, hash: string) {
  return rpcCall<unknown>(rpc, 'octra_transaction', [hash]);
}

export async function getTxsByAddress(rpc: string, addr: string, limit = 50, offset = 0) {
  return rpcCall<unknown>(rpc, 'octra_transactionsByAddress', [addr, limit, offset], 15_000);
}

export async function getNonceAndBalance(rpc: string, addr: string): Promise<{ nonce: number; balanceRaw: string }> {
  const r = await getBalance(rpc, addr);
  let nonce = 0;
  let balanceRaw = '0';
  if (r.ok && r.result) {
    nonce = (r.result.pending_nonce ?? r.result.nonce ?? 0) as number;
    if (typeof r.result.balance_raw === 'string') balanceRaw = r.result.balance_raw;
    else if (typeof r.result.balance_raw === 'number') balanceRaw = String(r.result.balance_raw);
    else if (r.result.balance != null) balanceRaw = parseAmountToRaw(String(r.result.balance));
  }
  const sv = await stagingView(rpc);
  if (sv.ok && sv.result?.transactions) {
    for (const tx of sv.result.transactions) {
      if (tx.from === addr && typeof tx.nonce === 'number' && tx.nonce > nonce) nonce = tx.nonce;
    }
  }
  return { nonce, balanceRaw };
}

const MICRO_PER_OCT = 1_000_000n;

export function parseAmountToRaw(s: string): string {
  s = String(s).trim();
  if (!s) return '0';
  const dot = s.indexOf('.');
  if (dot < 0) {
    if (!/^\d+$/.test(s)) throw new Error('invalid amount');
    return (BigInt(s) * MICRO_PER_OCT).toString();
  }
  const ip = s.slice(0, dot);
  let fp = s.slice(dot + 1);
  if (ip && !/^\d+$/.test(ip)) throw new Error('invalid amount');
  if (fp && !/^\d+$/.test(fp)) throw new Error('invalid amount');
  if (fp.length > 6) fp = fp.slice(0, 6);
  while (fp.length < 6) fp += '0';
  const ipN = ip ? BigInt(ip) : 0n;
  return (ipN * MICRO_PER_OCT + BigInt(fp || '0')).toString();
}

export function formatRawAmount(raw: string | bigint): string {
  const v = typeof raw === 'bigint' ? raw : BigInt(raw || '0');
  const whole = v / MICRO_PER_OCT;
  const frac = (v % MICRO_PER_OCT).toString().padStart(6, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}
