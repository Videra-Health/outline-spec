# Outline OpenSpec: fork plan

Fork of OpenSpec 1.14.1 where specs are labeled outlines and changes land by label. Delta specs, scenarios, sync, and the archive folder go away. Reference implementation: terminal-velocity `Tools/spec/` and `docs/spec-outlines.md`.

Size of what's being replaced: `src/` is 210 files / ~50k LOC; tests are 217 files / ~85k LOC, about 60 of which cover archive, deltas, or scenarios.

## Phases

### 1. Outline core
- `src/core/outline/`: parse and write specs, labels (`1.` / `a.` / `i.` by depth), change marks (`~~` / `**`), `applyEdit`, `touches`, `relabel`. Port of `Tools/spec/outline.ts` with its tests.
- Spec discovery stays `openspec/specs/**/spec.md`.

### 2. Commands
- New: `openspec land <change> [--dry-run] [--yes] [--json]`, `openspec pending`, `openspec relabel <spec>`.
- `openspec archive` stays as an alias of `land`, printing that it's renamed.
- `validate`: a spec must parse as an outline with a purpose and well-formed labels; a change must land cleanly against the live specs (what `check` does today).
- `show` / `spec show`: a spec as outline text or a JSON tree; `--item "Catalog.n"` picks one item. `change show` prints outline.md and, with `--diff`, the landed result.
- `list` / `view` / `spec list`: count requirements as top-level items.
- New `openspec migrate-specs`: converts old `## Requirements` / `### Requirement:` / `#### Details|Scenario` specs to outlines (scenarios become details), and converts open delta changes where it can.

### 3. Schema
- One built-in schema, `outline`: `outline.md` → `tasks.md`, plus an optional `design.md`. `DEFAULT_SCHEMA` becomes `outline` in its five places; `spec-driven` is removed.
- `openspec new change` stops creating `changes/archive` and stops writing `skip_specs`.

### 4. Removed
- `requirement-blocks.ts`, `specs-apply.ts`, delta parts of `markdown-parser.ts` / `change-parser.ts`, `requirement-diff.ts`, scenario and SHALL/MUST checks, `skip_specs` and `retire_capabilities` metadata, `list --archived`, archive-dir constants and checks.

### 5. Skills and commands
- Workflows become propose, explore, apply, update, land. `land` replaces archive and generates both `/opsx:land` and `/opsx:archive`.
- Remove sync-specs and bulk-archive; rewrite propose, verify, onboard, explore, and update templates for outlines.
- Regenerate `skills/*/SKILL.md` and the parity hashes.

### 6. Docs and tests
- Rewrite README, `docs/` core pages (concepts, writing-specs, getting-started, workflows, cli, commands), and `docs-lab/` pages that describe the format; drop pages only about deltas.
- Delete tests for removed features, port the rest, and convert the repo's own 36 specs with `migrate-specs` so the dogfood test reads outlines.

### 7. Ship and adopt
- Version `2.0.0-outlines.0`, same package name so skill paths don't change. Install globally from the fork (replaces the 1.12.0 install).
- terminal-velocity: drop `Tools/spec` and the npm script, use `openspec land` / `pending`, run `openspec update` so `/opsx:archive` and `/opsx:land` land changes. Keep its project `outline` schema only for its own diagrams template.

## Decisions to confirm
1. Built-in artifacts: outline → tasks with optional design, rather than terminal-velocity's diagrams template (which is Videra-specific).
2. `archive` kept as an alias of `land`.
3. Docs: rewrite what describes the format; delete what only describes deltas, scenarios, or archives.
