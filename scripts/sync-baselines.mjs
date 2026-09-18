/**
 * Re-copy the baseline files from CA-BaselineAuditor, which is their source of truth.
 *
 * Deliberately a manual step rather than a symlink or a submodule: a refreshed baseline
 * can add a dimension this app does not model, and the right moment to find that out is
 * when you choose to sync - not silently at runtime. So this copies, then immediately
 * runs the census guard and tells you if the taxonomy has fallen behind.
 *
 * Usage:  npm run sync-baselines              (report what would change)
 *         npm run sync-baselines -- --write   (apply, then verify)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(ROOT, 'config/app.config.json'), 'utf8'));
const write = process.argv.includes('--write');

const argPath = process.argv.find((a) => a.startsWith('--from='))?.slice('--from='.length);
const source = resolve(ROOT, argPath ?? config.syncSourcePath);

if (!existsSync(source)) {
  console.error(`\nSource not found: ${source}`);
  console.error(`Point at it with:  npm run sync-baselines -- --from=<path> --write\n`);
  process.exit(1);
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 12);

let changed = 0;
const pending = [];

for (const entry of config.baselines) {
  const from = join(source, entry.file);
  const to = join(ROOT, 'src/data/baselines', entry.file);

  if (!existsSync(from)) {
    console.error(`  MISSING  ${entry.file} - not present in ${source}`);
    continue;
  }

  const incoming = readFileSync(from);
  const current = existsSync(to) ? readFileSync(to) : Buffer.alloc(0);

  if (incoming.equals(current)) {
    console.log(`  same     ${entry.file}`);
    continue;
  }

  changed++;
  const before = JSON.parse(current.length ? current.toString('utf8') : '{"policies":[]}');
  const after = JSON.parse(incoming.toString('utf8'));
  console.log(
    `  CHANGED  ${entry.file}  ${sha(current)} -> ${sha(incoming)}  ` +
      `(${before.policies?.length ?? 0} -> ${after.policies?.length ?? 0} policies)`,
  );
  pending.push([to, incoming]);
}

if (changed === 0) {
  console.log(`\nBaselines are already in sync with ${source}\n`);
  process.exit(0);
}

if (!write) {
  console.log(`\n${changed} file(s) differ. Re-run with --write to apply.\n`);
  process.exit(0);
}

for (const [to, buf] of pending) writeFileSync(to, buf);
console.log(`\nWrote ${pending.length} file(s). Running the census guard...\n`);

try {
  execFileSync('node', [join(ROOT, 'scripts/verify-baselines.mjs')], { stdio: 'inherit' });
} catch {
  console.error(
    `\nThe refreshed baselines contain something the taxonomy does not model.\n` +
      `Add the missing paths to src/domain/facetSpecs.ts before shipping - until then the\n` +
      `app would silently ignore that dimension and every comparison using it would be wrong.\n`,
  );
  process.exit(1);
}
