# Tasks

## 1. Flat layout core

- [ ] 1.1 In `src/core/outline/specs.ts`, add a `SPEC_EXT = '.md'` constant and make `specFile()` return `path.join(specsDir, ...id.split('/')) + SPEC_EXT`; verify with a unit test that nested ids build OS-native paths via `path.join`.
- [ ] 1.2 Make `writePlan()` create parent folders for new specs, delete only the spec file for a removed spec, then remove area folders it leaves empty up to (never including) `specsDir`; test create, delete, and nested-delete cases.
- [ ] 1.3 Rewrite `discoverSpecFiles()` in `src/utils/spec-discovery.ts` to return every `*.md` file (id = relative path minus `.md`, `/`-joined), skipping dot entries and non-`.md` files, keeping the existing symlink confinement and sort; update its docstring and `test/utils` tests.
- [ ] 1.4 Reject a spec id whose last segment is `spec` in `specNameProblem()`, so a flat spec can never look like an old-layout one; test it.

## 2. Old-layout guard

- [ ] 2.1 Add `findOldLayoutSpecs(specsDir)` (folders under `specs/` holding a `spec.md`) and an `OldSpecLayoutError` carrying the paths and the root, with code `old_spec_layout` and the fix `outline-spec migrate-specs`.
- [ ] 2.2 Throw it from `resolveRootForCommand()` after the root resolves, with an opt-out flag used only by `migrate-specs` and `init`; render it as text or, under `--json`, through the existing failure payload; test both forms and the exit code.
- [ ] 2.3 Cover the command paths that don't go through `resolveRootForCommand()` (`src/commands/spec.ts` uses `SPECS_DIR` directly): call the same check there; test `outline-spec spec show` on an old-layout repo.
- [ ] 2.4 In `src/core/references.ts`, read referenced specs at `<root>/outline-spec/specs/<id>.md` and run the same check on the referenced root, naming it in the error; test with a fixture referenced repo in each layout.

## 3. Path sites

- [ ] 3.1 Replace every hand-built `<id>/spec.md` path with `specFile()`: `src/commands/validate.ts` (two sites), `src/commands/spec.ts` (display and not-found messages), `src/commands/change.ts` (diff headers), `src/commands/migrate-specs.ts` report path; verify with `grep -rn "'spec.md'" src` returning only the guard and migration code.
- [ ] 3.2 Update `src/core/validation/validator.ts` so parse labels name the real file; check a validation error message shows `specs/<id>.md`.
- [ ] 3.3 Update every test and fixture under `test/` that builds `<id>/spec.md` (about 38 files across `cli-e2e`, `commands`, `core`, `utils`, `helpers`, `specs`) to the flat layout, using `path.join` for expected paths; run each affected file with `pnpm exec vitest run <file>`.

## 4. Migration

- [ ] 4.1 In `src/commands/migrate-specs.ts`, before format conversion, move each `findOldLayoutSpecs()` result to `specFile(id)`: `git mv` when the specs root is in a git work tree (reuse `GIT_WRITE_EXEC_OPTIONS` from `src/core/store/git.ts`), else `fs.rename`; remove the emptied folder, keep and report one with other files.
- [ ] 4.2 Report a conflict and skip the move when `<id>.md` already exists; exit non-zero after moving the rest; test it.
- [ ] 4.3 Honour `--dry-run` (list moves, touch nothing) and add `moves: {from, to}[]` and `conflicts` to `--json`; print "No specs to move" when there are none; test all three in a temp git repo and a temp non-git folder.
- [ ] 4.4 In `src/commands/adopt.ts`, move each adopted spec to the flat layout after conversion, and fix the report path at line 160; test with an OpenSpec fixture.

## 5. Templates and docs

- [ ] 5.1 Change `outline-spec/specs/<spec>/spec.md` to `outline-spec/specs/<spec>.md` in `src/core/templates/workflows/onboard.ts`, then run `pnpm generate:skills` and `pnpm regen:parity-hashes`; check the parity test passes.
- [ ] 5.2 Update `docs/outlines.md`, `docs/getting-started.md` (tree and the archive example path), `docs/adopting.md`, and `docs/cli.md` (`migrate-specs` now also moves old-layout specs; mention the error other commands give); confirm every flag mentioned exists in `outline-spec migrate-specs --help`.

## 6. Migrate this repo and verify

- [ ] 6.1 Build, then run `node bin/outline-spec.js migrate-specs` on this repo; confirm `git status` shows 35 renames and no `spec.md` remains under `outline-spec/specs/`.
- [ ] 6.2 Run the full checks: `pnpm build && pnpm exec tsc --noEmit && pnpm lint && pnpm test`. CI was removed from this fork, so Windows isn't checked automatically; review the new path code for `path.join`/`path.sep` use and note it in the commit.

## 7. Archive

- [ ] 7.1 Run `outline-spec validate flat-spec-files`, then `outline-spec archive flat-spec-files` to apply outline.md to the live specs (this writes the new `spec-files.md` in the flat layout).
