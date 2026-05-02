# Octra Wallet & Bridge

A browser-extension wallet for the Octra network with a fully self-hosted bridge to/from Ethereum (wOCT). No WalletConnect, no project IDs, no third-party usage caps.

## Layout

```
extension/    # Chromium MV3 extension — generate/import wallets, send/receive OCT, initiate bridges
claim-site/   # Static page (open-source, deploy to gh-pages) — handles the ethereum side of the bridge with the user's existing browser wallet
webcli/       # Upstream C++ webcli reference, used to derive the Octra protocol details (do not modify)
```

## How it fits together

1. User installs `extension/` from the Chrome Web Store (or sideloads).
2. User locks OCT through the extension popup. The popup signs the Octra `lock_to_eth` contract call with the in-extension key.
3. The extension opens a new tab to the deployed `claim-site/` URL with bridge data in query params.
4. The static page polls the bridge relayer for a header, then asks the user's browser wallet (MetaMask, Rabby, OKX, etc.) to sign the Ethereum claim tx — `window.ethereum.request(…)`, no extra service in between.
5. wOCT lands in the user's Ethereum wallet.

The reverse direction (wOCT → OCT) is the same idea: open the claim-site, approve + burn through the user's browser wallet, the relayer auto-unlocks OCT on Octra.

## Live deployment

- **Claim site**: https://octra.ac420.org/ (auto-deployed from `claim-site/` via `.github/workflows/deploy-claim-site.yml` on every push to `main`).
- **Extension**: not yet on the Chrome Web Store; build from `extension/` and load unpacked.

## Develop

```bash
# extension
cd extension && npm install && npm run build
# load extension/dist/ in chrome://extensions

# claim-site (CI deploys automatically; this is just for local preview)
cd ../claim-site && npm install && npm run dev
```

## Status

MVP. Send/receive/bridge end-to-end works against the protocol described in `webcli/` (which lives outside this repo — see the `webcli/` `.gitignore` entry). Default RPC URLs are best-guesses and may need to be updated to the real public Octra endpoints before live use.
