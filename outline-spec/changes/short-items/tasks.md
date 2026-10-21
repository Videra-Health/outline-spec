# Tasks

## 1. Layout

- [x] 1.1 Lay out specs for GitHub in `writeSpec`, and trim trailing spaces when parsing — verify: `test/core/outline`
- [x] 1.2 Rewrite outdated outline specs in `migrate-specs` — verify: `test/cli-e2e/outline-commands.test.ts`

## 2. Length

- [x] 2.1 Warn on items over 25 words in specs and change outlines — verify: `test/core/validation.test.ts`
- [x] 2.2 Ask for short items in the outline instruction, docs, and changelog — verify: `test/core/templates`

## 3. Archive

- [ ] 3.1 Run `outline-spec validate short-items`, then `outline-spec archive short-items`
