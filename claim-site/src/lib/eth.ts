import { ETH_BRIDGE, WOCT_ADDR, ETH_CHAIN_ID, encodeApproveCalldata, encodeBalanceOfCalldata, encodeBurnCalldata } from './bridge';

// EIP-1193 minimal provider surface
export interface Eip1193Provider {
  request<T = unknown>(args: { method: string; params?: unknown[] | object }): Promise<T>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

// EIP-6963 wallet announcement
export interface Eip6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}
export interface Eip6963ProviderDetail {
  info: Eip6963ProviderInfo;
  provider: Eip1193Provider;
}

let eip6963Listeners = new Set<(d: Eip6963ProviderDetail) => void>();
const announced: Eip6963ProviderDetail[] = [];

if (typeof window !== 'undefined') {
  window.addEventListener('eip6963:announceProvider', (e) => {
    const detail = (e as CustomEvent<Eip6963ProviderDetail>).detail;
    if (!announced.find((a) => a.info.uuid === detail.info.uuid)) {
      announced.push(detail);
      eip6963Listeners.forEach((l) => l(detail));
    }
  });
}

export function requestProviders(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

export function getAnnouncedProviders(): Eip6963ProviderDetail[] {
  return [...announced];
}

export function onProviderAnnounced(cb: (d: Eip6963ProviderDetail) => void): () => void {
  eip6963Listeners.add(cb);
  return () => { eip6963Listeners.delete(cb); };
}

export function getInjectedProvider(): Eip1193Provider | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { ethereum?: Eip1193Provider };
  return w.ethereum ?? null;
}

export async function requestAccounts(provider: Eip1193Provider): Promise<string[]> {
  return await provider.request<string[]>({ method: 'eth_requestAccounts' });
}

export async function getChainId(provider: Eip1193Provider): Promise<number> {
  const hex = await provider.request<string>({ method: 'eth_chainId' });
  return parseInt(hex, 16);
}

export async function ensureMainnet(provider: Eip1193Provider): Promise<void> {
  const cur = await getChainId(provider);
  if (cur === ETH_CHAIN_ID) return;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x' + ETH_CHAIN_ID.toString(16) }] });
  } catch {
    throw new Error('please switch your wallet to Ethereum mainnet');
  }
}

export interface SendTxParams { from: string; to: string; data: string; value?: string; gas?: string }

export async function sendTransaction(provider: Eip1193Provider, p: SendTxParams): Promise<string> {
  await ensureMainnet(provider);
  const params: Record<string, string> = { from: p.from, to: p.to, data: p.data };
  if (p.value) params.value = p.value;
  if (p.gas) params.gas = p.gas;
  return await provider.request<string>({ method: 'eth_sendTransaction', params: [params] });
}

// Reads use a CORS-friendly public RPC pinned to mainnet, NOT the wallet's own
// provider. Reasons:
//   - the wallet's chain may be Polygon/Arbitrum/Sepolia/etc when we want to
//     read a mainnet contract, in which case eth_call returns 0 silently
//     (contract doesn't exist on the foreign chain) and looks like "user has
//     0 wOCT" even though they have plenty.
//   - the wallet caches state per origin and sometimes returns stale 0s.
// Writes still go through the wallet (must — needs the user's signature).

// Fallback chain: if any one of these is rate-limiting or down, the next is
// tried. All have open CORS for browser origins as of the last check.
const FALLBACK_ETH_RPCS = [
  'https://ethereum-rpc.publicnode.com',
  'https://rpc.ankr.com/eth',
  'https://eth.llamarpc.com',
  'https://eth.merkle.io',
];

export interface EthCallResult { hex: string; rpc: string }

export async function ethCallRpc(preferredRpc: string, to: string, data: string): Promise<EthCallResult> {
  // Try the preferred URL first, then walk the fallback chain. De-dupe so we
  // don't hit the same endpoint twice.
  const seen = new Set<string>();
  const chain = [preferredRpc, ...FALLBACK_ETH_RPCS].filter((u) => {
    if (!u || seen.has(u)) return false;
    seen.add(u);
    return true;
  });
  let lastErr: Error | null = null;
  for (const url of chain) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
      });
      if (!r.ok) { lastErr = new Error(`HTTP ${r.status}`); continue; }
      const j = await r.json();
      if (j.error) { lastErr = new Error(j.error.message ?? 'eth_call failed'); continue; }
      const hex = j.result as string;
      if (typeof hex === 'string' && hex.startsWith('0x')) return { hex, rpc: url };
      lastErr = new Error('malformed result');
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr ?? new Error('all RPCs failed');
}

