import { useEffect, useState } from 'react';
import { send } from '../../lib/messages';
import { formatRawAmount } from '../../lib/rpc';
import { BRIDGE_VAULT } from '../../lib/bridge';
import type { Settings } from '../../lib/wallet';

interface RawTx {
  hash: string;
  epoch?: number;
  from?: string;
  to?: string;
  amount?: string;
  amount_raw?: string;
  timestamp?: number;
  op_type?: string;
  encrypted_data?: string;
  message?: string;
  // present on rejected entries
  type?: string;
  error_type?: string;
  reason?: string;
}

interface RawHistory {
  transactions?: RawTx[];
  rejected?: RawTx[];
}

type EntryType = 'sent' | 'received' | 'bridge-lock' | 'bridge-unlock' | 'call' | 'unknown';

interface Entry {
  hash: string;
  ts: number;
  status: 'confirmed' | 'rejected';
  type: EntryType;
  amountRaw: string;
  counterparty: string;
  /** for 'call' type: method name; for rejected: revert reason */
  detail?: string;
}

interface Props { address: string }

function relTime(ts: number): string {
  const diff = (Date.now() - ts * 1000) / 1000;
  if (diff < 60) return `${Math.max(1, Math.floor(diff))}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString();
}

function shortAddr(a: string, head = 6, tail = 4) {
  return a && a.length > head + tail + 1 ? `${a.slice(0, head)}…${a.slice(-tail)}` : a;
}

function shortEthHash(h: string) {
  return h && h.length > 10 ? `${h.slice(0, 10)}…` : h;
}

// Map a raw tx to a UI Entry, given the current account address `me`.
function categorize(tx: RawTx, me: string): Entry | null {
  if (!tx.hash) return null;
  const ts = tx.timestamp ?? 0;
  const amount = tx.amount_raw ?? tx.amount ?? '0';

  // rejected? (separate array on the rpc)
  if (tx.type === 'rejected' || tx.error_type) {
    // Recipient = bridge vault is the only reliable bridge-lock signal we have
    // for rejected txs. The old heuristic ("from === me") mislabeled every
    // rejected normal send as a bridge-lock.
    const isLock = tx.to === BRIDGE_VAULT && tx.from === me;
    return {
      hash: tx.hash,
      ts,
      status: 'rejected',
      type: isLock ? 'bridge-lock' : 'sent',
      amountRaw: amount,
      counterparty: tx.to ?? '',
      detail: tx.reason ?? tx.error_type ?? 'reverted',
    };
  }

  // contract calls — recognise the bridge methods, lump everything else as 'call'
  if (tx.op_type === 'call') {
    if (tx.encrypted_data === 'lock_to_eth') {
      let ethTo = '';
      try { ethTo = (JSON.parse(tx.message ?? '[]') as string[])[0] ?? ''; } catch { /* malformed */ }
      return {
        hash: tx.hash,
        ts,
        status: 'confirmed',
        type: 'bridge-lock',
        amountRaw: amount,
        counterparty: ethTo || (tx.to ?? ''),
      };
    }
    if (tx.encrypted_data === 'unlock_trusted') {
      // payload: [recipient_oct_addr, amount_microoct, eth_burn_tx_hash]
      let recip = '', burn = '', amt = amount;
      try {
        const m = JSON.parse(tx.message ?? '[]') as string[];
        recip = m[0] ?? ''; amt = m[1] ?? amount; burn = m[2] ?? '';
      } catch { /* malformed */ }
      // only show as 'received' if we are the recipient
      if (recip !== me) return null;
      return {
        hash: tx.hash,
        ts,
        status: 'confirmed',
        type: 'bridge-unlock',
        amountRaw: amt,
        counterparty: burn,
      };
    }
    return {
      hash: tx.hash,
      ts,
      status: 'confirmed',
      type: 'call',
      amountRaw: amount,
      counterparty: tx.to ?? '',
      detail: tx.encrypted_data,
    };
  }

  // plain transfer
  if (tx.op_type === 'standard' || tx.op_type === undefined) {
    if (tx.from === me) {
      return { hash: tx.hash, ts, status: 'confirmed', type: 'sent', amountRaw: amount, counterparty: tx.to ?? '' };
    }
    if (tx.to === me) {
      return { hash: tx.hash, ts, status: 'confirmed', type: 'received', amountRaw: amount, counterparty: tx.from ?? '' };
    }
  }

  return {
    hash: tx.hash,
    ts,
    status: 'confirmed',
    type: 'unknown',
    amountRaw: amount,
    counterparty: tx.to ?? tx.from ?? '',
  };
}

const TYPE_GLYPH: Record<EntryType, string> = {
  sent: '↗',
  received: '↙',
  'bridge-lock': '⤴',     // out to eth
  'bridge-unlock': '⤵',   // back from eth
  call: '⚙',
  unknown: '·',
};

const TYPE_LABEL: Record<EntryType, string> = {
  sent: 'sent',
  received: 'received',
  'bridge-lock': 'bridge → eth',
  'bridge-unlock': 'bridge ← eth',
  call: 'contract call',
  unknown: '—',
};

export function History({ address }: Props) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);

  async function load() {
    setBusy(true);
    setErr(null);
    const [hr, sr] = await Promise.all([
      send<RawHistory>({ kind: 'GET_HISTORY', limit: 50 }),
      send<Settings>({ kind: 'GET_SETTINGS' }),
    ]);
    setBusy(false);
    if (sr.ok) setSettings(sr.data);
    if (!hr.ok) { setErr(hr.error); setEntries([]); return; }
    const raw: RawTx[] = [
      ...((hr.data.transactions ?? []) as RawTx[]),
      ...((hr.data.rejected ?? []) as RawTx[]).map((t) => ({ ...t, type: 'rejected' })),
    ];
    const parsed = raw
      .map((t) => categorize(t, address))
      .filter((e): e is Entry => e != null)
      .sort((a, b) => b.ts - a.ts);
    setEntries(parsed);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [address]);

  return (
    <div className="center">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div className="section-label" style={{ marginBottom: 0 }}>history</div>
        <button className="ghost" onClick={load} disabled={busy} style={{ padding: '4px 10px', fontSize: 11 }}>
          {busy ? '…' : 'refresh'}
        </button>
      </div>

      {err && <div className="callout err">{err}</div>}

      {entries == null && <div className="status info">loading…</div>}
      {entries != null && entries.length === 0 && !err && (
        <div className="callout">no transactions for this account yet.</div>
      )}

      {entries?.map((e) => {
        const isFail = e.status === 'rejected';
        const incoming = e.type === 'received' || e.type === 'bridge-unlock';
        const amountColor = isFail ? 'var(--err)' : incoming ? 'var(--ok)' : 'var(--text)';
        const explorerUrl = settings ? `${settings.explorerUrl}/tx.html?hash=${e.hash}` : '#';
        const isEthHash = (e.type === 'bridge-unlock') && e.counterparty.startsWith('0x');
        return (
          <a
            key={e.hash}
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="callout"
            style={{
              padding: 10,
              display: 'block',
              textDecoration: 'none',
              color: 'inherit',
              borderColor: isFail ? 'rgba(228,48,52,0.4)' : undefined,
              background: isFail ? 'rgba(228,48,52,0.05)' : undefined,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                width: 28, height: 28, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--panel2)', flexShrink: 0,
                color: amountColor, fontSize: 14,
              }}>
                {isFail ? '✕' : TYPE_GLYPH[e.type]}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 12, fontWeight: 500 }}>{TYPE_LABEL[e.type]}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: amountColor, whiteSpace: 'nowrap' }}>
                    {incoming ? '+' : e.type === 'sent' || e.type === 'bridge-lock' ? '−' : ''}{formatRawAmount(e.amountRaw)} OCT
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>
                  <span style={{ fontFamily: 'ui-monospace, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                    {e.counterparty
                      ? (isEthHash ? `eth burn ${shortEthHash(e.counterparty)}` : shortAddr(e.counterparty, 8, 6))
                      : ''}
                  </span>
                  <span style={{ flexShrink: 0 }}>{relTime(e.ts)}</span>
                </div>
                {e.detail && (
                  <div style={{ fontSize: 10, color: isFail ? 'var(--err)' : 'var(--muted)', marginTop: 2, fontStyle: 'italic' }}>
                    {e.detail}
                  </div>
                )}
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}
