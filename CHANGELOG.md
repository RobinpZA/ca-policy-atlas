# Changelog

All notable changes to this project are documented here.
Format follows Keep a Changelog; versioning is MAJOR.MINOR.PATCH.

## [Unreleased]

## [0.4.0] - 2026-10-06

### Added

- **Learn** overlay (header button), a native modal dialog with two tabs.
  - **Anatomy** walks the fourteen ranks of a policy in board order: what each says, why
    it matters, the common mistake, and how a real baseline fills it in.
  - **Build** assembles a policy by dragging pieces into slots, or by click-then-Place for
    keyboard and touch. A plain-English readout and a "Before Entra will save it"
    checklist update live.
  - Five **challenges**, each scored against a real CIS, Maester or CISA baseline policy
    with the Coverage rules (`matchTenant`). There is no second scoring scheme.
  - **Compare in Atlas** adds the draft as a column. It goes out as Graph JSON through
    `normalizeGraphPolicy`, so it behaves exactly like a loaded tenant policy and never
    enters the URL.
- `builder: true` on `FacetSpec` marks the facets the builder offers, so
  `facetSpecs.ts` stays the only list of dimensions.
- Groups and named locations in the builder are clearly marked examples
  ("Break-glass accounts (example)"), never invented GUIDs. Directory roles are deferred
  until a verified role-template list exists.

### Changed

- Subtitle is now "learn, compare and check Conditional Access policies" (header,
  `package.json`, page meta, README).

## [0.3.0] - 2026-09-23

### Added

- Deployed to GitHub Pages from `main` (`.github/workflows/pages.yml`); the gate runs
  before every deploy. The header shows the build version, with the commit on CI builds.
- **Coverage** view: pick a baseline and see, for each of its policies, the closest loaded
  tenant policy, how many requirements it meets and which it misses, with a Compare
  button that opens the pair side by side. Scoring rules are in
  `src/domain/diff/coverage.ts`: a match must share a control (not just scope, and not
  just the grant operator), and a broader value is never counted as meeting a narrower one.
- **Export** the current comparison as CSV (Excel-safe: BOM, formula-injection defence)
  or Markdown (policies, verdict, dimension table, notes). Built and saved in the browser.
- Table view shows why each row differs, in words, and renders values as chips with shared
  values receding - the same encoding as the board.
- Tests against Microsoft's published Graph beta list-policies examples
  (`tests/fixtures/*.beta.json`): nulls, `@odata` annotations, an expanded built-in
  strength, every-time sign-in frequency, agent-identity filters.

### Changed

- Rank heights come from the rendered nodes. `nodeHeight()` is now the first-paint
  estimate and the fallback where no height is reported; each node reports its real
  height and the band follows. Positions are still hand-computed, so alignment stays
  structural.
- The fit-to-view no longer resets after you pan or zoom, until the rank plan changes.
- Fonts are bundled via `@fontsource-variable` (dev dependencies) instead of loaded from
  Google Fonts at runtime. No runtime network calls remain.

### Fixed

