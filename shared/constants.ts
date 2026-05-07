// Constants shared between the extension and the claim site. Everything in
// this folder is imported by BOTH projects via relative paths. Changes here
// land in both bundles on next build, which is the whole point — keeping the
// wOCT-decimals-class drift from happening again.

export const BRIDGE_VAULT = 'oct5MrNfjiXFNRDLwsodn8Zm9hDKNGAYt3eQDCQ52bSpCHq';
export const WOCT_ADDR    = '0x4647e1fE715c9e23959022C2416C71867F5a6E80';
export const ETH_BRIDGE   = '0xE7eD69b852fd2a1406080B26A37e8E04e7dA4caE';
export const ETH_CHAIN_ID = 1;
export const BURN_SELECTOR = '0xe3e3aed0';

// Bridge contract enforces a minimum lock — verified empirically: 0.9 OCT
// reverts with 'below minimum lock', 1 OCT succeeds. Contract has no view
// method exposing the value, so this is hardcoded.
export const MIN_LOCK_RAW = 1_000_000n;

// Cloudflare Worker proxy that fronts both the Octra JSON-RPC and bridge
// relayer. Single proxy because (a) it dedupes the relayer's malformed CORS
// headers and (b) bypasses upstream geo-IP blocks for end users in restricted
// regions. See relayer-proxy/worker.js.
export const PROXY_URL          = 'https://octra-relay.salamistroker.workers.dev';
export const UPSTREAM_OCTRA_RPC = 'https://octra.network/rpc';
export const UPSTREAM_RELAYER   = 'https://relayer-002838819188.octra.network';

export const DEFAULT_OCTRA_EXPLORER = 'https://octrascan.io';
// publicnode is well-behaved on CORS for browser origins. llamarpc and
// cloudflare-eth both have intermittent rate-limit / preflight problems.
export const DEFAULT_ETH_RPC = 'https://ethereum-rpc.publicnode.com';
