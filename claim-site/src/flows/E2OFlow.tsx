import { useEffect, useRef, useState } from 'react';
import { Steps, type StepDef } from '../components/Steps';
import { WalletPicker } from '../components/WalletPicker';
import { formatRawAmount, octToWei, parseAmountToRaw, weiToMicroOct } from '../lib/bridge';
import { approveWoct, burnWoct, ensureMainnet, getChainId, getWoctBalance, waitForReceipt, type Eip1193Provider } from '../lib/eth';
import { DEFAULT_OCTRA_EXPLORER } from '../lib/bridge';
import { isValidOctraAddress } from '../../../shared/address';
import { closeMyTab, notifyBurnLanded } from '../lib/extensionBridge';

export interface E2OParams {
  rpcUrl: string;
  ethRpcUrl: string;
  octraRecipient?: string;
  suggestedAmount?: string; // micro-OCT
  /** chrome.runtime.id of the wallet extension that opened this tab. Used
   *  to ping the popup when the burn lands so its history updates instantly. */
  extId?: string;
  bridgeId?: string;
}

type Phase = 'connect' | 'setup' | 'approving' | 'burning' | 'done' | 'failed';

export function E2OFlow({ params }: { params: E2OParams }) {
  const [phase, setPhase] = useState<Phase>('connect');
  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const [ethAddr, setEthAddr] = useState<string | null>(null);
  const [woctBal, setWoctBal] = useState<bigint | null>(null);
  const [amount, setAmount] = useState(params.suggestedAmount ? formatRawAmount(params.suggestedAmount) : '');
  const [octRecip, setOctRecip] = useState(params.octraRecipient ?? '');
  const [statusMsg, setStatusMsg] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [approveTx, setApproveTx] = useState<string | null>(null);
  const [approveOk, setApproveOk] = useState(false);
  const [approveSentAt, setApproveSentAt] = useState<number | null>(null);
  const [burnTx, setBurnTx] = useState<string | null>(null);
  const [burnOk, setBurnOk] = useState(false);
  const [burnSentAt, setBurnSentAt] = useState<number | null>(null);
  const [unlockStartedAt, setUnlockStartedAt] = useState<number | null>(null);
  const [failedAt, setFailedAt] = useState<'approve' | 'burn' | null>(null);
  const [chainOk, setChainOk] = useState(false);
  const [tick, setTick] = useState(0);

  // 1Hz ticker — only running while a step is actively timing.
  const isTimedActive = phase === 'approving' || phase === 'burning' || (burnOk && phase !== 'done');
  useEffect(() => {
    if (!isTimedActive) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [isTimedActive]);
  void tick; // tick is intentionally unused — we only need it to force re-render
  const [balRpc, setBalRpc] = useState<string | null>(null);
  const [balErr, setBalErr] = useState<string | null>(null);
  const [balLoading, setBalLoading] = useState(false);

  // Track the listeners we attach to the wallet provider so we can detach
  // them on unmount (or on reconnect). Without this, every wallet
  // disconnect+reconnect cycle stacks another listener on each event, which
  // eventually fires N copies of the same handler per change.
  const listenersRef = useRef<{ provider: Eip1193Provider; chainChanged: (...a: unknown[]) => void; accountsChanged: (...a: unknown[]) => void } | null>(null);
  function detachListeners() {
    const cur = listenersRef.current;
    if (!cur) return;
    try {
      cur.provider.removeListener?.('chainChanged', cur.chainChanged);
      cur.provider.removeListener?.('accountsChanged', cur.accountsChanged);
    } catch { /* provider may have been GC'd */ }
    listenersRef.current = null;
  }
  useEffect(() => () => detachListeners(), []);

  async function loadBalance(addr: string) {
    setBalLoading(true);
    setBalErr(null);
    try {
      const r = await getWoctBalance(params.ethRpcUrl, addr);
      setWoctBal(r.wei);
      setBalRpc(new URL(r.rpc).host);
      console.info('[octra-bridge] wOCT balance', { holder: addr, wei: r.wei.toString(), hex: r.hex, rpc: r.rpc });
    } catch (e) {
      const msg = (e as Error).message;
      console.warn('[octra-bridge] wOCT balance read failed', e);
      setWoctBal(null);
      setBalErr(msg);
    } finally {
      setBalLoading(false);
    }
  }

  async function onConnected(p: Eip1193Provider, addr: string) {
    setProvider(p);
    setEthAddr(addr);
    setPhase('setup');
    setErr(null);

    // Always show balance — read goes through the public mainnet RPC, so it
    // works regardless of whatever chain the wallet is on right now.
    void loadBalance(addr);

    // Try to flip the wallet to mainnet so the eventual approve/burn signs
    // on the right chain. If the user declines we don't block balance display,
    // but we'll re-prompt when they hit "start bridge".
    try {
      const cur = await getChainId(p);
      setChainOk(cur === 1);
      if (cur !== 1) await ensureMainnet(p);
      setChainOk(true);
    } catch (e) {
      setChainOk(false);
    }

    // Detach any previously-attached listeners (different provider, or same
    // provider after a disconnect/reconnect cycle) before registering fresh.
    detachListeners();
    if (p.on) {
      const chainChanged = async () => {
        try {
          const cur = await getChainId(p);
          setChainOk(cur === 1);
          if (cur === 1) setErr(null);
        } catch { /* ignore */ }
      };
      // CRITICAL: re-read balance if user switches accounts in the wallet
      // after connect — otherwise we keep showing the first account's balance.
      const accountsChanged = async (...args: unknown[]) => {
        const accts = args[0] as string[] | undefined;
        const next = accts?.[0];
        if (next) {
          setEthAddr(next);
          await loadBalance(next);
        } else {
          // user disconnected
          setEthAddr(null);
          setWoctBal(null);
          setPhase('connect');
        }
      };
      p.on('chainChanged', chainChanged);
      p.on('accountsChanged', accountsChanged);
      listenersRef.current = { provider: p, chainChanged, accountsChanged };
    }
  }

  async function retryChainSwitch() {
    if (!provider) return;
    setErr(null);
    try {
      await ensureMainnet(provider);
      setChainOk(true);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function refreshBalance() {
    if (ethAddr) await loadBalance(ethAddr);
  }

  async function start() {
    setErr(null);
    setFailedAt(null);
    setApproveOk(false);
    setBurnOk(false);
    setApproveTx(null);
    setBurnTx(null);
    setApproveSentAt(null);
    setBurnSentAt(null);
    setUnlockStartedAt(null);
    if (!provider || !ethAddr) return;
    if (!isValidOctraAddress(octRecip)) { setErr('invalid octra recipient'); return; }
    let amountMicro: string;
    try { amountMicro = parseAmountToRaw(amount); } catch { setErr('invalid amount'); return; }
    if (BigInt(amountMicro) <= 0n) { setErr('amount must be > 0'); return; }
    const amountWei = octToWei(amountMicro);
    if (woctBal != null && amountWei > woctBal) { setErr('insufficient wOCT balance'); return; }

    setPhase('approving');
    setStatusMsg('');
    let aTx: string;
    try {
      aTx = await approveWoct(provider, ethAddr, amountWei);
    } catch (e) {
      setErr(`approve declined or failed to send: ${(e as Error).message}`);
      setFailedAt('approve');
      setPhase('failed');
      return;
    }
    setApproveTx(aTx);
    setApproveSentAt(Date.now());
    const ar = await waitForReceipt(provider, aTx, 300_000);
    if (!ar) {
      setErr('approve tx not confirmed within 5 min — it may still land later. you can retry once it lands.');
      setFailedAt('approve');
      setPhase('failed');
      return;
    }
    if (ar.status !== '0x1') {
      setErr('approve tx reverted on-chain. view it on etherscan for details.');
      setFailedAt('approve');
      setPhase('failed');
      return;
    }
    setApproveOk(true);

    setPhase('burning');
    let bTx: string;
    try {
      bTx = await burnWoct(provider, ethAddr, amountWei, octRecip);
    } catch (e) {
      setErr(`burn declined or failed to send: ${(e as Error).message}`);
      setFailedAt('burn');
      setPhase('failed');
      return;
    }
    setBurnTx(bTx);
    setBurnSentAt(Date.now());
    const br = await waitForReceipt(provider, bTx, 300_000);
    if (!br) {
      setErr('burn tx not confirmed within 5 min — check etherscan; it may still land later.');
      setFailedAt('burn');
      setPhase('failed');
      return;
    }
    if (br.status !== '0x1') {
      setErr('burn tx reverted on-chain. wOCT was NOT burned. view on etherscan for the revert reason; you can retry.');
      setFailedAt('burn');
      setPhase('failed');
      return;
    }
    setBurnOk(true);
    setUnlockStartedAt(Date.now());
    // Ping the extension popup (best-effort) so its e2o entry — if any —
    // flips to burn_confirmed. The actual OCT-side unlock by the relayer
    // happens a minute or two later and isn't tracked in the popup yet.
    void notifyBurnLanded(params.extId, params.bridgeId, bTx);

    setPhase('done');
    setStatusMsg('burn confirmed. the relayer auto-unlocks OCT on octra in ~1–2 min — check your octra wallet to confirm receipt.');
  }

  const stepStatus = (id: 'approve' | 'burn' | 'unlock') => {
    if (id === 'approve') {
      if (failedAt === 'approve') return 'failed';
      if (approveOk) return 'done';
      if (phase === 'approving') return 'active';
      return 'pending';
    }
    if (id === 'burn') {
      if (failedAt === 'burn') return 'failed';
      if (burnOk) return 'done';
      if (phase === 'burning' && approveOk) return 'active';
      return 'pending';
    }
    if (phase === 'done') return 'done';
    if (failedAt) return 'pending';
    if (burnOk) return 'active';
    return 'pending';
  };

  // ETH mainnet block ~12s; one block of finality is what most wallets show as
  // "confirmed". 30s is a comfortable typical for a single confirmation.
  const ETH_TX_ETA = 30;
  const RELAYER_ETA = 120;

  function timeNote(sentAt: number | null, etaSec: number): string {
    if (!sentAt) return '';
    const elapsed = Math.floor((Date.now() - sentAt) / 1000);
    if (elapsed < etaSec) return `confirming on ethereum · ~${etaSec - elapsed}s remaining`;
    return `confirming on ethereum · ${elapsed}s elapsed`;
  }
  function relayerNote(sentAt: number | null, etaSec: number): string {
    if (!sentAt) return '';
    const elapsed = Math.floor((Date.now() - sentAt) / 1000);
    if (elapsed < etaSec) return `~${etaSec - elapsed}s remaining (typical ${etaSec}s)`;
    return `${elapsed}s elapsed (typical ${etaSec}s — may take longer)`;
  }

  const noteFor = (id: 'connect' | 'approve' | 'burn' | 'unlock'): string | undefined => {
    const st = id === 'connect'
      ? (ethAddr ? 'done' : 'active')
      : stepStatus(id);
    if (st === 'pending') return undefined;
    if (st === 'failed') {
      if (id === 'approve') return 'approve failed — see below';
      if (id === 'burn')    return 'burn failed — see below';
      return undefined;
    }
    if (st === 'done') return undefined;
    // active
    if (id === 'connect') return undefined;
    if (id === 'approve') return approveTx ? timeNote(approveSentAt, ETH_TX_ETA) : 'approve in your wallet';
    if (id === 'burn')    return burnTx    ? timeNote(burnSentAt,    ETH_TX_ETA) : 'confirm burn in your wallet';
    if (id === 'unlock')  return relayerNote(unlockStartedAt, RELAYER_ETA);
    return undefined;
  };

  const steps: StepDef[] = [
    { id: 'connect', label: 'connect wallet',     status: ethAddr ? 'done' : 'active', note: noteFor('connect') },
    { id: 'approve', label: 'approve wOCT',       status: stepStatus('approve'),       note: noteFor('approve') },
    { id: 'burn',    label: 'burn wOCT',          status: stepStatus('burn'),          note: noteFor('burn') },
    { id: 'unlock',  label: 'OCT unlocks on octra', status: stepStatus('unlock'),     note: noteFor('unlock') },
  ];

  return (
    <div>
      <div className="card">
        <div className="kv"><span className="k">direction</span><span className="v">wOCT → OCT</span></div>
        {ethAddr && <div className="kv"><span className="k">eth wallet</span><span className="v">{ethAddr}</span></div>}
        {ethAddr && (
          <>
            <div className="kv">
              <span className="k">wOCT balance</span>
              <span className="v">
                {balLoading
                  ? <span className="spinner" />
                  : woctBal == null
                    ? <span style={{ color: 'var(--err)' }}>read failed</span>
                    : `${formatRawAmount(String(weiToMicroOct(woctBal)))} wOCT`}
                {' '}
                <a href="#" onClick={(e) => { e.preventDefault(); refreshBalance(); }} style={{ fontSize: 11, marginLeft: 6 }}>refresh</a>
              </span>
            </div>
            {balRpc && (
              <div className="kv" style={{ paddingTop: 0 }}>
                <span className="k" style={{ fontSize: 11 }}>via</span>
                <span className="v" style={{ fontSize: 11, color: 'var(--muted)' }}>{balRpc}</span>
              </div>
            )}
            {balErr && (
              <div className="callout err" style={{ marginTop: 8, fontSize: 12 }}>balance read: {balErr}</div>
            )}
          </>
        )}
        {approveTx && <div className="kv"><span className="k">approve tx</span><span className="v"><a href={`https://etherscan.io/tx/${approveTx}`} target="_blank" rel="noopener noreferrer">{approveTx.slice(0, 16)}…</a></span></div>}
        {burnTx && <div className="kv"><span className="k">burn tx</span><span className="v"><a href={`https://etherscan.io/tx/${burnTx}`} target="_blank" rel="noopener noreferrer">{burnTx.slice(0, 16)}…</a></span></div>}
      </div>

      {phase === 'connect' && <WalletPicker onConnected={onConnected} />}

      {phase === 'setup' && !chainOk && (
        <div className="card">
          <div className="callout warn" style={{ marginBottom: 12 }}>
            your wallet is on the wrong network. switch to <strong>Ethereum mainnet</strong> to continue — wOCT only exists there.
          </div>
          <button onClick={retryChainSwitch}>switch to Ethereum mainnet</button>
        </div>
      )}

      {phase === 'setup' && chainOk && (
        <div className="card">
          <div>
            <label htmlFor="e2o-amount">amount (OCT)</label>
            <input id="e2o-amount" name="amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" inputMode="decimal" autoComplete="off" />
          </div>
          <div className="spacer" />
          <div>
            <label htmlFor="e2o-recipient">octra recipient (oct…)</label>
            <input id="e2o-recipient" name="octraRecipient" value={octRecip} onChange={(e) => setOctRecip(e.target.value.trim())} placeholder="oct…" autoComplete="off" />
          </div>
          <div className="spacer" />
          {err && <div className="callout err" style={{ marginBottom: 10 }}>{err}</div>}
          <button onClick={start} disabled={!amount || !octRecip}>start bridge</button>
        </div>
      )}

      {(phase === 'approving' || phase === 'burning' || phase === 'done' || phase === 'failed') && (
        <div className="card">
          <Steps steps={steps} />
          {statusMsg && <div className="callout info">{statusMsg}</div>}
          {phase === 'done' && octRecip && (
            <div className="callout ok" style={{ marginTop: 10 }}>
              <a href={`${DEFAULT_OCTRA_EXPLORER}/address.html?addr=${octRecip}`} target="_blank" rel="noopener noreferrer">
                view {octRecip.slice(0, 12)}… on octrascan →
              </a>
            </div>
          )}
          {err && <div className="callout err" style={{ marginTop: 10 }}>{err}</div>}
          {failedAt === 'burn' && burnTx && (
            <div className="callout err" style={{ marginTop: 10, fontSize: 12 }}>
              <a href={`https://etherscan.io/tx/${burnTx}`} target="_blank" rel="noopener noreferrer">view failed burn tx on etherscan →</a>
            </div>
          )}
          {failedAt === 'approve' && approveTx && (
            <div className="callout err" style={{ marginTop: 10, fontSize: 12 }}>
              <a href={`https://etherscan.io/tx/${approveTx}`} target="_blank" rel="noopener noreferrer">view failed approve tx on etherscan →</a>
            </div>
          )}
          {phase === 'failed' && <button onClick={start} style={{ marginTop: 10 }}>retry</button>}
          {phase === 'done' && params.extId && (
            <button onClick={() => closeMyTab(params.extId, { stopMusic: true })} style={{ marginTop: 10 }}>
              all done — close
            </button>
          )}
        </div>
      )}
    </div>
  );
}
