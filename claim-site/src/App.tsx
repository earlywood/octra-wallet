import { O2EFlow, type O2EParams } from './flows/O2EFlow';
import { E2OFlow, type E2OParams } from './flows/E2OFlow';
import { DEFAULT_ETH_RPC, DEFAULT_OCTRA_EXPLORER, DEFAULT_OCTRA_RPC, DEFAULT_RELAYER } from './lib/bridge';
import { Logo } from './components/Logo';
import { ClaimSiteGraffiti } from './components/Graffiti';
import { TajmahalBackdrop } from './components/TajmahalBackdrop';

function Header({ subtitle }: { subtitle: string }) {
  return (
    <>
      <div className="brand-row">
        <Logo size={44} />
        <span className="brand">
          <span className="tag">UNOFFICIAL</span>
          <span className="censored">OCTRA <span className="small">BRIDGE</span></span>
        </span>
      </div>
      <div className="tagline">{subtitle}</div>
    </>
  );
}

function readParams() {
  const u = new URL(window.location.href);
  return {
    dir: u.searchParams.get('dir') ?? 'o2e',
    id: u.searchParams.get('id') ?? undefined,
    // Extension's chrome.runtime.id, present when the claim was opened from
    // the extension. Lets us send a sendMessageExternal back to the popup so
    // its history flips to claimed/burn_confirmed instantly. Falsy when the
    // claim site was opened standalone (manual URL, recovery flow), in which
    // case we just skip the callback.
    extId: u.searchParams.get('extId') ?? undefined,
    lockTx: u.searchParams.get('lockTx') ?? '',
    amount: u.searchParams.get('amount') ?? '',
    recipient: u.searchParams.get('recipient') ?? '',
    octraRecipient: u.searchParams.get('octraRecipient') ?? '',
    rpcUrl: u.searchParams.get('rpc') ?? DEFAULT_OCTRA_RPC,
    relayerUrl: u.searchParams.get('relayer') ?? DEFAULT_RELAYER,
    explorerUrl: u.searchParams.get('explorer') ?? DEFAULT_OCTRA_EXPLORER,
    ethRpcUrl: u.searchParams.get('ethRpc') ?? DEFAULT_ETH_RPC,
  };
}

export function App() {
  const p = readParams();

  if (p.dir === 'o2e') {
    if (!p.lockTx || !p.amount || !p.recipient) {
      return (
        <>
          <TajmahalBackdrop />
          <ClaimSiteGraffiti />
          <div className="shell">
            <Header subtitle="claim wOCT after locking OCT" />
            <div className="card">
              <div className="callout warn">
                missing parameters. this page is opened by the Unofficial Octra Wallet extension after a lock — start your bridge from the extension.
              </div>
            </div>
            <Footer />
          </div>
        </>
      );
    }
    const params: O2EParams = {
      lockTx: p.lockTx,
      amount: p.amount,
      recipient: p.recipient,
      rpcUrl: p.rpcUrl,
      relayerUrl: p.relayerUrl,
      explorerUrl: p.explorerUrl,
      ethRpcUrl: p.ethRpcUrl,
      bridgeId: p.id,
      extId: p.extId,
    };
    return (
      <>
        <TajmahalBackdrop />
        <ClaimSiteGraffiti />
        <div className="shell">
          <Header subtitle="claim wOCT after locking OCT" />
          <O2EFlow params={params} />
          <Footer />
        </div>
      </>
    );
  }

  // wOCT → OCT
  const params: E2OParams = {
    rpcUrl: p.rpcUrl,
    ethRpcUrl: p.ethRpcUrl,
    octraRecipient: p.octraRecipient,
    suggestedAmount: p.amount || undefined,
    extId: p.extId,
    bridgeId: p.id,
  };
  return (
    <>
      <ClaimSiteGraffiti />
      <div className="shell">
        <Header subtitle="burn wOCT to unlock OCT" />
        <E2OFlow params={params} />
        <Footer />
      </div>
    </>
  );
}

function Footer() {
  return (
    <div style={{ marginTop: 32, fontSize: 11, color: 'var(--muted)', textAlign: 'center', opacity: 0.6 }}>
      build {__BUILD_HASH__} · {__BUILD_TIME__} UTC
    </div>
  );
}