- Loaded tenant policies: authentication strength is identified by the built-in strength
  id (or the export's own displayName for a custom one). Graph's `requirementsSatisfied`
  is `mfa` for all three built-ins, so phishing-resistant MFA read as plain MFA.
- Loaded tenant policies: guest/external-user targeting and `transferMethods` are
  flattened from Graph's object and flags-string shapes into comparable sets. Both were
  previously dropped or compared as one opaque string.
- The census guard now runs over the raw Graph object too. Any populated Graph field no
  adapter reads is reported instead of vanishing; the old ignore list never matched.
- Source fields the comparison cannot see are now shown: "N not compared" on the column
  head and table header (hover for the paths), and in the load notice.
- A node holding both a coverage gap and a real difference now rolls up to `differs`;
  the two tied on severity and whichever came first won.
- Changing the selection clears a pinned or hovered rank. A stale one dimmed every node
  on the new board and lit none.
- Hovering no longer re-renders every node: nodes read a setter-only focus context.
- Sign-in frequency of 1 reads "1 day", not "1 days".

## [0.2.0] - 2026-09-19

### Added

- Verdict strip above the board: how many dimensions are in play, how many the selection
  agrees on, and a button per disagreeing dimension. Counts depend on which of the 94
  policies are selected, so there is nothing to precompute.
- Cross-column focus. Hovering or keyboard-focusing any node lights that dimension in
  every column and drops the rest back, so one dimension can be read sideways in one
  gesture. Driven by a single data attribute on the board and one generated CSS rule -
  no React Flow node is re-rendered on hover.
- **Differences only** toggle, hiding every rank the selection states identically. Head
  and outcome always survive. Serialised in the URL hash as `d=1`.

### Changed

- New theme, "Field Manual" (dark / roman-serif / warm), replacing "Instrument"
  (dark / humanist-sans / cool). Newsreader on the heads and outcomes, Switzer for UI,
  JetBrains Mono for every literal policy value.
- Re-themed to Lumen (Night Foundry drop): cool-violet-black canvas (hue 265) and a
  molten-brass accent, replacing Field Manual's warm-neutral canvas (hue 60) and ember
  amber. Switzer replaced by Geist for running UI. Newsreader kept for heads and
  outcomes deliberately - swapping it would invalidate `buildGraph.ts`'s measured
  per-character glyph-width table and risk reintroducing the 461-node overlap bug.
  Every contrast ratio in `tokens.css` re-measured against the new palette.
- Facet nodes now carry a fill and an edge. They were transparent, which left the board
  reading as grey text floating on grey bands. Agreement recedes by losing its edge and
  its contrast rather than its surface.
- Rank bands reduced from an alternating fill to a single hairline - with nodes now
  carrying surfaces, the tint read as stripes behind cards.
- Chain edges drawn straight rather than smoothstep, and at 2px. Every edge in this
  layout is a vertical drop; the path solver was rounding corners on a line without any.
- Node geometry recalibrated for the new faces, and rank spacing tightened 18px to 12px.
- App shell is now a fixed-height flex column with the rail and board scrolling
  internally, replacing a sticky rail pinned to a hardcoded 57px header offset.
- Type scale is now geometric (minor third off a 13px anchor) rather than near-linear.

### Fixed

- **Nodes with more text no longer overlap the rank below.** `.pnode` is auto-height, so
  an under-measured node does not clip - it grows past its allocated band and renders on
  top of the next rank. Four independent causes, measured in a browser across all 94
  policies and 220 random multi-column selections: `.prow`'s 3px row-gap was missing from
  the height sum entirely; four elements inherited `line-height: 1.5` while the layout
  assumed 15px; the head's meta was treated as text lines when it is a wrapping flex row
  with 8px gaps; and the content width ignored the border under `box-sizing: border-box`,
  which is a 2px error large enough to flip a wrap. 461 overlaps, worst 40px, now zero.
- Title line counting now uses a measured per-character width table for Newsreader rather
  than an average. An average cannot work for a proportional serif whose glyphs span
  0.279em to 1.0em, and it mis-counted 17 of the 94 policy names by a whole line each.
- Header no longer wraps to a second line at 1280px; the legend moved to the verdict row,
  beside the live counts that use the same encoding.
- App title no longer clipped at 375px.
- Picker rows are no longer a `role="listbox"` of `role="option"` items each wrapping a
  focusable button - two critical axe violations (nested-interactive, and `aria-selected`
  on a button). They are checkboxes, which is what they always were.
- Hidden file input removed from the accessibility tree; it was an unlabelled form element
  and a duplicate tab stop for the Load JSON button.
- Agreement recedes through opaque colour tokens instead of `opacity`. Browsers composite
  in gamma space, so 11px labels at 0.6 opacity measured 3.37:1 against a 4.5:1 floor.
  Axe is now clean.

### Added (testing)

- `tests/geometry.spec.ts` pins every node-height calculation against heights measured in
  a real browser, one-sided so under-estimation fails and over-estimation does not.

## [0.1.0] - 2026-09-18

### Added

- Side-by-side comparison of Conditional Access policies as React Flow graphs, with
  ranks aligned across every column so a dimension can be scanned horizontally.
- 94 baseline policies from Van Surksum (49), Maester (19), CIS M365 Foundations (16)
  and CISA SCuBA (10), loaded at build time.
- Facet model distinguishing six value forms - set, scalar, wildcard (`true`), negated
  (`false`), empty (`{}`), and absence - so the three "nothing here" cases stay distinct.
- Alias table canonicalising the corpus's dual encodings (`signInFrequency: true` vs
  `{isEnabled: true}`, and three others), which otherwise produce false differences.
- Diff statuses: same, differs, differs/coverage, conflict, only, missing - with
  per-value shared/unique breakdown inside a differing set.
- Client-side loader for exported Graph policies. No network calls; loaded policies are
  session-only and never enter the URL hash.
- Accessible table view of the same diff, and keyboard navigation across ranks and columns.
- Census guard (`npm run verify`) failing the build if a baseline leaf is unmodelled.
- App-id sync against merill/microsoft-info, resolved at build time.
- 82 tests across domain, layout, adapter and mount.

### Notes

- Diff semantics involve judgement calls - wildcard-vs-concrete, `Office365` vs `All`,
  and the alias table. Each is documented in the README and pinned by a test.
- `conditions.authenticationFlows` is a bare array in the baselines where Graph nests it
  under `transferMethods`. Handled here; `Format-PolicyFlowJson` in CA-BaselineAuditor
  reads `.transferMethods` and so renders nothing for those six policies.
