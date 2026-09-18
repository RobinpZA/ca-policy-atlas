# AGENTS.md - CA Policy Atlas

React + TypeScript + Vite. React Flow via `@xyflow/react` v12. No other runtime deps.

Global conventions come from `~/Brain`. This file holds only what is specific to this repo.

## Read first

`src/domain/facetSpecs.ts` is the single source of truth for extraction, node membership,
rank order, the diff's path union, and the census guard. Nothing else should hold a list
of policy dimensions.

`src/styles/tokens.css` carries the theme rationale and the accent-budget arithmetic.

## Rules specific to this project

- **The baseline JSON is external data.** Never hand-edit files in `src/data/baselines/`.
  Use `npm run sync-baselines`. If a refresh adds a dimension, add it to `facetSpecs.ts` -
  `npm run verify` fails until you do, which is the point.
- **Never invent a name for an application GUID.** Unresolved identifiers render as
  truncated GUIDs. Use `npm run sync-app-ids` or add a verified entry to
  `config/app-ids.json` with its source.
- **No network calls at runtime, ever.** People load real tenant policy exports into this.
  Lookups happen at build time and get written into the repo.
- **Loaded tenant policies stay out of the URL hash** and out of git (`*.tenant.json`).
- **Absence, wildcard and empty are three different claims.** Any code that treats them
  alike is a bug, even when it reads more simply.
- **Diff logic operates on `FacetMap`, never on graph nodes.** That separation is what
  keeps the semantics testable without React.
- **Layout is hand-computed on purpose.** Do not introduce dagre or elk: a layout engine
  optimises each column independently and destroys cross-column rank alignment, which is
  the product. `tests/layout.spec.ts` guards this.
- **One accent, under 3% of viewport.** Encode meaning with rank, weight, silhouette,
  font family, opacity and bar width instead. Redo the arithmetic in the README before
  widening any highlight.
- CSS references tokens by name. No literal colour or font values outside `tokens.css`.

## Gate

`npm run check` - census guard, typecheck, lint, tests. All four must pass.
