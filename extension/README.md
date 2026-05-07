# extension

The wallet popup. Chromium MV3, react + typescript + vite. Side project, not affiliated with Octra Labs.

Does what you'd expect: generate or import accounts (12-word seed or raw private key), send / receive OCT, switch between accounts, open the bridge claim flow on a separate tab. Vault is encrypted at rest with PBKDF2-SHA256 (600k iterations) → AES-256-GCM keyed off your PIN.

## Build

```bash
npm install
npm run build
# chrome://extensions → developer mode → "load unpacked" → pick dist/
```

Reload the extension after rebuilds. If something looks weird after a build, hard-refresh the popup.

## Tests

Vitest covers the crypto, signing, ABI encoders, and amount math — anything where a regression would silently break funds. Run before any release:

```bash
npm test           # one-shot (75 tests, ~600ms)
npm run test:watch # while editing
```

Coverage focuses on the hard-to-recompute things: canonical JSON serialization (signature compatibility), HD derivation (account recovery), burn/approve/balanceOf calldata layout (the wOCT decimals + arg-order bugs are pinned), PBKDF2 round-trips. UI is exercised manually.

## Network endpoints

The Network tab in Settings holds five URLs. All are editable; the defaults are below. See the project root `README.md` for the full address list including the official Octra Labs upstreams you can swap to if you want to skip the proxy.

| Field | Default |
|---|---|
| octra rpc | `https://octra-relay.salamistroker.workers.dev` |
| bridge relayer | `https://octra-relay.salamistroker.workers.dev` |
| explorer | `https://octrascan.io` |
| ethereum rpc | `https://ethereum-rpc.publicnode.com` |
| bridge claim page | `https://octra.ac420.org/` |

The proxy exists because Octra's upstream relayer returns duplicate CORS headers (browsers reject those), and because Octra geo-blocks some regions. The worker source is in `../relayer-proxy/`.

## Package for the Chrome Web Store

```bash
npm run build
# then zip the contents of dist/ (not the dist folder itself):
node -e "const a=require('archiver'),fs=require('fs'),p=require('path');const o=fs.createWriteStream('octra-wallet-1.0.0.zip');const z=a('zip',{zlib:{level:9}});z.pipe(o);(function w(d,b=''){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=p.join(d,e.name),r=p.posix.join(b,e.name);if(e.isDirectory())w(f,r);else if(!e.name.endsWith('.map'))z.file(f,{name:r});}})('dist');z.finalize();"
```

That excludes sourcemaps so the zip stays small. Upload the resulting `.zip` at [chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole).

## What's in here

- `src/lib/crypto.ts` — Ed25519, BIP-39 mnemonic, octra HD derivation, AES-GCM vault (PBKDF2 600k)
- `src/lib/wallet.ts` — vault format + accounts + settings + v1→v2 + iter-count migrations
- `src/lib/rpc.ts` — talks to the octra rpc, nonce/balance composition over staging_view
- `src/lib/bridge.ts` — eth-side helpers; constants + ABI encoders are imported from `../shared/`
- `src/lib/bridgeStore.ts` — chrome.storage-backed history of bridge attempts
- `src/lib/tx.ts` — canonical JSON serializer + tx builders
- `src/lib/messages.ts` — the typed Msg union the popup sends to the service worker
- `src/background/service-worker.ts` — message bus, holds unlocked seeds in `chrome.storage.session`
- `src/popup/` — the react UI
- `src/offscreen/` — hidden audio host so the music keeps playing after the popup closes
- `test/` — vitest unit tests (run via `npm test`)
- `../shared/` — constants, amount math, ABI encoders, address validators shared with the claim-site project (see `../shared/README.md`)

## Octra protocol notes (for the curious)

- Address = `"oct" + base58(sha256(pubkey32))` padded to 47 chars
- Tx is signed over a deterministic JSON serialization (`canonicalJson` in `src/lib/tx.ts`); signature is base64 of the detached Ed25519 sig
- Amounts in micro-OCT (1 OCT = 1,000,000)
- Bridge vault: `oct5MrNfjiXFNRDLwsodn8Zm9hDKNGAYt3eQDCQ52bSpCHq`, method `lock_to_eth(eth_recipient)`
- Eth bridge: `0xE7eD69b852fd2a1406080B26A37e8E04e7dA4caE`, wOCT token: `0x4647e1fE715c9e23959022C2416C71867F5a6E80` (decimals = 6, not 18 — 1 wOCT = 1 micro-OCT)

## Don't

Put real money in here unless you're cool with losing it. It's unaudited code shipped by one person.
