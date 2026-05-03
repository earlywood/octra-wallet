# relayer proxy

A tiny cloudflare worker that proxies octra's bridge relayer + JSON-RPC node, fixes their broken CORS headers, and lets users in geo-blocked regions actually use the thing.

## Why

Two problems, same fix.

**1. CORS dedupe.** The upstream relayer's nginx returns `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Headers: Content-Type` **twice** on every POST response. Browsers reject duplicate CORS headers per the Fetch spec → `fetch()` throws `TypeError: Failed to fetch`. curl ignores duplicates, which is why this took us a while to track down.

**2. Geo-block bypass.** Octra restricts some regions by source IP. Routing through cloudflare means the upstream sees a CF egress IP, not the user's, so blocked users can still bridge. End users only need to reach `*.workers.dev`, which CF doesn't restrict.

The worker proxies 1:1 and rewrites the response headers cleanly:

- `GET /recovery.json` → relayer's static unclaimed-msg index
- `POST /` with `bridge*` method → relayer
- `POST /` with anything else (`octra_*`, `staging_view`, `contract_*`) → octra RPC
- `GET /health` → `{ok: true, ...}`, useful for sanity checks

## Deploy (~5 min, free)

1. Sign up at [dash.cloudflare.com](https://dash.cloudflare.com) — Workers free tier doesn't ask for a card
2. Workers & Pages → Create Worker → name it whatever (e.g. `octra-relay`)
3. Click into it → Edit code → paste the contents of `worker.js` → Deploy
4. CF gives you a URL like `https://octra-relay.<your-name>.workers.dev`
5. Drop that URL into:
   - `extension/src/lib/wallet.ts` → `PROXY_URL` (and the matching default settings)
   - `claim-site/src/lib/bridge.ts` → `DEFAULT_OCTRA_RPC` and `DEFAULT_RELAYER`

The extension has a one-time settings migration that flips existing users from the old upstream URLs to the proxy URL on first read, so you don't strand anyone who already has the wallet installed.

## Custom domain (optional)

If you'd rather use `relay.your-domain.org` than the `*.workers.dev` URL: add your domain as a zone in CF (free), then in the worker → Settings → Triggers → Add Custom Domain. CF handles DNS.

## Verify it

```bash
curl https://octra-relay.<your-name>.workers.dev/health
# → {"ok":true,"ts":...,"upstreams":["relayer","rpc"]}

# bridge* → relayer:
curl -i -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"bridgeStatus","params":[]}' \
  https://octra-relay.<your-name>.workers.dev | grep -ic "access-control-allow-origin"
# → 1 (would be 2 if you hit the upstream directly)
```

## Cost

Free tier is 100k requests/day. A bridge claim makes maybe 10–50 requests. Plenty of headroom.
