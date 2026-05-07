# shared/

Code that lives in BOTH the extension and the claim site. Imported via
relative paths from each project's `src/lib/*`:

```ts
import { WOCT_ADDR } from '../../../shared/constants';
```

The `tsconfig.json` in each project includes `"../shared/**/*.ts"` so the
type-checker resolves these. Vite's rollup bundles them automatically.

## What goes here

- **constants** — addresses, selectors, default URLs, chain IDs
- **amount** — micro-OCT ↔ OCT formatting, ABI-friendly amount math
- **abi** — hand-rolled calldata encoders for the bridge contracts
- **address** — Octra/Eth address validators

## What does NOT go here

- Anything that touches `chrome.*` APIs (extension only)
- Anything that touches `window.ethereum` / EIP-1193 (claim site only)
- React components — each project owns its own UI

## Testing

Vitest in `extension/` covers both extension code and shared code, since
both run in the same JS environment.

```bash
cd extension && npm test
```
