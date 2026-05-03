import { useEffect, useState } from 'react';
import { send } from '../../lib/messages';
import { formatRawAmount } from '../../lib/rpc';
import { Send } from './Send';
import { Receive } from './Receive';
import { Bridge } from './Bridge';
import { Settings } from './Settings';
import { Logo } from '../Logo';

interface Props { address: string; onLock: () => void; }

type Tab = 'home' | 'send' | 'receive' | 'bridge' | 'settings';

function shortAddr(a: string) { return a.slice(0, 8) + '…' + a.slice(-6); }

export function Home({ address, onLock }: Props) {
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

  useEffect(() => { loadBalance(); }, []);

  async function lock() {
    await send({ kind: 'LOCK' });
    onLock();
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand-row">
          <Logo size={26} />
          <div className="brand-text">
            <div className="brand"><span className="tag">UNOFFICIAL</span><span className="strike">OCTRA</span></div>
            <div
              className={`addr${copied ? ' copied' : ''}`}
              title="click to copy address"
              onClick={copyAddr}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && copyAddr()}
            >
              {copied ? 'copied!' : shortAddr(address)}
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
        {tab === 'settings' && <Settings />}
      </div>
    </div>
  );
}
