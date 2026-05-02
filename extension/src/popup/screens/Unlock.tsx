import { useState } from 'react';
import { send } from '../../lib/messages';

interface Props { onUnlock: () => void; }

export function Unlock({ onUnlock }: Props) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function doUnlock() {
    setErr(null);
    setBusy(true);
    const r = await send({ kind: 'UNLOCK', pin });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onUnlock();
  }

  async function wipe() {
    if (!confirm('wipe wallet from this browser? you will need your seed phrase to restore.')) return;
    await send({ kind: 'WIPE_VAULT' });
    onUnlock();
  }

  return (
    <div className="app">
      <div className="topbar"><span className="brand">octra wallet</span></div>
      <div className="content center">
        <div style={{ textAlign: 'center', padding: '14px 0' }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>unlock</div>
          <div className="status info">enter your PIN to continue</div>
        </div>
        <div>
          <label>PIN</label>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doUnlock()}
            autoFocus
          />
        </div>
        {err && <div className="callout err">{err}</div>}
        <button onClick={doUnlock} disabled={busy || !pin}>unlock</button>
        <hr />
        <button className="danger" onClick={wipe}>wipe wallet</button>
      </div>
    </div>
  );
}
