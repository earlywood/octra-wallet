import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Deployed to a custom subdomain (octra.ac420.org), so the site lives at the
// root of its host. If you fork this and host at a subpath like
// https://USER.github.io/REPO/, override with CLAIM_SITE_BASE=/REPO/.
const base = process.env.CLAIM_SITE_BASE ?? '/';

export default defineConfig({
  plugins: [react()],
  base,
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
