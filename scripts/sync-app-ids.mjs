/**
 * Resolve application GUIDs from merill/microsoft-info into config/app-ids.json.
 *
 * Same data source as CA-Reporter's Get-MerillAppInfo.ps1, but resolved at BUILD time
 * and written into the repo, never fetched at runtime. That matters: the app promises
 * it makes no network calls, because people load their own tenant policy exports into
 * it. A runtime lookup would quietly break that promise.
 *
 * Only identifiers the baselines actually reference are written - the upstream dataset
 * is ~4400 entries and bundling all of it to name about thirty apps would be waste.
 *
 * Usage:  npm run sync-app-ids           (report what is missing)
 *         npm run sync-app-ids -- --write (apply)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SOURCE =
  'https://raw.githubusercontent.com/merill/microsoft-info/main/_info/MicrosoftApps.json';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_IDS_PATH = join(ROOT, 'config', 'app-ids.json');
const write = process.argv.includes('--write');

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// -- which GUIDs do the baselines actually use? ------------------------------
const config = readJson(join(ROOT, 'config', 'app.config.json'));
const used = new Set();

for (const entry of config.baselines) {
  const file = readJson(join(ROOT, 'src/data/baselines', entry.file));
  for (const policy of file.policies) {
    const apps = policy.matchPatterns?.applications;
    if (!apps || typeof apps !== 'object') continue;
    for (const key of ['includeApplications', 'excludeApplications']) {
      const v = apps[key];
      if (!Array.isArray(v)) continue;
      for (const raw of v) if (typeof raw === 'string' && GUID_RE.test(raw)) used.add(raw);
    }
  }
}

const appIds = readJson(APP_IDS_PATH);
const known = new Set(
  Object.keys(appIds)
    .filter((k) => !k.startsWith('$'))
    .map((k) => k.toLowerCase()),
);
const missing = [...used].filter((g) => !known.has(g.toLowerCase()));

console.log(`\nApplication GUIDs referenced by baselines: ${used.size}`);
console.log(`Already named in config/app-ids.json:      ${used.size - missing.length}`);

if (missing.length === 0) {
  console.log(`\nNothing to resolve.\n`);
  process.exit(0);
}

console.log(`Missing:                                   ${missing.length}\n`);

// -- fetch --------------------------------------------------------------------
let dataset;
try {
  const res = await fetch(SOURCE, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  dataset = await res.json();
} catch (err) {
  // Matching Get-MerillAppInfo.ps1: no network is not a failure, it just means the
  // unresolved identifiers keep rendering as truncated GUIDs, which is still honest.
  console.error(`Could not fetch ${SOURCE}\n  ${err.message}`);
  console.error(`Leaving config/app-ids.json untouched.\n`);
  process.exit(0);
}

// Graph-sourced entries describe real service principals; EntraDocs entries also carry
// permission and role names. Prefer Graph, fall back to whatever exists.
const byId = new Map();
for (const e of dataset) {
  if (!e?.AppId || !e?.AppDisplayName) continue;
  const id = e.AppId.toLowerCase();
  const existing = byId.get(id);
  if (!existing || (existing.source !== 'Graph' && e.Source === 'Graph')) {
    byId.set(id, { name: e.AppDisplayName, source: e.Source });
  }
}

const resolved = [];
const stillMissing = [];
for (const guid of missing) {
  const hit = byId.get(guid.toLowerCase());
  if (hit) resolved.push([guid, hit.name, hit.source]);
  else stillMissing.push(guid);
}

if (resolved.length) {
  console.log(`Resolved from merill/microsoft-info (${dataset.length} entries):`);
  for (const [guid, name, source] of resolved) console.log(`  ${guid}  ${name}  [${source}]`);
}
if (stillMissing.length) {
  console.log(`\nStill unresolved - these render as truncated GUIDs, which is correct:`);
  for (const guid of stillMissing) console.log(`  ${guid}`);
}

if (!write) {
  console.log(`\nDry run. Re-run with --write to apply.\n`);
  process.exit(0);
}

for (const [guid, name] of resolved) appIds[guid] = name;
writeFileSync(APP_IDS_PATH, `${JSON.stringify(appIds, null, 2)}\n`, 'utf8');
console.log(`\nWrote ${resolved.length} entries to config/app-ids.json\n`);
