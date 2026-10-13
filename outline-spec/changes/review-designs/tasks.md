# Tasks

## 1. Glob entries in file tabs

- [x] 1.1 In `buildTabs` (`src/core/review.ts`), expand a `from` entry that `isGlobPattern` recognizes with `resolveArtifactOutputs` from `src/core/artifact-graph/outputs.ts`, sorted by name, and name each file by its change-relative path with `/` separators; plain entries keep the existing lookup. Verify with tests in `test/core/review.test.ts` using `path.join` for fixtures: a glob matching two files lists both in order, a glob matching none drops the tab.
- [x] 1.2 Add `kind: 'html' | 'markdown'` to each file in the markdown tab payload, from the file's extension (`.html` or `.htm` is html, case-insensitive). Verify with a test.
- [x] 1.3 Confirm `outline-spec schema validate` accepts `designs/*.html` in a tab's `from` and still rejects `..` and absolute paths. Verify with tests in the schema-validate suite.

## 2. Design frames in the review template

- [x] 2.1 In `schemas/outline/templates/review.html`, render an html file as a labeled `iframe` with `srcdoc` set to the file and `sandbox="allow-scripts allow-forms allow-modals allow-popups"` (no `allow-same-origin`), full tab width, starting at 80vh, vertically resizable. Verify by rendering a change with a design whose script sets a variable on `parent`, and confirming in a browser it runs, its styles apply, and the parent page is untouched.
- [x] 2.2 Check the page in light and dark and at phone width: frames never cause horizontal page scroll. Verify in a browser.

## 3. Optional artifacts

- [x] 3.1 Add `optional: z.boolean().optional()` to `ArtifactSchema`; in `ArtifactGraph`, `getNextArtifacts` and `getBlocked` treat a missing optional dependency as met, and `isComplete` ignores missing optional artifacts. Verify with graph tests in `test/core/artifact-graph/`.
- [x] 3.2 In `formatChangeStatus`, set `optional: true` on optional entries only; `resolveNextStep` skips optional artifacts; `printStatusText` appends `(optional)` and counts only required plus existing optional artifacts; the no-apply-block apply check requires only required artifacts. Verify with status tests: a change with outline, diagrams, and tasks reads `3/3`, `All planning artifacts complete!`, and next step apply; with a design it reads `4/4`.
- [x] 3.3 In `src/core/view.ts`, show a missing optional artifact as `id (optional)`. Verify with a view test.
- [x] 3.4 Mark `designs` `optional: true` in `schemas/outline/schema.yaml`, document `optional` in `docs/schema.md`, and fix the remaining suite failures that only list the outline schema's artifacts.

## 4. Schema, workflows, docs

- [x] 4.1 Add a `designs` artifact to `schemas/outline/schema.yaml`: `generates: designs/*.html`, `requires: [outline]`, an instruction that starts "Create only when the change adds or changes something a person sees" and asks for one self-contained HTML page per design (inline CSS/JS, CDN scripts allowed) named for what it shows, and a template file. Add the Designs tab between Diagrams and Spec changes. Verify with `outline-spec schema validate outline` and `outline-spec instructions designs --change <c> --json`.
- [x] 4.2 In `src/core/templates/workflows/update-change.ts`, render the review page when the revision changed the outline's Requirements or a design. Run `pnpm generate:skills` and `pnpm regen:parity-hashes`, and verify the generated skills contain the new wording.
- [x] 4.3 Document the `designs` artifact, the Designs tab, and glob `from` entries in `docs/schema.md` and `docs/configuration.md`, and add a CHANGELOG entry. Verify every command or flag named exists via `--help`.
- [ ] 4.4 Run `pnpm build && pnpm exec tsc --noEmit && pnpm lint && pnpm test`, and confirm the Windows CI job passes for the glob path tests.

## 5. Archive

- [ ] 5.1 Run `outline-spec validate review-designs`, then `outline-spec archive review-designs` to apply outline.md to the live specs
