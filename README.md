# CA Policy Atlas

Render Microsoft Entra Conditional Access policies as flow graphs, side by side, with every row where they disagree marked.

Ships with 94 curated baseline policies from four frameworks — Van Surksum, Maester, CIS Microsoft 365 Foundations, and CISA SCuBA. You can also load your own exported policies.

```bash
npm install
npm run dev
```

---

## What it is for

The four baseline frameworks overlap heavily and disagree in small, consequential ways. One demands `["high","medium"]` sign-in risk where another demands `["high"]`. One requires MFA where another requires a phishing-resistant authentication strength. One says "sign-in frequency must be configured" and leaves the value to you; another pins it.

Those differences are invisible in a table and invisible in a one-policy-at-a-time viewer. They are obvious when the graphs sit in adjacent columns with the differing rows lit up.

Select one policy to read it. Select two or more to compare them.

---

## Loading your own policies

**Load JSON** accepts a single `conditionalAccessPolicy`, a bare array, or the `{ "value": [...] }` envelope Graph and Graph Explorer return.

```powershell
Connect-MgGraph -Scopes 'Policy.Read.All'
Invoke-MgGraphRequest -Method GET `
  -Uri 'https://graph.microsoft.com/beta/identity/conditionalAccess/policies' |
  ConvertTo-Json -Depth 20 | Out-File policies.tenant.json
```

**This is entirely client-side.** `FileReader` only — no upload, no telemetry, no analytics, no network call of any kind. Loaded policies are session-only, are never written to the URL hash, and `*.tenant.json` is gitignored. Sharing a comparison that includes loaded policies shares only the baseline columns.

Because baselines frequently assert `true` ("configure this, the value is yours") while a real policy always has a concrete value, baseline-vs-tenant comparisons usually land on a *specificity* difference. That reads correctly: the baseline wants the dimension configured, and yours is configured thus.

---

## How a difference is decided

Everything is reduced to a `FacetMap` — one entry per dimension a policy asserts — before anything is compared. Both the curated baselines and real Graph policies go through their own adapter into that same shape, which is why the tenant loader is a small feature rather than a second application.

A dimension's value is one of six things, and conflating any two of them produces a wrong answer:

| Form | Meaning |
|---|---|
| array | an explicit expectation |
| bare string | a single scalar value |
| `true` | **wildcard** — must be configured, value is tenant-defined |
| `false` | **negated** — must be present *and* false |
| `{}` / `[]` | **empty** — declared, nothing specified |
| *absent* | the policy does not mention this dimension at all |

Absence is modelled as *no map entry*, which is precisely what keeps it distinct from wildcard and from empty.

Decisions worth knowing about, because they are judgements rather than facts:

- **Set comparison folds case, order and duplicates.** `["high","medium"]` and `["medium","high"]` both ship in the corpus today, as do `All` and `all`. Without this, the tool would report differences that do not exist.
- **A wildcard is not equal to a concrete value.** "This must be configured" and "this must equal X" are different assertions. Treating them as the same would hide the most interesting class of disagreement — which framework is stricter.
- **Opposite polarity is a conflict, not merely a difference.** `requireCompliant: true` against `false` means one policy targets compliant devices and the other targets non-compliant ones.
- **`Office365` and `All` stay different,** with a note explaining the containment. Silently calling a superset "the same" is a judgement the tool is not in a position to make.
- **The alias table in `src/domain/aliases.ts` is a semantic assertion.** The corpus writes `signInFrequency: true` in seven policies and `{isEnabled: true}` in one; this app treats them as the same claim. If that reading is wrong the diff under-reports, which is why the table is one visible reviewable file rather than logic buried in a parser.

Application identifiers that cannot be named are rendered as truncated GUIDs with the full value on hover. **They are never given an invented name** — a reader can tell that `a4f2693f…` needs looking up, but cannot tell that a plausible-sounding wrong label is wrong.

---

## Why it looks like this

The graph wants to colour-code ten node types. It cannot: the design budget is one accent (two maximum) covering under 3% of any viewport, and semantic status colours count against it.

So meaning is carried by channels that are not hue — rank position, fill and weight, silhouette, font family (mono means a literal policy value, sans means the app's own prose), opacity, and **bar width**. One accent, three weights. It is spent on exactly one thing: which row differs.

Worst case, six columns by fourteen ranks with everything differing:

```
6 × 14 × 3px × 44px = 11,088px²   against   1440 × 900 = 1,296,000px²   =  0.86%
```

Comfortably inside budget — but only while the highlight stays a row-level bar. **If you ever widen it to whole nodes, redo this sum first.**

One measured correction worth keeping in mind: on a dark theme, *fill* cannot carry the block-vs-grant distinction. There is almost no luminance headroom below the paper colour, so even a generous fill step measures ~1.5:1 against an open terminal, which is close to invisible in greyscale. The distinction is carried by type weight and case, and by the stop-bar rule across the top edge; fill only supports it.

Theme, type and token rationale are stamped at the top of `src/styles/tokens.css`.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Verify, typecheck, then production build |
| `npm run check` | The full gate: verify + typecheck + lint + tests |
| `npm run verify` | Census guard over the baseline files (see below) |
| `npm run sync-baselines` | Re-copy baselines from CA-BaselineAuditor (`-- --write` to apply) |
| `npm run sync-app-ids` | Resolve unknown app GUIDs (`-- --write` to apply) |

### The census guard

`npm run verify` walks every leaf of every policy and **fails if anything is unaccounted for**.

The risk it addresses is not that a baseline refresh breaks the build — it is that a refresh adds a dimension this app does not model, the app silently ignores it, and every comparison involving that dimension is quietly wrong with no visible symptom. Adding a path to `src/domain/facetSpecs.ts` is the fix.

`npm run sync-app-ids` resolves application GUIDs against [merill/microsoft-info](https://github.com/merill/microsoft-info) — the same dataset CA-Reporter uses — at build time, writing results into `config/app-ids.json`. It is deliberately not a runtime lookup: the app promises it makes no network calls.

---

## Still needs a human

Automated checks cover the domain logic, the layout invariants and that the app mounts and renders. These do not:

- **Greyscale check.** Desaturate a screenshot. Block and grant terminals must stay distinguishable. If they do not, the design has drifted back onto hue.
- **Keyboard walk.** Tab into the board, `↓`/`↑` to move down ranks, `←`/`→` to jump to the same rank in the next column, `Esc` to leave. That last binding is the whole product as a keystroke.
- **Six columns at 1280px.** The point at which the ghost union gets dense.
- **A real tenant export**, round-tripped through Load JSON.

---

## Layout

```
config/          baseline registry, app-id map
scripts/         census guard, baseline sync, app-id sync
src/
  data/          the four baseline files + loader
  domain/        types · facetSpecs · aliases · adapters · graph · diff
  state/         reducer, hash sync, linked viewport
  components/    picker · compare board · flow nodes · diff table
  styles/        tokens.css (read this first) · global · flow
tests/           domain, layout, adapter, and mount smoke tests
```

`src/domain/facetSpecs.ts` is the single source of truth for extraction, node membership, rank order, the diff's path union, and the census guard. Start there.

---

MIT © Robin Pieterse · Turrito Networks
