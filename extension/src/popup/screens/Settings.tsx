import { useEffect, useState } from 'react';
import { send } from '../../lib/messages';
import type { Settings as SettingsT } from '../../lib/wallet';

export function Settings() {
  const [s, setS] = useState<SettingsT | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    send<SettingsT>({ kind: 'GET_SETTINGS' }).then((r) => { if (r.ok) setS(r.data); });
  }, []);

  if (!s) return <div className="status info">loading…</div>;

  async function save() {
    if (!s) return;
    setMsg(null);
    const r = await send({ kind: 'SAVE_SETTINGS', settings: s });
    setMsg(r.ok ? 'saved' : `error: ${r.error}`);
    setTimeout(() => setMsg(null), 2000);
  }

  return (
    <div className="center">
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
          static page that handles the ethereum side of the bridge with your browser wallet (MetaMask, Rabby, etc.). open-source — see the project's <code>claim-site/</code> directory.
        </div>
      </div>
      {msg && <div className="status info">{msg}</div>}
      <button onClick={save}>save</button>
    </div>
  );
}
