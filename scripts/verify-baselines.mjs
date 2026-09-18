/**
 * Census guard. Zero dependencies.
 *
 * The baseline files are external data on a quarterly-ish refresh cycle. The danger is
 * not that a refresh breaks the build - it is that a refresh adds a dimension this app
 * does not model, the app silently ignores it, and every comparison involving that
 * dimension is quietly wrong with no visible symptom.
 *
 * So: walk every leaf of every policy, and fail if anything is unaccounted for.
 *
 * Run with `npm run verify`. Node 24 strips the TS types from the imported modules, so
 * the taxonomy is read from the same source the app uses - it can never drift from it.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { FACET_SPECS, SPEC_PATHS } from '../src/domain/facetSpecs.ts';
import { applyAliases } from '../src/domain/aliases.ts';
import { deepClone, leafPaths, isPlainObject } from '../src/domain/objectPath.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const config = readJson('config/app.config.json');
const appIds = readJson('config/app-ids.json');
const knownAppIds = new Set(
  Object.keys(appIds)
    .filter((k) => !k.startsWith('$'))
    .map((k) => k.toLowerCase()),
);

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Leaf value kinds we know how to interpret. Anything else is a modelling gap. */
const jsonKind = (v) => {
  if (v === true || v === false) return 'boolean';
  if (typeof v === 'string') return 'string';
  if (typeof v === 'number') return 'number';
  if (Array.isArray(v)) return 'array';
  if (isPlainObject(v)) return 'object';
  if (v === null) return 'null';
  return typeof v;
};
const ACCEPTED_KINDS = new Set(['boolean', 'string', 'array', 'object', 'number']);

const seenKeys = new Set();
const pathCensus = new Map();
const unresolvedAppIds = new Map();
let totalPolicies = 0;

for (const entry of config.baselines) {
  let file;
  try {
    file = readJson(join('src/data/baselines', entry.file));
  } catch (e) {
    fail(`${entry.file}: cannot read - ${e.message}`);
    continue;
  }

  if (file.baselineKey && file.baselineKey !== entry.key) {
    fail(
      `${entry.file}: baselineKey is "${file.baselineKey}" but the registry says "${entry.key}". ` +
        `The file may have been swapped.`,
    );
  }

  if (typeof file.totalPolicies === 'number' && file.totalPolicies !== file.policies.length) {
    fail(
      `${entry.file}: totalPolicies says ${file.totalPolicies}, array holds ${file.policies.length}.`,
    );
  }

  for (const policy of file.policies) {
    totalPolicies++;
    const key = `${entry.key}~${policy.id}`;
    if (seenKeys.has(key)) fail(`Duplicate policy key: ${key}`);
    seenKeys.add(key);

    const where = `${entry.key}/${policy.id}`;

    if (!policy.matchPatterns || !isPlainObject(policy.matchPatterns)) {
      fail(`${where}: matchPatterns is missing or not an object.`);
      continue;
    }

    const mp = applyAliases(deepClone(policy.matchPatterns));
    const leaves = leafPaths(mp);
    let recognised = 0;

    for (const leaf of leaves) {
      // Walk to the leaf value for type checking.
      let v = mp;
      for (const seg of leaf.split('.')) v = v?.[seg];

      const kind = jsonKind(v);
      pathCensus.set(leaf, (pathCensus.get(leaf) ?? 0) + 1);

      if (!SPEC_PATHS.has(leaf)) {
        fail(
          `${where}: leaf "${leaf}" (${kind}) is not claimed by any FacetSpec. ` +
            `Add it to src/domain/facetSpecs.ts or the app will silently ignore it.`,
        );
        continue;
      }
      recognised++;

      if (!ACCEPTED_KINDS.has(kind)) {
        fail(`${where}: leaf "${leaf}" holds an uninterpretable ${kind}.`);
      }

      // Application identifiers we cannot name render as truncated GUIDs. That is
      // correct but terse, so surface them - the fix is a line in config/app-ids.json.
      if (leaf === 'applications.includeApplications' || leaf === 'applications.excludeApplications') {
        const values = Array.isArray(v) ? v : [];
        for (const raw of values) {
          if (typeof raw !== 'string') continue;
          if (knownAppIds.has(raw.toLowerCase())) continue;
          if (!GUID_RE.test(raw)) continue;
          const list = unresolvedAppIds.get(raw) ?? [];
          list.push(where);
          unresolvedAppIds.set(raw, list);
        }
      }
    }

    if (recognised === 0) {
      fail(`${where}: matchPatterns yielded zero recognised facets.`);
    }
  }
}

// -- unused specs ------------------------------------------------------------
// Not an error: exclusion and Graph-only specs exist for loaded tenant policies, which
// the baselines never exercise. Reported so the taxonomy stays honest about its coverage.
const unusedSpecs = FACET_SPECS.filter((s) => !pathCensus.has(s.path)).map((s) => s.path);

// -- report ------------------------------------------------------------------
console.log(`\nCA Policy Atlas - baseline census`);
console.log(`${'-'.repeat(60)}`);
console.log(`Files            ${config.baselines.length}`);
console.log(`Policies         ${totalPolicies}`);
console.log(`Distinct leaves  ${pathCensus.size}`);
console.log(`Specs declared   ${FACET_SPECS.length}  (${unusedSpecs.length} unused by baselines)`);

if (unresolvedAppIds.size) {
  console.log(`\nUnresolved application GUIDs (${unresolvedAppIds.size}) - add to config/app-ids.json:`);
  for (const [guid, where] of unresolvedAppIds) {
    console.log(`  ${guid}  used by ${where.join(', ')}`);
  }
  warn(`${unresolvedAppIds.size} application GUID(s) render as truncated identifiers.`);
}

if (unusedSpecs.length) {
  console.log(`\nSpecs not exercised by any baseline (expected for tenant-only dimensions):`);
  for (const p of unusedSpecs) console.log(`  ${p}`);
}

if (warnings.length) {
  console.log(`\nWarnings (${warnings.length}):`);
  for (const w of warnings) console.log(`  ! ${w}`);
}

if (errors.length) {
  console.error(`\nFAILED - ${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`  x ${e}`);
  console.error('');
  process.exit(1);
}

console.log(`\nOK - every leaf in all ${totalPolicies} policies is claimed by the taxonomy.\n`);
