// Loaded with `node --import` for the unit tests. The site's TypeScript modules use
// extensionless relative imports (`from './ui'`), which Vite resolves but Node's ESM
// loader does not. This hook retries a failed relative import with `.ts` appended.
// Type stripping itself is Node's built-in (default-on since Node 22.18 / 23.6).
import { register } from 'node:module';

register('./resolve-ts.mjs', import.meta.url);
