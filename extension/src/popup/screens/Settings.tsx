import { useEffect, useState } from 'react';
import { send } from '../../lib/messages';
import { PROXY_URL, UPSTREAM_OCTRA_RPC, UPSTREAM_RELAYER, type Settings as SettingsT, type AccountPublic } from '../../lib/wallet';
import { Identicon } from '../Identicon';

interface Props { onAccountsChanged: () => void }

type Tab = 'network' | 'accounts';

export function Settings({ onAccountsChanged }: Props) {
  const [tab, setTab] = useState<Tab>('network');

  return (
    <div className="center" style={{ gap: 8 }}>
      <div className="tabs" style={{ marginTop: -4 }}>
        <button className={tab === 'network' ? 'active' : ''} onClick={() => setTab('network')}>network</button>
        <button className={tab === 'accounts' ? 'active' : ''} onClick={() => setTab('accounts')}>accounts</button>
      </div>
      {tab === 'network' && <NetworkTab />}
      {tab === 'accounts' && <AccountsTab onAccountsChanged={onAccountsChanged} />}
    </div>
  );
}

// ---------------- network tab (existing settings) ----------------

function NetworkTab() {
  const [s, setS] = useState<SettingsT | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    send<SettingsT>({ kind: 'GET_SETTINGS' }).then((r) => { if (r.ok) setS(r.data); });
  }, []);

  if (!s) return <div className="status info">loading…</div>;

  // Toggle is derived from URL state — if BOTH endpoints point at the proxy
  // it's "on", otherwise "off" (covers direct upstream and any custom URL).
  const usingProxy = s.rpcUrl === PROXY_URL && s.relayerUrl === PROXY_URL;
  function toggleProxy() {
    if (!s) return;
    if (usingProxy) {
      setS({ ...s, rpcUrl: UPSTREAM_OCTRA_RPC, relayerUrl: UPSTREAM_RELAYER });
    } else {
      setS({ ...s, rpcUrl: PROXY_URL, relayerUrl: PROXY_URL });
    }
  }

  async function save() {
    if (!s) return;
    setMsg(null);
    const r = await send({ kind: 'SAVE_SETTINGS', settings: s });
    setMsg(r.ok ? 'saved' : `error: ${r.error}`);
    setTimeout(() => setMsg(null), 2000);
  }

  return (
    <>
      <div className="callout">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 500, fontSize: 12 }}>cloudflare proxy</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              routes octra rpc + bridge relayer requests through a CF worker. needed in browsers because the upstream relayer returns malformed CORS headers — see <code>relayer-proxy/</code>.
            </div>
          </div>
          <button
            type="button"
            className={`toggle${usingProxy ? ' on' : ''}`}
            onClick={toggleProxy}
            aria-pressed={usingProxy}
            aria-label="toggle cloudflare proxy"
          />
        </div>
        {!usingProxy && (
          <div className="callout warn" style={{ marginTop: 8, fontSize: 11, padding: '8px 10px' }}>
            direct mode: bridge POSTs from browsers currently fail due to the upstream CORS bug. turn this on if your bridge isn't working.
          </div>
        )}
      </div>

      <div>
        <label htmlFor="set-rpc">octra rpc</label>
        <input id="set-rpc" name="rpcUrl" autoComplete="off" value={s.rpcUrl} onChange={(e) => setS({ ...s, rpcUrl: e.target.value })} />
      </div>
      <div>
        <label htmlFor="set-relayer">bridge relayer</label>
        <input id="set-relayer" name="relayerUrl" autoComplete="off" value={s.relayerUrl} onChange={(e) => setS({ ...s, relayerUrl: e.target.value })} />
      </div>
      <div>
        <label htmlFor="set-explorer">explorer</label>
        <input id="set-explorer" name="explorerUrl" autoComplete="off" value={s.explorerUrl} onChange={(e) => setS({ ...s, explorerUrl: e.target.value })} />
      </div>
      <div>
        <label htmlFor="set-ethrpc">ethereum rpc (read-only, used to check wOCT balance)</label>
        <input id="set-ethrpc" name="ethRpcUrl" autoComplete="off" value={s.ethRpcUrl} onChange={(e) => setS({ ...s, ethRpcUrl: e.target.value })} />
      </div>
      <div>
        <label htmlFor="set-claimurl">bridge claim page</label>
        <input id="set-claimurl" name="claimUrl" autoComplete="off" value={s.claimUrl} onChange={(e) => setS({ ...s, claimUrl: e.target.value })} placeholder="https://you.github.io/octra-claim/" />
        <div className="status info" style={{ marginTop: 4 }}>
          static page that handles the ethereum side of the bridge with your browser wallet. open-source — see the project's <code>claim-site/</code> directory.
        </div>
      </div>
      {msg && <div className="status info">{msg}</div>}
      <button onClick={save}>save</button>
    </>
  );
}

