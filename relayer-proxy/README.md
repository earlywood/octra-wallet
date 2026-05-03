# Octra proxy worker

A small Cloudflare Worker that proxies BOTH the Octra bridge relayer (`https://relayer-002838819188.octra.network`) and the Octra JSON-RPC node (`https://octra.network/rpc`). Single URL for both upstreams; routing is decided per request based on the JSON-RPC method name in the body.

## Why

Two independent problems, same solution.

**(1) CORS dedupe.** The upstream relayer's nginx returns `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Headers: Content-Type` **twice** on every POST response. Browsers (Chrome, Firefox, Brave, Safari) reject responses with duplicate CORS headers per the Fetch spec — `fetch()` rejects with `TypeError: Failed to fetch`. curl ignores duplicates which is why the bug is invisible from the CLI.

**(2) Geo-block bypass.** Octra's RPC and/or relayer geo-restrict by source IP in some regions. Routing through Cloudflare means the upstream sees a Cloudflare egress IP (not the user's). End users in blocked regions only need to reach `*.workers.dev`, which Cloudflare doesn't geo-restrict.

The Worker proxies 1:1 and rewrites the response headers cleanly. Routing:
- `GET  /recovery.json` → relayer's static unclaimed-msg index
- `POST /` with a JSON-RPC body whose `method` starts with `bridge*` → relayer
- `POST /` with any other JSON-RPC body (`octra_*`, `staging_view`, `contract_*`) → octra RPC
- `GET  /health` → tiny `{ ok: true }` response, useful for sanity-checking

## Deploy (5 minutes, free)

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → sign up (free, no card needed for Workers free tier).
2. **Workers & Pages** → **Create application** → **Create Worker**.
3. Name it something like `octra-relay`. Click **Deploy** (it'll deploy a "hello world" placeholder).
4. Click **Edit code**. Replace the entire file with the contents of `worker.js` from this folder. Click **Deploy**.
5. The worker is now live at `https://octra-relay.<your-cf-username>.workers.dev`. Copy that URL.
6. Tell the extension to use it. Both `rpcUrl` and `relayerUrl` should point at the SAME worker URL (the worker decides per request which upstream to hit):
   - `extension/src/lib/wallet.ts` → set both `DEFAULTS.rpcUrl` and `DEFAULTS.relayerUrl` to `https://octra-relay.<your-cf-username>.workers.dev`
   - `claim-site/src/lib/bridge.ts` → set both `DEFAULT_OCTRA_RPC` and `DEFAULT_RELAYER` to the same URL
7. Rebuild & redeploy: `cd claim-site && npm run build && git add -A && git commit -m 'use proxy' && git push`. The GH Action redeploys the static site. Rebuild the extension locally too (`cd extension && npm run build`) and reload at `chrome://extensions`.

Existing users with the old relayer URL saved in Settings will get auto-migrated by the one-time migration in `extension/src/lib/wallet.ts` (assuming you wire it up — see commit message of the change that added this).

## Custom domain (optional)

If you'd rather use `relay.ac420.org` instead of the `*.workers.dev` URL:

1. In Cloudflare, add `ac420.org` as a zone (free) — you'll need to point Porkbun to Cloudflare's nameservers.
2. In the Worker → **Settings** → **Triggers** → **Add Custom Domain** → `relay.ac420.org`. Cloudflare auto-configures DNS.

Either URL works the same. The `workers.dev` one is simpler if you don't want to migrate DNS.

## Verifying

The worker is up:

```bash
curl https://octra-relay.<your-cf-username>.workers.dev/health
# → {"ok":true,"ts":...,"upstreams":["relayer","rpc"]}
```

POSTs route correctly and dedupe CORS:

```bash
# bridge* → relayer
curl -i -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"bridgeStatus","params":[]}' \
  https://octra-relay.<your-cf-username>.workers.dev | grep -ic "access-control-allow-origin"
# → 1

# octra_* → octra RPC
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"octra_balance","params":["oct1111111111111111111111111111111111111111111"]}' \
  https://octra-relay.<your-cf-username>.workers.dev
# → {"jsonrpc":"2.0","error":{"code":109,"message":"invalid address",...},"id":1}
```

If the second curl returns a JSON-RPC error like `invalid address`, the RPC routing works (the test address isn't real, so the error is expected).

## Cost

Free tier: 100,000 requests/day. A bridge claim flow makes maybe 10–50 requests. Plenty.
