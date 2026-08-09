import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Every `@wavegrid/*` package the main process imports must be external to the
 * main bundle.
 *
 * Bundling one instead inlines its source into `main.js`, which turns its own
 * `import 'ws'` into a `require('ws')` resolved from *this* package — and pnpm
 * only installs `ws` for the package that declares it. The app then dies at
 * launch with `Cannot find module 'ws'`, which no typecheck, lint or unit test
 * catches. `tsc --noEmit` is happy, so this is the only cheap guard.
 */
const DESKTOP = join(__dirname, '..');

function mainImports(): string[] {
  // Read the source rather than importing it: this must reflect what Rollup
  // sees, not what a test bundler resolves.
  const files = ['src/main.ts', 'src/main/brain.ts', 'src/main/doctor.ts', 'src/main/ipc.ts'];
  const found = new Set<string>();
  for (const file of files) {
    const src = readFileSync(join(DESKTOP, file), 'utf8');
    for (const m of src.matchAll(/from '(@wavegrid\/[^']+)'/g)) found.add(m[1]);
    for (const m of src.matchAll(/import\('(@wavegrid\/[^']+)'\)/g)) found.add(m[1]);
  }
  return [...found];
}

function externals(): string[] {
  const config = readFileSync(join(DESKTOP, 'vite.main.config.ts'), 'utf8');
  const block = /external:\s*\[([^\]]*)\]/s.exec(config);
  if (!block) throw new Error('vite.main.config.ts has no rollup `external` list');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('main-process bundle externals', () => {
  it('externalizes every @wavegrid package the main process imports', () => {
    const external = externals();
    const missing = mainImports().filter((pkg) => !external.includes(pkg));
    expect(missing).toEqual([]);
  });

  it('keeps the Node-only transitive deps external too', () => {
    const external = externals();
    expect(external).toContain('ws');
    expect(external).toContain('bonjour-service');
  });
});
