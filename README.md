# Unofficial Octra Wallet

A browser-extension wallet for the Octra network with a built-in bridge to/from wOCT on Ethereum. Side project, not affiliated with Octra Labs in any way. Generate or import accounts, send / receive OCT, bridge both directions, switch between accounts, etc.

## Layout

```
extension/      the wallet itself — chromium MV3, react popup
claim-site/     the static page that handles the eth side of the bridge
relayer-proxy/  a tiny cloudflare worker that fixes octra's broken CORS
shared/         constants, ABI encoders, amount math used by both apps
.github/        the action that auto-deploys claim-site to gh-pages
```

## How it fits together (briefly)

The wallet holds your octra keys in an encrypted vault. When you bridge OCT → wOCT, the extension signs the lock tx on the octra side and opens a new tab to the claim site. The claim site waits for the bridge relayer to publish the merkle proof, then asks your MetaMask (or Rabby, OKX, other wallet) to sign the eth tx natively. Reverse direction is the same idea — burn wOCT through the claim site, the relayer auto-unlocks OCT on the octra side.

## Network endpoints

The wallet ships with a Cloudflare Worker proxy as the default for the Octra RPC and bridge relayer. You can paste any of these into Settings → Network if you want to swap them.

| Purpose | Default (in extension) | Upstream (Octra Labs) |
|---|---|---|
| Octra JSON-RPC | `https://octra-relay.salamistroker.workers.dev` | `https://octra.network/rpc` |
| Bridge relayer | `https://octra-relay.salamistroker.workers.dev` | `https://relayer-002838819188.octra.network` |
| Octra explorer | `https://octrascan.io` | (same) |
| Ethereum read RPC | `https://ethereum-rpc.publicnode.com` | (any public mainnet RPC works) |
| Bridge claim page | `https://octra.ac420.org/` | (this repo's `claim-site/`) |

The proxy exists because Octra's upstream relayer returns duplicate `Access-Control-Allow-*` headers on POST responses, which browsers reject per the Fetch spec. The worker also bypasses geo-IP blocks for users in restricted regions. See `relayer-proxy/README.md` for deploying your own.

If you trust the upstream and your region isn't blocked, paste the official Octra Labs URLs into Settings to talk to them directly.

## Octra-side contracts

| What | Address | Notes |
|---|---|---|
| Bridge vault (octra) | `oct5MrNfjiXFNRDLwsodn8Zm9hDKNGAYt3eQDCQ52bSpCHq` | call `lock_to_eth(eth_recipient)` to start an OCT → wOCT bridge |
| Bridge contract (eth) | `0xE7eD69b852fd2a1406080B26A37e8E04e7dA4caE` | mainnet |
| wOCT token (eth)      | `0x4647e1fE715c9e23959022C2416C71867F5a6E80` | **6 decimals**, not 18 — 1 wOCT = 1,000,000 base units, matching micro-OCT 1:1 |

## Try it

```bash
cd extension && npm install && npm run build
# chrome://extensions → developer mode → "load unpacked" → pick extension/dist/

# tests live alongside the extension:
cd extension && npm test
```

The claim site is live at https://octra.ac420.org/ and auto-redeploys via GitHub Actions on every push to `main` that touches `claim-site/`.

## Heads up

Unaudited, no warranty, do whatever you want with it. If you lose your seed phrase or PIN, your funds are gone — there's no support team. The disclaimer screen on first install spells this out before you even get to create a wallet.
