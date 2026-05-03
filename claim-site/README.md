# claim-site

The static page that handles the eth side of the OCT ↔ wOCT bridge. Live at https://octra.ac420.org/.

The wallet extension opens this in a new tab when you start a bridge. Once here, your MetaMask (or any EIP-1193 wallet) signs the eth transactions natively. No WalletConnect, no relays in between.

## Deploy

CI handles it: every push to `main` that touches `claim-site/` rebuilds and pushes to `gh-pages` via `.github/workflows/deploy-claim-site.yml`. The `public/CNAME` carries the custom domain through.

Local preview:

```bash
npm install
npm run dev
```

## Self-hosting a fork

```bash
# subpath like https://you.github.io/octra-claim/:
CLAIM_SITE_BASE=/octra-claim/ npm run build

# different domain:
echo your-domain.example > public/CNAME
npm run build
```

After changing the URL, update `extension/src/lib/wallet.ts` `DEFAULTS.claimUrl` so the extension knows where to open it.

## URL parameters the extension passes

| name | for | what it is |
|---|---|---|
| `dir` | both | `o2e` = OCT → wOCT, `e2o` = wOCT → OCT |
| `lockTx` | o2e | octra-side lock tx hash |
| `amount` | o2e (e2o suggests) | amount in micro-OCT |
| `recipient` | o2e | eth recipient |
| `octraRecipient` | e2o (suggest) | octra recipient |
| `rpc` / `relayer` / `explorer` / `ethRpc` | optional | per-route URL overrides |
| `id` | optional | bridge entry id (passthrough only) |
