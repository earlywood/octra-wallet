import { useEffect, useRef, useState } from 'react';
import { Steps, type StepDef } from '../components/Steps';
import { WalletPicker } from '../components/WalletPicker';
import { formatRawAmount } from '../lib/bridge';
import { fetchRecovery, findOurMessage, getClaimCalldata, relayerCall, type RecoveryDoc } from '../lib/relayer';
import { pollUntilEpoch, sleep, waitForHeader } from '../lib/flow';
import { simulateClaim, submitClaim, waitForReceipt, type Eip1193Provider } from '../lib/eth';

export interface O2EParams {
  lockTx: string;
  amount: string;        // micro-OCT
  recipient: string;     // 0x…
  rpcUrl: string;
  relayerUrl: string;
  explorerUrl: string;
  ethRpcUrl: string;
  bridgeId?: string;
}

type Phase = 'wait_lock' | 'wait_header' | 'connect' | 'ready' | 'sim' | 'submit' | 'wait_claim' | 'done' | 'failed';

export function O2EFlow({ params }: { params: O2EParams }) {
  const [phase, setPhase] = useState<Phase>('wait_lock');
  const [statusMsg, setStatusMsg] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [epoch, setEpoch] = useState<number | null>(null);
  const [calldata, setCalldata] = useState<string | null>(null);
  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const [ethAddr, setEthAddr] = useState<string | null>(null);
  const [claimTx, setClaimTx] = useState<string | null>(null);
  const [claimSentAt, setClaimSentAt] = useState<number | null>(null);
  const [lockStartedAt] = useState<number>(() => Date.now());
  const [headerStartedAt, setHeaderStartedAt] = useState<number | null>(null);
  const [relayerLatest, setRelayerLatest] = useState<number | null>(null);
  const [recoveryScanned, setRecoveryScanned] = useState<number | null>(null);
  const [recoveryLastTry, setRecoveryLastTry] = useState<number | null>(null);
  const [recoveryLastOk, setRecoveryLastOk] = useState<boolean | null>(null);
  const [, setTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // 1Hz ticker only while a timed step is active
  const isTimedActive = phase === 'wait_lock' || phase === 'wait_header' || phase === 'wait_claim';
  useEffect(() => {
    if (!isTimedActive) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [isTimedActive]);

  // Diagnostic polls while waiting on the relayer:
  //   bridgeStatus  → latest_finalized_epoch (octra's finalization frontier)
  //   recovery.json → latest_scanned_epoch + last-fetch ok/timestamp
  // Both show up in the diagnostic panel below the steps so the user can see
  // what's actually happening instead of staring at a generic "waiting…".
  useEffect(() => {
    if (phase !== 'wait_header') return;
    const fetchAll = async () => {
      relayerCall<{ latest_finalized_epoch?: number }>(params.relayerUrl, 'bridgeStatus').then((r) => {
        if (r.ok && r.result?.latest_finalized_epoch != null) setRelayerLatest(r.result.latest_finalized_epoch);
      });
      setRecoveryLastTry(Date.now());
      const doc: RecoveryDoc | null = await fetchRecovery(params.relayerUrl);
      setRecoveryLastOk(doc != null);
      if (doc) {
        setRecoveryScanned(doc.latest_scanned_epoch);
        const list = doc.by_recipient?.[params.recipient.toLowerCase()];
        const hit = Array.isArray(list) && list.some((e) => (e.tx_hash || '').toLowerCase() === params.lockTx.toLowerCase());
        console.info('[octra-bridge] recovery poll', {
          relayer: params.relayerUrl,
          our_recipient: params.recipient.toLowerCase(),
          our_tx: params.lockTx.toLowerCase(),
          our_epoch: epoch,
          relayer_scanned: doc.latest_scanned_epoch,
          recipients_in_doc: Object.keys(doc.by_recipient ?? {}).length,
          our_recipient_present: Array.isArray(list),
          our_entries: Array.isArray(list) ? list.length : 0,
          our_tx_found: hit,
        });
      } else {
        console.warn('[octra-bridge] recovery poll: fetch failed (likely CORS or network)');
      }
    };
    fetchAll();
    const t = setInterval(fetchAll, 15_000);
    return () => clearInterval(t);
  }, [phase, params.relayerUrl, params.recipient, params.lockTx, epoch]);

  useEffect(() => {
    drive();
    return () => { abortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retry helper — many transient relayer errors ('Failed to fetch', edge
  // node hiccups, brief 502s) resolve on the next attempt. Without this, a
  // single bad request strands the whole flow at 'header never published'.
  async function retry<T>(label: string, fn: () => Promise<T>, signal: AbortSignal, attempts = 8): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      if (signal.aborted) throw new Error('aborted');
      try {
        return await fn();
      } catch (e) {
        lastErr = e;
        console.warn(`[octra-bridge] ${label} attempt ${i + 1}/${attempts} failed:`, e);
        if (i < attempts - 1) await sleep(2_000 + i * 1_500, signal);
      }
    }
    throw new Error(`${label} failed after ${attempts} retries: ${(lastErr as Error)?.message ?? lastErr}`);
  }

  async function drive() {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      setPhase('wait_lock');
      const ep = await pollUntilEpoch(params.rpcUrl, params.lockTx, ac.signal);
      setEpoch(ep);

      setPhase('wait_header');
      setHeaderStartedAt(Date.now());
      const wait = await waitForHeader(params.relayerUrl, ep, params.recipient, params.lockTx, ac.signal);

      if (wait.source === 'already_claimed') {
        setPhase('done');
        setStatusMsg('this lock has already been claimed on ethereum.');
        return;
      }

      let leafIndex: number;
      if (wait.source === 'recovery') {
        leafIndex = wait.leafIndex;
      } else {
        const myMsg = await retry(
          'bridgeMessagesByEpoch',
          async () => {
            const m = await findOurMessage(params.relayerUrl, ep, params.recipient);
            if (!m) throw new Error('our message was not found in the bridge epoch (yet)');
            return m;
          },
          ac.signal,
        );
        leafIndex = myMsg.leaf_index;
      }

      const cd = await retry(
        'bridgeClaimCalldata',
        async () => {
          const c = await getClaimCalldata(params.relayerUrl, ep, leafIndex);
          if (!c) throw new Error('relayer returned null calldata');
          return c;
        },
        ac.signal,
      );
      setCalldata(cd);

      setPhase('connect');
    } catch (e) {
      if ((e as Error).message === 'aborted') return;
      console.error('[octra-bridge] drive() failed:', e);
      setErr((e as Error).message);
      setPhase('failed');
    }
  }

  function onConnected(p: Eip1193Provider, addr: string) {
    setProvider(p);
    setEthAddr(addr);
    setPhase('ready');
  }

  async function doClaim() {
    if (!provider || !ethAddr || !calldata) return;
    setErr(null);
    setPhase('sim');
    setStatusMsg('');
    let sim = await simulateClaim(provider, ethAddr, calldata);
    if (!sim.ok) {
      if (sim.reason === 'replay') { setPhase('done'); setStatusMsg('already claimed on-chain.'); return; }
      if (sim.reason === 'unknown_header') {
        setStatusMsg('header not on ethereum yet. relayer is still submitting. retrying…');
        for (let i = 0; i < 12; i++) {
          await sleep(5000);
          const sim2 = await simulateClaim(provider, ethAddr, calldata);
          if (sim2.ok) { sim = sim2; break; }
          if (i === 11) { setErr('header still not on ethereum after retry. try again later.'); setPhase('ready'); return; }
        }
      } else {
        setErr(`claim sim failed: ${sim.reason} — ${sim.raw}`);
        setPhase('ready');
        return;
      }
    }
    setPhase('submit');
    let txHash: string;
    try {
      txHash = await submitClaim(provider, ethAddr, calldata);
    } catch (e) {
      setErr((e as Error).message);
      setPhase('ready');
      return;
    }
    setClaimTx(txHash);
    setClaimSentAt(Date.now());
    setPhase('wait_claim');
    const r = await waitForReceipt(provider, txHash, 300_000);
    if (!r) { setErr('claim tx not confirmed in 5min. check etherscan.'); setPhase('failed'); return; }
    if (r.status !== '0x1') { setErr('claim tx reverted on-chain.'); setPhase('failed'); return; }
    setPhase('done');
    setStatusMsg('claimed! wOCT is now in your ethereum wallet.');
  }

  const LOCK_ETA = 30;
  const HEADER_ETA = 120;
  const CLAIM_ETA = 30;

  function fmtDuration(sec: number): string {
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s ? `${m}m ${s}s` : `${m}m`;
  }

  function elapsedNote(startedAt: number | null, etaSec: number, suffix = ''): string {
    if (!startedAt) return '';
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    if (elapsed < etaSec) return `~${etaSec - elapsed}s remaining${suffix}`;
    return `${fmtDuration(elapsed)} elapsed${suffix} (typical ${etaSec}s)`;
  }

  function headerNoteText(): string | undefined {
    if (!headerStartedAt) return '';
    const elapsedSec = Math.floor((Date.now() - headerStartedAt) / 1000);
    const base = elapsedSec < HEADER_ETA
      ? `~${HEADER_ETA - elapsedSec}s remaining (typical)`
      : `${fmtDuration(elapsedSec)} elapsed (typical ${HEADER_ETA}s)`;
    if (relayerLatest != null && epoch != null) {
      const gap = relayerLatest - epoch;
      if (gap < 0) return `${base} · waiting for epoch ${epoch} to finalize (relayer at ${relayerLatest}, ${-gap} epochs behind)`;
    }
    return base;
  }

  // failure attribution: figure out which step the failure landed on so we can
  // mark *that* step red and leave the others 'pending' (vs. the old behavior
  // which marked the lock 'done' when it had actually reverted on octra).
  const failedAtLock   = phase === 'failed' && epoch == null;
  const failedAtHeader = phase === 'failed' && epoch != null && !calldata;
  const failedAtClaim  = phase === 'failed' && !!calldata;

  const lockStatus    = epoch != null ? 'done'
                      : failedAtLock  ? 'failed'
                      : phase === 'wait_lock' ? 'active' : 'pending';
  const headerStatus  = calldata ? 'done'
                      : failedAtHeader ? 'failed'
                      : phase === 'wait_header' ? 'active' : 'pending';
  const connectStatus = ethAddr ? 'done' : phase === 'connect' ? 'active' : 'pending';
  const claimStatus   = phase === 'done' ? 'done'
                      : failedAtClaim ? 'failed'
                      : phase === 'sim' || phase === 'submit' || phase === 'wait_claim' ? 'active'
                      : 'pending';

  const lockNote   = lockStatus === 'failed' ? (err ?? 'reverted on-chain — see below')
                   : lockStatus === 'active' ? elapsedNote(lockStartedAt, LOCK_ETA)
                   : undefined;
  const headerNote = headerStatus === 'failed' ? 'header never published'
                   : headerStatus === 'active' ? headerNoteText()
                   : undefined;
  const claimNote  = claimStatus === 'active'
                       ? phase === 'sim'        ? 'verifying with ethereum…'
                       : phase === 'submit'     ? 'confirm in your wallet'
                       : phase === 'wait_claim' ? `confirming on ethereum · ${elapsedNote(claimSentAt, CLAIM_ETA)}`
                       : undefined
                       : claimStatus === 'failed' ? 'see error below'
                       : undefined;

  const steps: StepDef[] = [
    { id: 'lock',    label: 'OCT lock confirmed on octra', status: lockStatus,   note: lockNote },
    { id: 'header',  label: 'relayer publishes header',    status: headerStatus, note: headerNote },
    { id: 'connect', label: 'connect wallet',              status: connectStatus },
    { id: 'claim',   label: 'claim wOCT',                  status: claimStatus,  note: claimNote },
  ];

  return (
    <div>
      <div className="card">
        <div className="kv"><span className="k">direction</span><span className="v">OCT → wOCT</span></div>
        <div className="kv"><span className="k">amount</span><span className="v">{formatRawAmount(params.amount)} OCT</span></div>
        <div className="kv"><span className="k">eth recipient</span><span className="v">{params.recipient}</span></div>
        <div className="kv"><span className="k">octra lock tx</span><span className="v">
          <a href={`${params.explorerUrl}/tx.html?hash=${params.lockTx}`} target="_blank" rel="noopener noreferrer">{params.lockTx.slice(0, 16)}…</a>
        </span></div>
        {epoch != null && <div className="kv"><span className="k">epoch</span><span className="v">{epoch}</span></div>}
        {claimTx && <div className="kv"><span className="k">claim tx</span><span className="v"><a href={`https://etherscan.io/tx/${claimTx}`} target="_blank" rel="noopener noreferrer">{claimTx.slice(0, 16)}…</a></span></div>}
      </div>

      <div className="card">
        <Steps steps={steps} />
        {statusMsg && <div className="callout info">{statusMsg}</div>}

        {phase === 'wait_header' && epoch != null && (
          <div className="callout" style={{ marginTop: 10, fontSize: 11.5 }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 0.4, marginBottom: 6, textTransform: 'uppercase' }}>diagnostic</div>
            <div className="kv" style={{ padding: 0, fontSize: 11.5 }}>
              <span className="k">your lock epoch</span><span className="v">{epoch}</span>
            </div>
            {relayerLatest != null && (
              <div className="kv" style={{ padding: 0, fontSize: 11.5 }}>
                <span className="k">relayer finalized to</span>
                <span className="v" style={{ color: relayerLatest < epoch ? 'var(--warn)' : 'var(--ok)' }}>
                  {relayerLatest} ({relayerLatest >= epoch ? `+${relayerLatest - epoch}` : relayerLatest - epoch})
                </span>
              </div>
            )}
            {recoveryScanned != null && (
              <div className="kv" style={{ padding: 0, fontSize: 11.5 }}>
                <span className="k">recovery.json scanned to</span>
                <span className="v" style={{ color: recoveryScanned < epoch ? 'var(--warn)' : 'var(--ok)' }}>
                  {recoveryScanned} ({recoveryScanned >= epoch ? `+${recoveryScanned - epoch}` : recoveryScanned - epoch})
                </span>
              </div>
            )}
            {recoveryLastTry != null && (
              <div className="kv" style={{ padding: 0, fontSize: 11.5 }}>
                <span className="k">last recovery poll</span>
                <span className="v" style={{ color: recoveryLastOk === false ? 'var(--err)' : undefined }}>
                  {recoveryLastOk == null ? '—' : recoveryLastOk ? 'ok' : 'failed (likely CORS)'} · {Math.max(0, Math.floor((Date.now() - recoveryLastTry) / 1000))}s ago
                </span>
              </div>
            )}
            {recoveryScanned != null && recoveryScanned < epoch && (
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                relayer hasn't reached your epoch yet. it processes ~15 epochs/min — eta ~{Math.ceil((epoch - recoveryScanned) / 15)} min.
              </div>
            )}
          </div>
        )}

        {phase === 'wait_header' && headerStartedAt && (Date.now() - headerStartedAt) > 3 * 60_000 && (
          <div className="callout info" style={{ marginTop: 10, fontSize: 12 }}>
            <strong>you can close this tab any time</strong> — your OCT lock is safe on-chain, and the wallet popup's <em>resume</em> button on this entry will pick the claim up from exactly where it left off.
          </div>
        )}
        {err && <div className="callout err" style={{ marginTop: 10 }}>{err}</div>}
      </div>

      {phase === 'connect' && <WalletPicker onConnected={onConnected} />}

      {phase === 'ready' && (
        <div className="card">
          <div className="kv"><span className="k">connected</span><span className="v">{ethAddr}</span></div>
          <div className="spacer" />
          <button onClick={doClaim}>claim wOCT</button>
        </div>
      )}

      {phase === 'done' && (
        <div className="callout ok">
          done! check your ethereum wallet to confirm wOCT balance.
          {claimTx && <> · <a href={`https://etherscan.io/tx/${claimTx}`} target="_blank" rel="noopener noreferrer">view tx</a></>}
        </div>
      )}

      {phase === 'failed' && (
        <div className="card">
          <button onClick={drive}>retry</button>
        </div>
      )}
    </div>
  );
}
