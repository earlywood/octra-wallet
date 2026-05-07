import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // node env is fine — we mock chrome.* where needed and the crypto/abi
    // helpers all run in any modern JS environment.
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // No watch by default; CI uses `npm test` which calls vitest run.
  },
  // Allow vitest to import from ../shared (sibling to the extension project).
  server: { fs: { allow: ['..'] } },
});
