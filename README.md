# Unofficial Octra Wallet

A browser-extension wallet for the Octra network with a built-in bridge to/from wOCT on Ethereum. Side project, not affiliated with Octra Labs in any way. Generate or import accounts, send / receive OCT, bridge both directions, switch between accounts, etc.

## Layout

```
extension/      the wallet itself — chromium MV3, react popup
claim-site/     the static page that handles the eth side of the bridge
relayer-proxy/  a tiny cloudflare worker that fixes octra's broken CORS
.github/        the action that auto-deploys claim-site to gh-pages
```

## How it fits together (briefly)

The wallet holds your octra keys in an encrypted vault. When you bridge OCT → wOCT, the extension signs the lock tx on the octra side and opens a new tab to the claim site. The claim site waits for the bridge relayer to publish the merkle proof, then asks your MetaMask (or Rabby, OKX, other wallet) to sign the eth tx natively. Reverse direction is the same idea — burn wOCT through the claim site, the relayer auto-unlocks OCT on the octra side.

## Try it

```bash
cd extension && npm install && npm run build
# chrome://extensions → developer mode → "load unpacked" → pick extension/dist/
```

The claim site is live at https://octra.ac420.org/ and auto-redeploys via GitHub Actions on every push to `main` that touches `claim-site/`.

## Heads up

Unaudited, no warranty, do whatever you want with it. If you lose your seed phrase or PIN, your funds are gone — there's no support team. The disclaimer screen on first install spells this out before you even get to create a wallet.
