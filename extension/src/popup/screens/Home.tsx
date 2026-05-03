import { useEffect, useState } from 'react';
import { send } from '../../lib/messages';
import { formatRawAmount } from '../../lib/rpc';
import { Send } from './Send';
import { Receive } from './Receive';
import { Bridge } from './Bridge';
import { Settings } from './Settings';
import { AddAccount } from './AddAccount';
import { AccountSwitcher, type AccountSummary } from '../AccountSwitcher';

interface Props {
  active: AccountSummary;
  accounts: AccountSummary[];
  onLock: () => void;
  onAccountChanged: () => void;
}

type Tab = 'home' | 'send' | 'receive' | 'bridge' | 'settings' | 'add-account';

function shortAddr(a: string) { return a.slice(0, 8) + '…' + a.slice(-6); }

export function Home({ active, accounts, onLock, onAccountChanged }: Props) {
  const address = active.address;
  const [tab, setTab] = useState<Tab>('home');
  const [balance, setBalance] = useState<string | null>(null);
  const [nonce, setNonce] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function copyAddr() {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  async function loadBalance() {
    setBusy(true);
    setErr(null);
    const r = await send<{ balanceRaw: string; nonce: number }>({ kind: 'GET_BALANCE' });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setBalance(r.data.balanceRaw);
    setNonce(r.data.nonce);
  }

  // re-fetch when the active account changes
  useEffect(() => {
    setBalance(null);
    setNonce(null);
    loadBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.id]);

  async function lock() {
    await send({ kind: 'LOCK' });
    onLock();
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand-row">
          <AccountSwitcher
            active={active}
            accounts={accounts}
            onSwitched={onAccountChanged}
            onAdd={() => setTab('add-account')}
          />
          <div className="brand-text">
            <div className="brand"><span className="tag">UNOFFICIAL</span><span className="censored">OCTRA</span></div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 10.5, color: 'var(--text)', fontWeight: 500, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {active.label}
              </span>
              <span
                className={`addr${copied ? ' copied' : ''}`}
                title="click to copy address"
                onClick={copyAddr}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && copyAddr()}
              >
                {copied ? 'copied!' : shortAddr(address)}
              </span>
            </div>
          </div>
        </div>
        <button className="ghost" onClick={lock} style={{ padding: '5px 10px', fontSize: 11 }}>lock</button>
      </div>

      <div className="tabs">
        <button className={tab === 'home' ? 'active' : ''} onClick={() => setTab('home')}>home</button>
        <button className={tab === 'send' ? 'active' : ''} onClick={() => setTab('send')}>send</button>
        <button className={tab === 'receive' ? 'active' : ''} onClick={() => setTab('receive')}>receive</button>
        <button className={tab === 'bridge' ? 'active' : ''} onClick={() => setTab('bridge')}>bridge</button>
        <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>⚙</button>
      </div>

      <div className="content">
        {tab === 'home' && (
          <>
            <div className="balance-card">
              <div className="label">balance</div>
              <div className="value">{balance == null ? '—' : formatRawAmount(balance)}<span className="unit">OCT</span></div>
              <div className="sub">nonce {nonce ?? '—'}</div>
            </div>
            {err && <div className="callout err">{err}</div>}
            <div className="row">
              <button className="ghost" onClick={loadBalance} disabled={busy}>{busy ? '…' : 'refresh'}</button>
              <button onClick={() => setTab('send')}>send</button>
            </div>
          </>
        )}
        {tab === 'send' && <Send onDone={() => { setTab('home'); loadBalance(); }} />}
        {tab === 'receive' && <Receive address={address} />}
        {tab === 'bridge' && <Bridge address={address} balanceRaw={balance} onLockDone={loadBalance} />}
        {tab === 'settings' && <Settings onAccountsChanged={onAccountChanged} />}
        {tab === 'add-account' && (
          <AddAccount
            onDone={() => { setTab('home'); onAccountChanged(); }}
            onCancel={() => setTab('home')}
          />
        )}
      </div>
    </div>
  );
}
