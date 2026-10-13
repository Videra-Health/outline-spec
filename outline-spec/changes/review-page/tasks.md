# Tasks

## 1. Schema and config

- [ ] 1.1 Add an optional `review` block (`template`, `tabs[{ title, from? | view? }]`) to `SchemaYamlSchema` in `src/core/artifact-graph/types.ts`; unit-test valid, neither/both of `from`/`view`, and unknown view.
- [ ] 1.2 Teach `outline-spec schema validate` to report bad tabs and a missing template file; test with a fixture schema.
- [ ] 1.3 Parse `review-on` and `review.tabs` field by field in `readProjectConfig`, warning on unknown workflows and invalid tabs; tests for config-loading details k–n.
- [ ] 1.4 Add `reviewUrl` to `CHANGE_METADATA_KNOWN_KEYS` and the metadata schema; test read/write round-trip.
- [ ] 1.5 Update `docs/configuration.md` and `docs/schema.md` for `review-on`, `review.tabs`, and the schema `review` block.

## 2. Page data

- [ ] 2.1 Build the banner from `validateChange` and `collectPending` overlaps; test a clean change, an invalid one, and two overlapping changes.
- [ ] 2.2 Build the `spec-changes` view from `planChange`: per spec new/removed, per requirement added/edited/removed, edited ones as `diffWords` segments of live vs planned text, table edits from pending; test each case against fixture specs.
- [ ] 2.3 Build markdown tabs from `from` files in order, skipping missing files and dropping all-missing tabs; test both.

## 3. Template and command

- [ ] 3.1 Write `schemas/outline/templates/review.html`: tabs, banner, outline diff styling for `<del>`/`<strong>`, Mermaid blocks, spec-changes rendering, light and dark; payload in `<script type="application/json" id="outline-spec-review">`.
- [ ] 3.2 Add the `review` block to `schemas/outline/schema.yaml` with Outline, Diagrams, and Spec changes tabs.
- [ ] 3.3 Add `outline-spec review <change>` with `--json`, `--for <workflow>`, `--url <link>`; temp path via `path.join(os.tmpdir(), 'outline-spec-review', <hash>-<basename>, '<change>.html')`; payload escaped against `</script>`. CLI e2e tests for render, `--for` gated off, `--url` recorded, unknown change, and a schema with no review block.
- [ ] 3.4 Assert expected paths with `path.join` in tests so they pass on the Windows CI job; check the `windows-pwsh` job is green.
- [ ] 3.5 Open the rendered page for this change in a browser and check each tab and the banner by eye.
- [ ] 3.6 Add `review` to `docs/cli.md` and a CHANGELOG entry.

## 4. Workflows

- [ ] 4.1 In `src/core/templates/workflows/propose.ts`, after all artifacts exist: run `review --for propose --json`; if enabled and the agent can publish an HTML page, publish it privately (at `reviewUrl` when set), record with `--url`; otherwise give the path; say nothing when disabled.
- [ ] 4.2 Same in `update-change.ts`, run only when the revision rewrote `outline.md`, with `--for update`.
- [ ] 4.3 `pnpm generate:skills && pnpm regen:parity-hashes`; parity tests pass.

## 5. Archive

- [ ] 5.1 Run `pnpm build && pnpm exec tsc --noEmit && pnpm lint && pnpm test`.
- [ ] 5.2 Run `outline-spec validate review-page`, then `outline-spec archive review-page` to apply outline.md to the live specs.