// ---------------- accounts tab ----------------

function AccountsTab({ onAccountsChanged }: { onAccountsChanged: () => void }) {
  const [accounts, setAccounts] = useState<AccountPublic[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null); // id of expanded row
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // for export / delete confirmation
  const [confirm, setConfirm] = useState<null | { kind: 'priv' | 'mnemonic' | 'delete'; id: string; label: string }>(null);
  const [confirmPin, setConfirmPin] = useState('');
  const [revealed, setRevealed] = useState<{ kind: 'priv' | 'mnemonic'; value: string } | null>(null);

  async function refresh() {
    const r = await send<{ accounts: AccountPublic[]; activeAccountId: string }>({ kind: 'LIST_ACCOUNTS' });
    if (r.ok) {
      setAccounts(r.data.accounts);
      setActiveId(r.data.activeAccountId);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function rename(id: string) {
    setBusy(true);
    const r = await send({ kind: 'RENAME_ACCOUNT', id, label: editLabel });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setEditingId(null);
    setOpenMenu(null);
    setErr(null);
    await refresh();
    onAccountsChanged();
  }

  async function runConfirm() {
    if (!confirm) return;
    setErr(null); setBusy(true);
    if (confirm.kind === 'priv') {
      const r = await send<{ privSeed32B64: string }>({ kind: 'EXPORT_PRIVATE_KEY', id: confirm.id, pin: confirmPin });
      setBusy(false);
      if (!r.ok) { setErr(r.error); return; }
      setRevealed({ kind: 'priv', value: r.data.privSeed32B64 });
      setConfirm(null);
      setConfirmPin('');
    } else if (confirm.kind === 'mnemonic') {
      const r = await send<{ mnemonic: string }>({ kind: 'EXPORT_MNEMONIC', id: confirm.id, pin: confirmPin });
      setBusy(false);
      if (!r.ok) { setErr(r.error); return; }
      setRevealed({ kind: 'mnemonic', value: r.data.mnemonic });
      setConfirm(null);
      setConfirmPin('');
    } else {
      const r = await send({ kind: 'REMOVE_ACCOUNT', id: confirm.id, pin: confirmPin });
      setBusy(false);
      if (!r.ok) { setErr(r.error); return; }
      setConfirm(null);
      setConfirmPin('');
      await refresh();
      onAccountsChanged();
    }
  }

  if (!accounts) return <div className="status info">loading…</div>;

  if (revealed) {
    return (
      <>
        <div className="callout warn">
          {revealed.kind === 'priv'
            ? 'this is your private key. anyone with it controls this account. do not share it with anyone or any website.'
            : 'this is your seed phrase. anyone with it controls every HD-derived account from this seed.'}
        </div>
        <div className="callout mono" style={{ lineHeight: 1.7, fontSize: 11 }}>{revealed.value}</div>
        <div className="row">
          <button className="ghost" onClick={() => { navigator.clipboard.writeText(revealed.value); }}>copy</button>
          <button onClick={() => setRevealed(null)}>done</button>
        </div>
      </>
    );
  }

  if (confirm) {
    const verb = confirm.kind === 'delete' ? 'remove' : 'reveal';
    return (
      <>
        <div className="callout warn">
          confirm with your PIN to {verb} <strong>{confirm.label}</strong>{confirm.kind === 'delete' ? '. this cannot be undone — back up the seed or private key first if you want recovery.' : '.'}
        </div>
        <div>
          <label htmlFor="confirm-pin">PIN</label>
          <input
            id="confirm-pin"
            type="password"
            autoComplete="current-password"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runConfirm()}
            autoFocus
          />
        </div>
        {err && <div className="callout err">{err}</div>}
        <div className="row">
          <button className="ghost" onClick={() => { setConfirm(null); setConfirmPin(''); setErr(null); }}>cancel</button>
          <button className={confirm.kind === 'delete' ? 'danger' : ''} onClick={runConfirm} disabled={busy || !confirmPin}>
            {busy ? '…' : confirm.kind === 'delete' ? 'remove account' : 'reveal'}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="section-label">accounts ({accounts.length})</div>
      {accounts.map((a) => {
        const isActive = a.id === activeId;
        const isOpen = openMenu === a.id;
        const isEditing = editingId === a.id;
        const sourceLabel = a.source === 'generated' ? 'from seed' : a.source === 'imported-mnemonic' ? 'imported seed' : 'imported key';
        return (
          <div key={a.id} className="callout" style={{ padding: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Identicon address={a.address} size={28} ring={isActive} />
              <div style={{ minWidth: 0, flex: 1 }}>
                {isEditing ? (
                  <input
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') rename(a.id); if (e.key === 'Escape') { setEditingId(null); setErr(null); } }}
                    style={{ fontSize: 12, padding: '3px 6px', height: 22 }}
                    autoFocus
                  />
                ) : (
                  <div style={{ fontWeight: 500, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.label}
                  </div>
                )}
                <div style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontFamily: 'ui-monospace, monospace' }}>{a.address.slice(0, 10)}…{a.address.slice(-6)}</span>
                  <span style={{ opacity: 0.7 }}>·</span>
                  <span>{sourceLabel}</span>
                </div>
              </div>
              <button
                className="ghost"
                style={{ padding: '3px 8px', fontSize: 11 }}
                onClick={() => setOpenMenu(isOpen ? null : a.id)}
              >
                {isOpen ? '✕' : '⋯'}
              </button>
            </div>
            {isOpen && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button className="ghost" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => { setEditingId(a.id); setEditLabel(a.label); setErr(null); }}>rename</button>
                <button className="ghost" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => { navigator.clipboard.writeText(a.address); }}>copy address</button>
                <button className="ghost" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => { setConfirm({ kind: 'priv', id: a.id, label: a.label }); setOpenMenu(null); setErr(null); }}>export private key</button>
                {a.hasMnemonic && <button className="ghost" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => { setConfirm({ kind: 'mnemonic', id: a.id, label: a.label }); setOpenMenu(null); setErr(null); }}>export seed phrase</button>}
                {accounts.length > 1 && <button className="danger" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => { setConfirm({ kind: 'delete', id: a.id, label: a.label }); setOpenMenu(null); setErr(null); }}>remove account</button>}
              </div>
            )}
            {isEditing && (
              <div className="row" style={{ marginTop: 6 }}>
                <button className="ghost" onClick={() => { setEditingId(null); setErr(null); }} style={{ fontSize: 11, padding: '4px 8px' }}>cancel</button>
                <button onClick={() => rename(a.id)} disabled={busy} style={{ fontSize: 11, padding: '4px 8px' }}>save</button>
              </div>
            )}
            {isEditing && err && <div className="callout err" style={{ marginTop: 6, fontSize: 11 }}>{err}</div>}
          </div>
        );
      })}
    </>
  );
}
