import { useEffect, useState } from 'react';
import { send } from '../../lib/messages';
import { formatRawAmount, parseAmountToRaw, rpcCall } from '../../lib/rpc';
import { ETH_BRIDGE, MIN_LOCK_RAW, WOCT_ADDR } from '../../lib/bridge';
import { deleteBridge, listBridges, newId, patchBridge, upsertBridge, type BridgeEntry } from '../../lib/bridgeStore';
import type { Settings } from '../../lib/wallet';

interface Props { address: string; balanceRaw: string | null; onLockDone: () => void; }

type Dir = 'o2e' | 'e2o';

function statusLabel(s: BridgeEntry['status']): string {
  switch (s) {
    case 'locked': return 'locked';
    case 'lock_confirmed': return 'lock confirmed';
    case 'epoch_known': return 'waiting header';
    case 'header_ready': return 'ready to claim';
    case 'claiming': return 'claiming';
    case 'claimed': return 'claimed';
    case 'approving': return 'approving';
    case 'burning': return 'burning';
    case 'burn_confirmed': return 'unlocking';
    case 'unlocked': return 'unlocked';
    case 'failed': return 'failed';
  }
}

function statusColor(s: BridgeEntry['status']): string {
  if (s === 'failed') return 'var(--err)';
  if (s === 'claimed' || s === 'unlocked') return 'var(--ok)';
  return 'var(--muted)';
}

function isActive(s: BridgeEntry['status']) {
  return s !== 'claimed' && s !== 'unlocked' && s !== 'failed';
}

interface OctraTxStatus {
  status?: string;
  source?: string;
  error?: { reason?: string; type?: string };
}

