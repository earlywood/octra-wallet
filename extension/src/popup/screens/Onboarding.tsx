import { useState } from 'react';
import { send } from '../../lib/messages';
import { Logo } from '../Logo';

interface Props { onDone: () => void; }

type Mode = 'choose' | 'create' | 'create-show' | 'import-mnemonic' | 'import-priv';

export function Onboarding({ onDone }: Props) {
  const [mode, setMode] = useState<Mode>('choose');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [priv, setPriv] = useState('');
  const [createdMnemonic, setCreatedMnemonic] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function validatePin(): string | null {
    if (pin.length < 4) return 'PIN must be at least 4 characters';
    if (pin !== pin2) return 'PINs do not match';
    return null;
  }

  async function doCreate() {
    setErr(null);
    const v = validatePin();
    if (v) { setErr(v); return; }
    setBusy(true);
    const r = await send<{ address: string; mnemonic: string }>({ kind: 'CREATE_WALLET', pin });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setCreatedMnemonic(r.data.mnemonic);
    setMode('create-show');
  }

  async function doImportMnemonic() {
    setErr(null);
    const v = validatePin();
    if (v) { setErr(v); return; }
    setBusy(true);
    const r = await send<{ address: string }>({ kind: 'IMPORT_MNEMONIC', mnemonic, pin });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onDone();
  }

  async function doImportPriv() {
    setErr(null);
    const v = validatePin();
    if (v) { setErr(v); return; }
    setBusy(true);
    const r = await send<{ address: string }>({ kind: 'IMPORT_PRIVKEY', privB64: priv, pin });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onDone();
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand-row">
          <Logo size={26} />
          <span className="brand"><span className="tag">UNOFFICIAL</span><span className="strike">OCTRA</span></span>
        </div>
      </div>
      <div className="content center">
        {mode === 'choose' && (
          <>
            <div style={{ textAlign: 'center', padding: '24px 0 12px' }}>
              <Logo size={64} />
              <div style={{ fontFamily: '"Impact", "Arial Black", sans-serif', fontSize: 22, fontWeight: 900, marginTop: 14, marginBottom: 4, letterSpacing: '0.04em', textTransform: 'uppercase' }}>welcome</div>
              <div className="status info">create a new wallet, or import an existing one</div>
            </div>
            <button onClick={() => setMode('create')}>create new wallet</button>
            <button className="ghost" onClick={() => setMode('import-mnemonic')}>import seed phrase</button>
            <button className="ghost" onClick={() => setMode('import-priv')}>import private key</button>
          </>
        )}

        {(mode === 'create' || mode === 'import-mnemonic' || mode === 'import-priv') && (
          <>
            <div>
              <label htmlFor="onboard-pin">PIN</label>
              <input id="onboard-pin" name="pin" type="password" autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus />
            </div>
            <div>
              <label htmlFor="onboard-pin-confirm">confirm PIN</label>
              <input id="onboard-pin-confirm" name="pin-confirm" type="password" autoComplete="new-password" value={pin2} onChange={(e) => setPin2(e.target.value)} />
            </div>

            {mode === 'import-mnemonic' && (
              <div>
                <label htmlFor="onboard-mnemonic">seed phrase (12/15/18/21/24 words)</label>
                <textarea id="onboard-mnemonic" name="mnemonic" autoComplete="off" value={mnemonic} onChange={(e) => setMnemonic(e.target.value)} />
              </div>
            )}
            {mode === 'import-priv' && (
              <div>
                <label htmlFor="onboard-priv">private key (base64, 32 or 64 bytes)</label>
                <textarea id="onboard-priv" name="privateKey" autoComplete="off" value={priv} onChange={(e) => setPriv(e.target.value)} />
              </div>
            )}

            {err && <div className="callout err">{err}</div>}
            <div className="row">
              <button className="ghost" onClick={() => { setErr(null); setMode('choose'); }}>back</button>
              {mode === 'create' && <button onClick={doCreate} disabled={busy}>create</button>}
              {mode === 'import-mnemonic' && <button onClick={doImportMnemonic} disabled={busy}>import</button>}
              {mode === 'import-priv' && <button onClick={doImportPriv} disabled={busy}>import</button>}
            </div>
          </>
        )}

        {mode === 'create-show' && createdMnemonic && (
          <>
            <div className="callout warn">
              write down these 12 words. anyone with this phrase controls your wallet.
            </div>
            <div className="callout mono" style={{ lineHeight: 1.7 }}>{createdMnemonic}</div>
            <button onClick={onDone}>I saved it — open wallet</button>
          </>
        )}
      </div>
    </div>
  );
}
