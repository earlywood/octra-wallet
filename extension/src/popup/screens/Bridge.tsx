import { useEffect, useState } from 'react';
import { send } from '../../lib/messages';
import { formatRawAmount, parseAmountToRaw, rpcCall } from '../../lib/rpc';
import { BRIDGE_VAULT, ETH_BRIDGE, MIN_LOCK_RAW, WOCT_ADDR } from '../../lib/bridge';
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
  to?: string;
  from?: string;
  amount_raw?: string;
  message?: string;
  op_type?: string;
  epoch?: number;
}

interface RecoveryEntry { tx_hash: string; epoch: number; leaf_index: number }
interface RecoveryDoc {
  latest_scanned_epoch: number;
  by_recipient: Record<string, RecoveryEntry[]>;
}

async function fetchRecovery(relayerUrl: string): Promise<RecoveryDoc | null> {
  try {
    const r = await fetch(`${relayerUrl}/recovery.json?cb=${Date.now()}`);
    if (!r.ok) return null;
    return (await r.json()) as RecoveryDoc;
  } catch {
    return null;
  }
}

function isLockStillUnclaimed(doc: RecoveryDoc, recipient: string, lockTxHash: string): boolean {
  const wanted = lockTxHash.toLowerCase();
  const list = doc.by_recipient?.[recipient.toLowerCase()];
  if (Array.isArray(list) && list.some((e) => (e.tx_hash || '').toLowerCase() === wanted)) return true;
  // defensive: some recipient mismatch — scan all buckets
  for (const entries of Object.values(doc.by_recipient ?? {})) {
    if (Array.isArray(entries) && entries.some((e) => (e.tx_hash || '').toLowerCase() === wanted)) return true;
  }
  return false;
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
  const [showImport, setShowImport] = useState(false);
  const [importHash, setImportHash] = useState('');
  const [importing, setImporting] = useState(false);
  const [importErr, setImportErr] = useState<string | null>(null);

  async function refreshHistory() {
    setHistory(await listBridges());
  }

  // Resolve 'locked' entries to their actual on-chain state. Two sources:
  //   - octra_transaction(lock_hash): tells us if the lock reverted, and
  //     whether it's confirmed (and at what epoch).
  //   - relayer recovery.json: lists every unclaimed bridge message. if the
  //     relayer has scanned past our epoch and our tx_hash is NOT in the doc,
  //     the message has been claimed on ethereum. if it IS in the doc, claim
  //     is still pending.
  // without this, even a successfully-claimed bridge sits at 'locked' forever
  // in popup history because the claim happens on a different origin
  // (octra.ac420.org) which can't write back to chrome.storage.
  async function reconcileActive(entries: BridgeEntry[], rpcUrl: string, relayerUrl: string) {
    const candidates = entries.filter(
      (e) => e.direction === 'o2e' && e.octraLockTxHash &&
             (e.status === 'locked' || e.status === 'lock_confirmed' || e.status === 'epoch_known' || e.status === 'header_ready' || e.status === 'claiming'),
    );
    if (candidates.length === 0) return;

    const recovery = await fetchRecovery(relayerUrl);
    let any = false;

    for (const e of candidates) {
      const r = await rpcCall<OctraTxStatus>(rpcUrl, 'octra_transaction', [e.octraLockTxHash], 8_000);
      if (!r.ok || !r.result) continue;
      const tx = r.result;

      // (a) did the lock revert on-chain?
      if (tx.status === 'rejected' || tx.source === 'rejected_txs') {
        const reason = tx.error?.reason ?? tx.error?.type ?? 'reverted on octra';
        await patchBridge(e.id, { status: 'failed', lastError: reason });
        any = true;
        continue;
      }

      // (b) has the wOCT already been claimed on ethereum?
      if (recovery && tx.epoch != null) {
        const stillUnclaimed = isLockStillUnclaimed(recovery, e.ethRecipient ?? '', e.octraLockTxHash!);
        if (recovery.latest_scanned_epoch >= tx.epoch && !stillUnclaimed) {
          await patchBridge(e.id, { status: 'claimed' });
          any = true;
          continue;
        }
        // (c) at least promote 'locked' → 'lock_confirmed' so the user sees progress
        if (e.status === 'locked' && tx.status === 'confirmed') {
          await patchBridge(e.id, { status: 'lock_confirmed' });
          any = true;
        }
      }
    }
    if (any) await refreshHistory();
  }

  async function dismiss(e: BridgeEntry) {
    let msg: string;
    if (e.status === 'failed') {
      msg = 'remove this entry? the lock was reverted on-chain — no OCT was actually locked.';
    } else if (e.status === 'claimed' || e.status === 'unlocked') {
      msg = 'remove this completed bridge from history?';
    } else {
      // in-flight: warn the user that their OCT is still committed on-chain
      const tx = e.octraLockTxHash ?? '(unknown)';
      msg = 'your OCT is still locked on-chain. removing this entry only clears it from popup history — funds are NOT lost, the lock can be claimed at any time later.\n\n'
          + `to recover later, save this lock tx hash:\n${tx}\n\n`
          + '(use "+ import lock by tx hash" below to bring the entry back.)\n\nremove anyway?';
    }
    if (!confirm(msg)) return;
    await deleteBridge(e.id);
    await refreshHistory();
  }

  async function importLock() {
    setImportErr(null);
    if (!settings) { setImportErr('settings not loaded'); return; }
    const hash = importHash.trim().replace(/^0x/, '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(hash)) { setImportErr('invalid tx hash — expected 64 hex chars'); return; }
    if (history.some((e) => e.octraLockTxHash?.toLowerCase() === hash)) {
      setImportErr('that lock is already in your history below');
      return;
    }
    setImporting(true);
    try {
      const r = await rpcCall<OctraTxStatus>(settings.rpcUrl, 'octra_transaction', [hash], 10_000);
      if (!r.ok || !r.result) throw new Error(r.ok ? 'tx not found' : r.error);
      const tx = r.result;
      if (tx.to !== BRIDGE_VAULT) throw new Error('this is not a bridge lock — the recipient is not the bridge vault');
      if (tx.op_type !== 'call') throw new Error('not a contract call tx');
      if (tx.from !== address) throw new Error(`this lock was sent from ${tx.from?.slice(0, 12)}…, not your current wallet`);

      let ethRecipient: string | undefined;
      if (tx.message) {
        try {
          const params = JSON.parse(tx.message) as unknown[];
          if (Array.isArray(params) && typeof params[0] === 'string' && /^0x[0-9a-fA-F]{40}$/.test(params[0])) {
            ethRecipient = params[0].toLowerCase();
          }
        } catch { /* ignore */ }
      }
      if (!ethRecipient) throw new Error('could not parse eth recipient from the tx — is this really a lock_to_eth call?');

      const amountRaw = tx.amount_raw ?? '0';
      if (BigInt(amountRaw) <= 0n) throw new Error('lock amount is 0');

      const rejected = tx.status === 'rejected' || tx.source === 'rejected_txs';
      const status: BridgeEntry['status'] = rejected ? 'failed' : 'locked';
      const lastError = rejected ? (tx.error?.reason ?? tx.error?.type ?? 'reverted on octra') : undefined;

      await upsertBridge({
        id: newId('o2e'),
        direction: 'o2e',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        amountRaw,
        status,
        ethRecipient,
        octraLockTxHash: hash,
        ...(lastError ? { lastError } : {}),
      });
      setImportHash('');
      setShowImport(false);
      await refreshHistory();
    } catch (e) {
      setImportErr((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  useEffect(() => {
    refreshHistory();
    send<Settings>({ kind: 'GET_SETTINGS' }).then((r) => { if (r.ok) setSettings(r.data); });
    const t = setInterval(refreshHistory, 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!settings) return;
    const run = async () => { reconcileActive(await listBridges(), settings.rpcUrl, settings.relayerUrl); };
    run();
    // 15s — the recovery.json fetch is ~170KB so we don't want to hammer it,
    // and claim status doesn't change second-to-second anyway.
    const t = setInterval(run, 15000);
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
      <div style={{ marginBottom: 6 }}>
        {!showImport ? (
          <a
            href="#"
            onClick={(ev) => { ev.preventDefault(); setShowImport(true); setImportErr(null); }}
            style={{ fontSize: 11 }}
          >
            + import lock by tx hash
          </a>
        ) : (
          <div>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                placeholder="lock tx hash (64 hex)"
                value={importHash}
                onChange={(ev) => setImportHash(ev.target.value)}
                onKeyDown={(ev) => ev.key === 'Enter' && importLock()}
                style={{ flex: 1, fontSize: 11, padding: '4px 6px' }}
                autoFocus
                spellCheck={false}
              />
              <button
                onClick={importLock}
                disabled={importing || !importHash}
                style={{ padding: '4px 10px', fontSize: 11 }}
              >
                {importing ? '…' : 'import'}
              </button>
              <button
                onClick={() => { setShowImport(false); setImportErr(null); setImportHash(''); }}
                className="ghost"
                style={{ padding: '4px 8px', fontSize: 11 }}
              >
                ✕
              </button>
            </div>
            {importErr && (
              <div className="callout err" style={{ marginTop: 4, fontSize: 10, padding: 6 }}>{importErr}</div>
            )}
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
              find the hash on <a href="https://octrascan.io" target="_blank" rel="noopener noreferrer">octrascan</a> — only locks sent from your current wallet can be imported.
            </div>
          </div>
        )}
      </div>

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
                onClick={() => dismiss(e)}
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
