# Octra relayer CORS proxy

A 60-line Cloudflare Worker that proxies the Octra bridge relayer at `https://relayer-002838819188.octra.network` and dedupes its malformed CORS headers, which would otherwise make every POST from a browser `Failed to fetch`.

## Why

The upstream relayer's nginx returns `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Headers: Content-Type` **twice** on every POST response. Browsers (Chrome, Firefox, Brave, Safari) reject responses with duplicate CORS headers per the Fetch spec — `fetch()` rejects with `TypeError: Failed to fetch`. curl ignores duplicates which is why the bug is invisible from the CLI.

We can't fix the upstream nginx config (not ours). The Worker proxies 1:1 and rewrites the response headers cleanly.

## Deploy (5 minutes, free)

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → sign up (free, no card needed for Workers free tier).
2. **Workers & Pages** → **Create application** → **Create Worker**.
3. Name it something like `octra-relay`. Click **Deploy** (it'll deploy a "hello world" placeholder).
4. Click **Edit code**. Replace the entire file with the contents of `worker.js` from this folder. Click **Deploy**.
5. The worker is now live at `https://octra-relay.<your-cf-username>.workers.dev`. Copy that URL.
6. Tell the extension to use it:
   - Edit `extension/src/lib/wallet.ts` → set `DEFAULTS.relayerUrl = 'https://octra-relay.<your-cf-username>.workers.dev'`
   - Edit `claim-site/src/lib/bridge.ts` → set `DEFAULT_RELAYER = 'https://octra-relay.<your-cf-username>.workers.dev'`
7. Rebuild & redeploy: `cd claim-site && npm run build && git add -A && git commit -m 'use relayer proxy' && git push`. The GH Action redeploys the static site. Rebuild the extension locally too (`cd extension && npm run build`) and reload at `chrome://extensions`.

Existing users with the old relayer URL saved in Settings will get auto-migrated by the one-time migration in `extension/src/lib/wallet.ts` (assuming you wire it up — see commit message of the change that added this).

## Custom domain (optional)

If you'd rather use `relay.ac420.org` instead of the `*.workers.dev` URL:

1. In Cloudflare, add `ac420.org` as a zone (free) — you'll need to point Porkbun to Cloudflare's nameservers.
2. In the Worker → **Settings** → **Triggers** → **Add Custom Domain** → `relay.ac420.org`. Cloudflare auto-configures DNS.

Either URL works the same. The `workers.dev` one is simpler if you don't want to migrate DNS.

## Verifying

```bash
curl -i -X POST -H "Content-Type: application/json" -H "Origin: https://octra.ac420.org" \
  -d '{"jsonrpc":"2.0","id":1,"method":"bridgeStatus","params":[]}' \
  https://octra-relay.<your-cf-username>.workers.dev
```

`Access-Control-Allow-Origin: *` should appear **exactly once** in the response headers. The body should be the same JSON-RPC payload as the upstream.

## Cost

Free tier: 100,000 requests/day. A bridge claim flow makes maybe 10–50 requests. Plenty.