function buildClaimUrl(base: string, params: Record<string, string>): string {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

export function Bridge({ address, balanceRaw, onLockDone }: Props) {
  const [dir, setDir] = useState<Dir>('o2e');
  const [amount, setAmount] = useState('');
  const [eth, setEth] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [history, setHistory] = useState<BridgeEntry[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);

  async function refreshHistory() {
    setHistory(await listBridges());
  }

  // Probe each in-flight o2e lock against the octra rpc and mark it 'failed'
  // if the node reports it rejected. without this, an entry whose lock
  // reverted (e.g., 'below minimum lock') sits at 'locked' forever in the
  // popup history with a stale resume button.
  async function reconcileActive(entries: BridgeEntry[], rpcUrl: string) {
    const candidates = entries.filter(
      (e) => e.direction === 'o2e' && e.octraLockTxHash && (e.status === 'locked' || e.status === 'lock_confirmed' || e.status === 'epoch_known'),
    );
    let any = false;
    for (const e of candidates) {
      const r = await rpcCall<OctraTxStatus>(rpcUrl, 'octra_transaction', [e.octraLockTxHash], 8_000);
      if (!r.ok || !r.result) continue;
      if (r.result.status === 'rejected' || r.result.source === 'rejected_txs') {
        const reason = r.result.error?.reason ?? r.result.error?.type ?? 'reverted on octra';
        await patchBridge(e.id, { status: 'failed', lastError: reason });
        any = true;
      }
    }
    if (any) await refreshHistory();
  }

  async function dismiss(id: string) {
    await deleteBridge(id);
    await refreshHistory();
  }

  useEffect(() => {
    refreshHistory();
    send<Settings>({ kind: 'GET_SETTINGS' }).then((r) => { if (r.ok) setSettings(r.data); });
    const t = setInterval(refreshHistory, 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!settings) return;
    const run = async () => { reconcileActive(await listBridges(), settings.rpcUrl); };
    run();
    const t = setInterval(run, 8000);
    return () => clearInterval(t);
  }, [settings]);

  function openO2eClaim(entry: BridgeEntry) {
    if (!settings) return;
    const url = buildClaimUrl(settings.claimUrl, {
      dir: 'o2e',
      id: entry.id,
      lockTx: entry.octraLockTxHash ?? '',
      amount: entry.amountRaw,
      recipient: entry.ethRecipient ?? '',
      rpc: settings.rpcUrl,
      relayer: settings.relayerUrl,
      explorer: settings.explorerUrl,
      ethRpc: settings.ethRpcUrl,
    });
    chrome.tabs.create({ url });
  }

  function openE2oFlow() {
    if (!settings) return;
    const url = buildClaimUrl(settings.claimUrl, {
      dir: 'e2o',
      octraRecipient: address,
      rpc: settings.rpcUrl,
      ethRpc: settings.ethRpcUrl,
    });
    chrome.tabs.create({ url });
  }

  function reopenEntry(entry: BridgeEntry) {
    if (entry.direction === 'o2e') openO2eClaim(entry);
    else openE2oFlow();
  }

  async function doLock() {
    setErr(null);
    if (!settings) { setErr('settings not loaded'); return; }
    if (!/^0x[0-9a-fA-F]{40}$/.test(eth)) { setErr('invalid eth recipient'); return; }
    let amountRaw: string;
    try { amountRaw = parseAmountToRaw(amount); } catch { setErr('invalid amount (max 6 decimals)'); return; }
    if (BigInt(amountRaw) <= 0n) { setErr('amount must be > 0'); return; }
    if (BigInt(amountRaw) < MIN_LOCK_RAW) {
      setErr(`bridge minimum is ${formatRawAmount(MIN_LOCK_RAW.toString())} OCT — anything less reverts on-chain`);
      return;
    }
    setBusy(true);
    const r = await send<{ tx_hash?: string }>({
      kind: 'BRIDGE_LOCK',
      ethRecipient: eth,
      amountRaw,
    });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    if (!r.data.tx_hash) { setErr('lock submitted but no tx hash returned'); return; }

    const id = newId('o2e');
    const entry: BridgeEntry = {
      id,
      direction: 'o2e',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      amountRaw,
      status: 'locked',
      ethRecipient: eth,
      octraLockTxHash: r.data.tx_hash,
    };
    await upsertBridge(entry);
    onLockDone();
    refreshHistory();
    openO2eClaim(entry);
    setAmount('');
  }

  return (
    <div className="center">
      <div className="tabs" style={{ borderBottom: 'none', marginBottom: 4 }}>
        <button className={dir === 'o2e' ? 'active' : ''} onClick={() => setDir('o2e')}>OCT → wOCT</button>
        <button className={dir === 'e2o' ? 'active' : ''} onClick={() => setDir('e2o')}>wOCT → OCT</button>
      </div>

      {dir === 'o2e' && (
        <>
          <div className="callout">
            lock OCT on octra → mint wOCT on ethereum.
            <div className="status info" style={{ marginTop: 4 }}>
              your balance: {balanceRaw == null ? '—' : formatRawAmount(balanceRaw)} OCT
            </div>
          </div>
          <div>
            <label htmlFor="bridge-amount">amount (OCT)</label>
            <input id="bridge-amount" name="amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" inputMode="decimal" autoComplete="off" />
          </div>
          <div>
            <label htmlFor="bridge-eth-recipient">ethereum recipient (0x…)</label>
            <input id="bridge-eth-recipient" name="ethRecipient" value={eth} onChange={(e) => setEth(e.target.value.trim())} placeholder="0x…" autoComplete="off" />
          </div>
          {err && <div className="callout err">{err}</div>}
          <button onClick={doLock} disabled={busy || !amount || !eth}>{busy ? 'locking…' : 'lock OCT and open claim'}</button>
        </>
      )}

      {dir === 'e2o' && (
        <>
          <div className="callout">
            burn wOCT on ethereum → unlock OCT on octra. opens a new tab where your browser wallet (MetaMask, Rabby, etc.) signs the eth transactions natively.
          </div>
          <div className="kv"><span className="k">your octra address (recipient)</span></div>
          <div className="callout mono" style={{ fontSize: 11 }}>{address}</div>
          <button onClick={openE2oFlow}>open burn flow →</button>
          <hr />
          <div className="section-label">contracts</div>
          <div className="kv">
            <span className="k">wOCT</span>
            <a className="mono" href={`https://etherscan.io/token/${WOCT_ADDR}`} target="_blank" rel="noopener noreferrer">
              {WOCT_ADDR}
            </a>
          </div>
          <div className="kv">
            <span className="k">eth bridge</span>
            <a className="mono" href={`https://etherscan.io/address/${ETH_BRIDGE}`} target="_blank" rel="noopener noreferrer">
              {ETH_BRIDGE}
            </a>
          </div>
        </>
      )}

      <hr />
      <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: 0.4, marginBottom: 4 }}>recent bridges</div>
      {history.length === 0 && <div className="status info">no bridge activity yet.</div>}
      {history.slice(0, 6).map((e) => (
        <div key={e.id} className="callout" style={{ padding: 8, fontSize: 11 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 500 }}>
                {e.direction === 'o2e' ? '→ wOCT' : '→ OCT'} {formatRawAmount(e.amountRaw)}
              </div>
              <div style={{ fontSize: 10, color: statusColor(e.status) }}>
                {statusLabel(e.status)} · {new Date(e.updatedAt).toLocaleTimeString()}
              </div>
              {e.status === 'failed' && e.lastError && (
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }} title={e.lastError}>
                  {e.lastError.length > 56 ? e.lastError.slice(0, 56) + '…' : e.lastError}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              {isActive(e.status) && (
                <button onClick={() => reopenEntry(e)} style={{ padding: '4px 8px', fontSize: 11 }}>
                  resume
                </button>
              )}
              <button
                onClick={() => dismiss(e.id)}
                className="ghost"
                title="remove from history"
                style={{ padding: '4px 8px', fontSize: 11 }}
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
