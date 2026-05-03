# extension

The wallet popup. Chromium MV3, react + typescript + vite. Side project, not affiliated with Octra Labs.

Does what you'd expect: generate or import accounts (12-word seed or raw private key), send / receive OCT, switch between accounts, open the bridge claim flow on a separate tab. Vault is encrypted at rest with PBKDF2-SHA256 → AES-256-GCM keyed off your PIN.

## Build

```bash
npm install
npm run build
# chrome://extensions → developer mode → "load unpacked" → pick dist/
```

Reload the extension after rebuilds. If something looks weird after a build, hard-refresh the popup.

## Package for the Chrome Web Store

```bash
npm run build
# then zip the contents of dist/ (not the dist folder itself):
node -e "const a=require('archiver'),fs=require('fs'),p=require('path');const o=fs.createWriteStream('octra-wallet-1.0.0.zip');const z=a('zip',{zlib:{level:9}});z.pipe(o);(function w(d,b=''){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=p.join(d,e.name),r=p.posix.join(b,e.name);if(e.isDirectory())w(f,r);else if(!e.name.endsWith('.map'))z.file(f,{name:r});}})('dist');z.finalize();"
```

That excludes sourcemaps so the zip stays small. Upload the resulting `.zip` at [chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole).

## What's in here

- `src/lib/crypto.ts` — Ed25519, BIP-39 mnemonic, octra HD derivation, AES-GCM vault
- `src/lib/wallet.ts` — vault format + accounts + settings + migrations
- `src/lib/rpc.ts` — talks to the octra rpc
- `src/lib/bridge.ts` — bridge constants + ABI encoders for eth-side calls
- `src/background/service-worker.ts` — message bus, holds unlocked seeds in `chrome.storage.session`
- `src/popup/` — the react UI
- `src/offscreen/` — hidden audio host so the music keeps playing after the popup closes

## Octra protocol notes (for the curious)

- Address = `"oct" + base58(sha256(pubkey32))` padded to 47 chars
- Tx is signed over a deterministic JSON serialization (`canonicalJson` in `src/lib/tx.ts`); signature is base64 of the detached Ed25519 sig
- Amounts in micro-OCT (1 OCT = 1,000,000)
- Bridge vault: `oct5MrNfjiXFNRDLwsodn8Zm9hDKNGAYt3eQDCQ52bSpCHq`, method `lock_to_eth(eth_recipient)`
- Eth bridge: `0xE7eD69b852fd2a1406080B26A37e8E04e7dA4caE`, wOCT token: `0x4647e1fE715c9e23959022C2416C71867F5a6E80` (decimals = 6, not 18)

## Don't

Put real money in here unless you're cool with losing it. It's unaudited code shipped by one person.
