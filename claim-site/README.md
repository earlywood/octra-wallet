# Octra Claim Site

A static page that handles the Ethereum side of the OCT ↔ wOCT bridge. The Octra Wallet browser extension opens this page in a new tab after locking OCT (or when starting a wOCT burn) so the user's existing browser wallet (MetaMask, Rabby, OKX, Coinbase Wallet, Brave) can sign the Ethereum transactions natively — no WalletConnect, no project IDs, no usage caps.

## Trust model

The page is a normal https origin. MetaMask injects `window.ethereum` like for any dApp. The page reads the lock parameters from URL query params and never sees the user's Octra private key.

## Deployment

Auto-deployed to **https://octra.ac420.org/** via `.github/workflows/deploy-claim-site.yml` on every push to `main` that touches `claim-site/`. The CNAME file in `public/` carries the custom domain through each deploy.

For local preview: `npm run dev` (or `npm run build && npm run preview`).

## Self-hosting a fork

Override `CLAIM_SITE_BASE` and replace `public/CNAME`:

```bash
# subpath, e.g. https://your-user.github.io/octra-claim/
CLAIM_SITE_BASE=/octra-claim/ npm run build

# different domain
echo your-domain.example > public/CNAME
npm run build
```

`npm run build` produces a static `dist/` directory that drops onto any static host (GitHub Pages, Cloudflare Pages, Vercel, Netlify, S3+CloudFront).

After changing the URL, update `extension/src/lib/wallet.ts` `DEFAULTS.claimUrl` to match.

## URL parameters

The extension constructs URLs like:

```
https://YOUR-HOST/?dir=o2e&id=…&lockTx=0x…&amount=1000000&recipient=0xabc…
```

Parameters:

| name             | required for      | meaning |
|------------------|-------------------|---------|
| `dir`            | both              | `o2e` for OCT → wOCT, `e2o` for wOCT → OCT |
| `lockTx`         | o2e               | Octra-side lock tx hash |
| `amount`         | o2e (e2o suggest) | amount in micro-OCT |
| `recipient`      | o2e               | Ethereum recipient address |
| `octraRecipient` | e2o (suggest)     | Octra recipient address |
| `rpc`            | optional          | Octra JSON-RPC URL |
| `relayer`        | optional          | bridge relayer URL |
| `explorer`       | optional          | Octra explorer base URL |
| `ethRpc`         | optional          | Ethereum read-only RPC |
| `id`             | optional          | bridge entry id (passthrough only) |
