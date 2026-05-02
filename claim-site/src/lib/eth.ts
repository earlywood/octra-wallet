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

// Read-only via public RPC (avoids forcing wallet connection just to read balance)
export async function ethCallRpc(rpcUrl: string, to: string, data: string): Promise<string> {
  const r = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message ?? 'eth_call failed');
  return j.result as string;
}

export async function getTransactionReceipt(rpcUrl: string, hash: string): Promise<{ status: string; blockNumber: string } | null> {
  const r = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [hash] }),
  });
  const j = await r.json();
  return j.result;
}

export async function waitForReceipt(rpcUrl: string, hash: string, timeoutMs = 300_000): Promise<{ status: string; blockNumber: string } | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await getTransactionReceipt(rpcUrl, hash);
    if (r) return r;
    await new Promise((res) => setTimeout(res, 4000));
  }
  return null;
}

export async function getWoctBalance(rpcUrl: string, holder: string): Promise<bigint> {
  const data = encodeBalanceOfCalldata(holder);
  const hex = await ethCallRpc(rpcUrl, WOCT_ADDR, data);
  return BigInt(hex);
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
