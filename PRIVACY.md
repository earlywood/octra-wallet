# Privacy Policy — Unofficial Octra Wallet

Last updated: 2026-05-04.

## What we collect

Nothing. There's no telemetry, no analytics, no remote logging, no user accounts. We don't have a server that knows you exist.

## What stays on your device

- Your encrypted account vault (seed phrases, private keys), in `chrome.storage.local`. Encrypted with PBKDF2-SHA256 → AES-256-GCM, keyed off your PIN. The PIN is never transmitted; it's not even sent to a service worker outside the local extension process.
- Settings (RPC URLs, network preferences, music toggle).
- Local-only history of bridge attempts you've initiated.

None of the above leaves your machine.

## Network requests we make

When you use the wallet, the extension queries blockchain endpoints. Specifically:

- **Octra RPC + bridge relayer** — by default routed through a Cloudflare Worker proxy at `https://octra-relay.salamistroker.workers.dev`. The Worker forwards your JSON-RPC calls to Octra's upstream endpoints (`https://octra.network/rpc` and `https://relayer-002838819188.octra.network`) and returns their responses. The proxy exists because Octra's upstream returns malformed CORS headers that browsers reject. You can disable the proxy and hit the upstream directly via Settings → Network → Cloudflare proxy toggle.
- **Public Ethereum RPC** at `https://ethereum-rpc.publicnode.com` — used for read-only wOCT balance lookups during the bridge claim flow.

These services see standard HTTP request metadata (your IP address, requested method/path) the same way any web request does. We don't pass any wallet-identifying information beyond the public addresses you're querying balances for.

## What the bridge claim site sees

When you bridge OCT → wOCT, the extension opens a new tab to the claim site (`https://octra.ac420.org/`). The claim site is a static page (HTML/JS, no server logic). It receives bridge data via URL query parameters:

- The Octra-side lock tx hash
- The amount
- The Ethereum recipient address
- RPC / relayer URLs (so it knows where to query)

The claim site never sees your Octra private key — that stays in the extension. It does ask your existing browser wallet (MetaMask, Rabby, OKX, etc.) to sign the Ethereum-side transactions natively.

## Third parties

- **Cloudflare** sees the JSON-RPC traffic that passes through the Worker proxy. Cloudflare's privacy policy applies. You can disable the proxy in Settings → Network if you'd prefer to talk to Octra's endpoints directly (caveat: this currently breaks browser bridge POSTs due to a CORS bug at Octra's relayer — see `relayer-proxy/README.md`).
- **GitHub Pages** hosts the claim site. GitHub may log standard request metadata.
- **PublicNode** is the default Ethereum RPC. Their privacy policy applies to their RPC usage.

We do not embed analytics, tracking pixels, or fingerprinting from any third party.

## Your responsibility

This is unaudited, free, open-source software. Anyone with your seed phrase or PIN can spend your funds. If you lose either, your funds are unrecoverable — there is no support team, password reset, or backup we can offer.

## Source

The complete source code for everything described here is at https://github.com/earlywood/octra-wallet. You can audit, fork, or self-host any part of it.

## Contact

File an issue at https://github.com/earlywood/octra-wallet/issues.
