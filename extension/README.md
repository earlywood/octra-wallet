# Octra Wallet (browser extension)

A Chromium MV3 extension that gives Octra a MetaMask-style experience: generate a wallet, import a key or seed phrase, send/receive OCT, and bridge OCT ↔ wOCT — all without running the local C++ webcli.

## How the bridge works

The OCT side runs entirely inside the extension (it has the Octra key). The Ethereum side opens a tab to a small static page (`claim-site/` in this repo) where the user's existing browser wallet (MetaMask, Rabby, OKX, Coinbase Wallet, Brave) signs the transactions natively. No WalletConnect, no relays, no project IDs, no usage caps.

Trust model: the static page is a normal https origin you (the extension publisher) control. The end user trusts you for the extension, and they trust you for the same code on a different origin. Both are open source in this repo.

## Build

```bash
cd extension
npm install
npm run build
```

Load `extension/dist/` in `chrome://extensions` → enable Developer Mode → "Load unpacked".

## Claim URL

The extension defaults to `https://octra.ac420.org/` for the bridge claim page (deployed from `claim-site/` via GitHub Actions). End users won't need to touch this. The Settings tab lets advanced users override it (e.g., for self-hosting a fork).

## Architecture

- `src/lib/crypto.ts` — Ed25519 signing, BIP-39, Octra HD derivation, AES-GCM vault.
- `src/lib/rpc.ts` — Octra JSON-RPC client.
- `src/lib/tx.ts` — canonical-JSON serialization and tx signing.
- `src/lib/bridge.ts` — bridge constants + ABI encoders.
- `src/lib/bridgeStore.ts` — bridge entry persistence in `chrome.storage.local`.
- `src/lib/wallet.ts` — vault create / import / unlock / settings.
- `src/background/service-worker.ts` — message broker; holds the unlocked seed in `chrome.storage.session`.
- `src/popup/` — React UI for the popup (send/receive/bridge initiation).

## Octra protocol notes

- Address: `"oct" + base58(sha256(pubkey32))`, padded with `1`s to 47 chars total.
- Tx is signed over a deterministic JSON serialization (see `lib/tx.ts::canonicalJson`); signature is base64 of the detached Ed25519 signature.
- Amounts are in micro-OCT (1 OCT = 1 000 000).
- Bridge vault address: `oct5MrNfjiXFNRDLwsodn8Zm9hDKNGAYt3eQDCQ52bSpCHq`. Lock by sending a contract call with method `lock_to_eth` and params `[ethRecipient]`.
- ETH bridge: `0xE7eD69b852fd2a1406080B26A37e8E04e7dA4caE`. wOCT: `0x4647e1fE715c9e23959022C2416C71867F5a6E80`.
- Default relayer: `https://relayer-002838819188.octra.network`.

## Security caveats

- Vault is encrypted with PBKDF2-SHA256 (250k iters) → AES-256-GCM. The PIN strength is the only thing protecting the seed at rest — pick a real passphrase.
- This is unaudited code. Do not use with real funds you cannot afford to lose.
