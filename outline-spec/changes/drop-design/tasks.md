# Tasks

## 1. Schema and workflows

- [x] 1.1 Remove the `design` artifact, its template, and design.md mentions from `schemas/outline/schema.yaml` and the review block — verify: `outline-spec schema validate outline`
- [x] 1.2 Remove design.md from the skill templates, regenerate skills and parity hashes — verify: `test/core/templates`
- [x] 1.3 Update tests that assert the outline schema's artifacts — verify: `pnpm test`

## 2. Docs

- [x] 2.1 Remove design.md from `docs/`, `outline-spec/config.yaml`, and add a CHANGELOG entry — verify: `grep -rn design.md docs`

## 3. Archive

- [x] 3.1 Run `outline-spec validate drop-design`, then `outline-spec archive drop-design` to apply outline.md to the live specs
