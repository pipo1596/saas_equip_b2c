// Apache (how this app is actually deployed) expects a single static
// `index.html` to fall back to for every client route. Angular's SSR build
// only ever writes a file literally named `index.html` for a route that's
// actually prerendered — since every route this project prerenders is
// public (forgot-password/mfa/shop-as), the generic client shell used for
// every other (often auth-gated) route comes out as `index.csr.html`
// instead. Renaming it here is what makes that shell the one Apache serves.
import { existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const browserDir = join(import.meta.dirname, '../dist/saas_euip_b2c/browser');
const csrPath = join(browserDir, 'index.csr.html');
const indexPath = join(browserDir, 'index.html');

if (existsSync(csrPath)) {
  renameSync(csrPath, indexPath);
}
