# Changelog

All notable changes to this project are documented here.
Format follows Keep a Changelog; versioning is MAJOR.MINOR.PATCH.

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