// Receipt polling stays on the wallet provider — public RPCs rate-limit the
// 30+ requests this loop fires per minute, and the wallet's own RPC has
// fresher mempool visibility for txs the wallet just sent.
export async function getTransactionReceipt(provider: Eip1193Provider, hash: string): Promise<{ status: string; blockNumber: string } | null> {
  return await provider.request<{ status: string; blockNumber: string } | null>({
    method: 'eth_getTransactionReceipt',
    params: [hash],
  });
}

export async function waitForReceipt(provider: Eip1193Provider, hash: string, timeoutMs = 300_000): Promise<{ status: string; blockNumber: string } | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await getTransactionReceipt(provider, hash);
      if (r) return r;
    } catch {
      // transient RPC hiccup — keep polling
    }
    await new Promise((res) => setTimeout(res, 4000));
  }
  return null;
}

export interface WoctBalanceResult { wei: bigint; hex: string; rpc: string }

export async function getWoctBalance(rpcUrl: string, holder: string): Promise<WoctBalanceResult> {
  const data = encodeBalanceOfCalldata(holder);
  const r = await ethCallRpc(rpcUrl, WOCT_ADDR, data);
  // empty '0x' (no contract on this chain) → throw instead of silently 0
  if (r.hex === '0x') throw new Error(`empty response from ${r.rpc} — wrong chain or contract removed?`);
  return { wei: BigInt(r.hex), hex: r.hex, rpc: r.rpc };
}

export async function approveWoct(provider: Eip1193Provider, from: string, amountWei: bigint): Promise<string> {
  const data = encodeApproveCalldata(ETH_BRIDGE, amountWei);
  return await sendTransaction(provider, { from, to: WOCT_ADDR, data, gas: '0x30000' });
}

export async function burnWoct(provider: Eip1193Provider, from: string, amountWei: bigint, octraRecipient: string): Promise<string> {
  const data = encodeBurnCalldata(amountWei, octraRecipient);
  return await sendTransaction(provider, { from, to: ETH_BRIDGE, data, gas: '0x40000' });
}

export async function submitClaim(provider: Eip1193Provider, from: string, calldata: string): Promise<string> {
  return await sendTransaction(provider, { from, to: ETH_BRIDGE, data: calldata, gas: '0x80000' });
}

export type ClaimSimResult =
  | { ok: true }
  | { ok: false; reason: 'replay' | 'unknown_header' | 'cap_exceeded' | 'invalid_proof' | 'other'; raw: string };

export async function simulateClaim(provider: Eip1193Provider, from: string, calldata: string): Promise<ClaimSimResult> {
  try {
    await provider.request({ method: 'eth_call', params: [{ from, to: ETH_BRIDGE, data: calldata }, 'latest'] });
    return { ok: true };
  } catch (e) {
    const err = e as { message?: string; data?: unknown };
    const msg = (err.message ?? String(e)).toLowerCase();
    const data = typeof err.data === 'string' ? err.data : '';
    let reason: 'replay' | 'unknown_header' | 'cap_exceeded' | 'invalid_proof' | 'other';
    if (msg.includes('already') || msg.includes('replay') || data === '0xb5a78004' || msg.includes('0xb5a78004')) reason = 'replay';
    else if (data === '0xa2ad39b9' || msg.includes('0xa2ad39b9')) reason = 'unknown_header';
    else if (data === '0xa4875a49' || msg.includes('0xa4875a49')) reason = 'cap_exceeded';
    else if (data === '0x09bde339' || msg.includes('0x09bde339')) reason = 'invalid_proof';
    else reason = 'other';
    return { ok: false, reason, raw: err.message ?? String(e) };
  }
}
