# CA Policy Atlas

Render Microsoft Entra Conditional Access policies as flow graphs, side by side, with every row where they disagree marked.

Ships with 94 curated baseline policies from four frameworks: Van Surksum (49), Maester (19), CIS Microsoft 365 Foundations (16) and CISA SCuBA (10). You can also load your own exported policies and measure them against any of those baselines.

Runs entirely in the browser. No backend, no network calls at runtime.

## Contents

- [Quick start](#quick-start)
- [What it is for](#what-it-is-for)
- [Features](#features)
- [Loading your own policies](#loading-your-own-policies)
- [Privacy](#privacy)
- [How a difference is decided](#how-a-difference-is-decided)
- [Development](#development)
- [Project layout](#project-layout)
- [Contributing](#contributing)
- [License](#license)

---

## Quick start

Requires **Node.js 20.19+ or 22.12+** (Vite 7).

```bash
npm install
npm run dev
```

To produce a static build (output in `dist/`, hostable on any static web server):

```bash
npm run build
npm run preview
```

---

## What it is for

The four baseline frameworks overlap heavily and disagree in small, consequential ways. One demands `["high","medium"]` sign-in risk where another demands `["high"]`. One requires MFA where another requires a phishing-resistant authentication strength. One says "sign-in frequency must be configured" and leaves the value to you; another pins it.

Those differences are invisible in a table and invisible in a one-policy-at-a-time viewer. They are obvious when the graphs sit in adjacent columns with the differing rows lit up.

Select one policy to read it. Select two or more (up to six) to compare them.

---

## Features

**Flow** is the default view: one column per selected policy, ranks aligned across columns so a dimension can be read sideways.

- **Verdict strip.** Tells you the result before you read the board: how many dimensions are in play, how many the selection agrees on, and which ones disagree. Each disagreeing dimension is a button.
- **Cross-column focus.** Hovering or focusing any node lights that dimension in every column and drops the rest back. "How do these six differ on Locations?" takes one gesture, not six reads.
- **Differences only.** Hides every row the selection states identically. A fourteen-rank board usually has about three rows of real disagreement, and this shows just those.
- **Keyboard navigation.** Tab into the board, then `↓`/`↑` to move down ranks, `←`/`→` to jump to the same rank in the next column, `Esc` to leave.

**Table** shows the same diff as an accessible table. It explains in words why each row differs.

**Coverage** answers the question people loading a tenant export usually have. Pick a baseline and, for each of its policies, see the closest loaded policy, how many requirements it meets and which it misses. A **Compare** button opens the pair side by side.

**Export** saves the current comparison as CSV (UTF-8 BOM for Excel, formula-injection safe) or Markdown (policies, verdict, dimension table, notes).

Selection, filters, view and the differences-only toggle are stored in the URL hash, so a comparison can be bookmarked or shared.

---

## Loading your own policies

**Load JSON** accepts a single `conditionalAccessPolicy`, a bare array, or the `{ "value": [...] }` envelope Graph and Graph Explorer return.

```powershell
Connect-MgGraph -Scopes 'Policy.Read.All'
Invoke-MgGraphRequest -Method GET `
  -Uri 'https://graph.microsoft.com/beta/identity/conditionalAccess/policies' `
  -OutputType Json | Out-File policies.tenant.json
```

Save the export outside any synced or shared folder. The `.tenant.json` suffix is gitignored as a backstop.

Baselines often assert `true` ("configure this, the value is yours"), but a real policy always has a concrete value. So baseline-vs-tenant comparisons usually land on a *specificity* difference. That reading is correct: the baseline wants the dimension configured, and yours has this particular value.

Source fields the comparison cannot see are reported rather than dropped. "N not compared" appears on the column head and table header (hover for the paths) and in the load notice.

---

## Privacy

- **Client-side only.** Files are read with `FileReader`. No upload, telemetry or analytics, and no network call of any kind. Fonts are bundled.
- **Session-only.** Loaded policies are held in memory and gone on reload. They are never written to the URL hash or to browser storage.
- **Sharing a link** shares the baseline columns, filters and any search text. It never includes loaded policies. Avoid searching for tenant-specific names in a link you plan to share.
- **Exports include loaded policies.** The file is built in the browser and saved to your own disk.

---

## How a difference is decided

Everything is reduced to a `FacetMap` (one entry per dimension a policy asserts) before anything is compared. The curated baselines and real Graph policies each have their own adapter that produces the same shape. That is why the tenant loader is a small feature rather than a second application.

A dimension's value is one of six things, and treating any two as the same gives a wrong answer:

| Form | Meaning |
|---|---|
| array | an explicit expectation |
| bare string | a single scalar value |
| `true` | **wildcard**: must be configured, value is tenant-defined |
| `false` | **negated**: must be present *and* false |
| `{}` / `[]` | **empty**: declared, nothing specified |
| *absent* | the policy does not mention this dimension at all |

Absence is modelled as *no map entry*. That is exactly what keeps it distinct from wildcard and from empty.

Some rules are judgements rather than facts:

- **Set comparison ignores case, order and duplicates.** `["high","medium"]` and `["medium","high"]` both ship in the corpus today, as do `All` and `all`. Without this, the tool would report differences that do not exist.
- **A wildcard is not equal to a concrete value.** "This must be configured" and "this must equal X" are different assertions. Treating them as the same would hide the most interesting kind of disagreement: which framework is stricter.
- **Opposite polarity is a conflict, not merely a difference.** `requireCompliant: true` against `false` means one policy targets compliant devices and the other targets non-compliant ones.
- **`Office365` and `All` stay different,** with a note explaining that one contains the other. Quietly calling a superset "the same" is a judgement the tool is not in a position to make.
- **The alias table in `src/domain/aliases.ts` is a semantic assertion.** The corpus writes `signInFrequency: true` in seven policies and `{isEnabled: true}` in one, and this app treats them as the same claim. If that reading is wrong, the diff under-reports. That is why the table is one file you can review rather than logic buried in a parser.
- **Coverage scoring** lives in `src/domain/diff/coverage.ts`, with one test per rule in `tests/coverage.spec.ts`. A match must share a control, not just scope or the grant operator. A broader value never counts as meeting a narrower one.

Application identifiers that cannot be named are rendered as truncated GUIDs with the full value on hover. **They are never given an invented name.** A reader can tell that `a4f2693f…` needs looking up, but cannot tell that a plausible-sounding wrong label is wrong.

---

## Development

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Census guard, typecheck, then production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run check` | The full gate: census guard + typecheck + lint + tests |
| `npm run verify` | Census guard over the baseline files (see below) |
| `npm run lint` | ESLint |
| `npm test` | Vitest, single run (`npm run test:watch` to watch) |
| `npm run sync-baselines` | Re-copy baselines from CA-BaselineAuditor (dry run; `-- --write` to apply) |
| `npm run sync-app-ids` | Resolve unknown app GUIDs (dry run; `-- --write` to apply) |

### The census guard

`npm run verify` walks every leaf of every baseline policy and **fails if anything is unaccounted for**. The tenant loader applies the same check to the raw Graph object and reports any populated field no adapter reads.

It protects against silent errors, not broken builds. Without it, a baseline refresh could add a dimension this app does not model, the app would ignore it, and every comparison involving that dimension would be wrong with no visible symptom. The fix is to add the path to `src/domain/facetSpecs.ts`.

### Baseline data

The files in `src/data/baselines/` are external data. Never hand-edit them. `npm run sync-baselines` copies them from a sibling checkout of CA-BaselineAuditor, at the path set by `syncSourcePath` in `config/app.config.json` (default `../CA-BaselineAuditor/Baselines`). Override it with `-- --from=<path>`. After `--write`, the census guard runs automatically.

### Application names

`npm run sync-app-ids` resolves application GUIDs against [merill/microsoft-info](https://github.com/merill/microsoft-info) (the same dataset CA-Reporter uses) and writes the results to `config/app-ids.json`. It runs at build time, not at runtime, because the app makes no network calls. To add a name by hand, add a verified entry with its source.

### Manual checks

The tests cover the domain logic, layout invariants, node geometry and that the app mounts and renders. These checks still need a person:

- **Greyscale check.** Desaturate a screenshot. Block and grant terminals must stay distinguishable. If they do not, the design has drifted back onto hue.
- **Keyboard walk.** Every binding listed under [Features](#features), especially `Esc`.
- **Six columns at 1280px.** This is where the ghost union gets dense.
- **A real tenant export**, loaded through Load JSON, compared, and checked in Coverage.

---

## Project layout

```
config/          baseline registry, app-id map
scripts/         census guard, baseline sync, app-id sync
src/
  data/          the four baseline files + loader
  domain/        types · facetSpecs · aliases · adapters · graph · diff (compare, coverage, export)
  state/         reducer + hash sync, cross-column focus, node measurement
  components/    picker · compare board · flow nodes · diff table · coverage · ui
  styles/        tokens.css (read this first) · global · flow
tests/           domain, coverage, export, layout, geometry, adapter, Graph fixtures, mount smoke
```

`src/domain/facetSpecs.ts` is the single source of truth for extraction, node membership, rank order, the diff's path union and the census guard. Start there.

Visual design rules (the one-accent budget and its arithmetic, and which channels carry meaning instead of colour) are documented at the top of `src/styles/tokens.css`. Read them before changing any styling.

Built with React 19, TypeScript and Vite. The only runtime dependency beyond React is [`@xyflow/react`](https://reactflow.dev) v12. Layout is hand-computed rather than delegated to dagre or elk, because a layout engine would break the cross-column rank alignment.

---

## Contributing

`npm run check` must pass before a change is merged. Repo-specific rules for humans and agents are in [AGENTS.md](AGENTS.md). Notable changes go in [CHANGELOG.md](CHANGELOG.md).

---

## License

[MIT](LICENSE) © Robin Pieterse · Turrito Networks
