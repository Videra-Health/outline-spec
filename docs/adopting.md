# Adopting an OpenSpec project

`outline-spec adopt` converts a project that uses OpenSpec. Run it at the project root, after committing, so the result is one reviewable diff:

```bash
outline-spec adopt --dry-run   # report what would change
outline-spec adopt
outline-spec update            # install outline-spec's skills and commands
```

## What it does

- Moves `openspec/` to `outline-spec/`.
- Converts each spec in `specs/` to an outline. Specs that are already outlines are left as they are.
- Deletes `changes/archive/`. Git history keeps the archived changes.
- Renames each open change's `.openspec.yaml` to `.outline-spec.yaml`.
- Sets `schema: outline` where `config.yaml` or a change's metadata says `schema: spec-driven`. A project-local schema name is left alone.

A spec converts like this:

```
# auth Specification

## Purpose
How users sign in.

## Requirements

### Requirement: Password sign-in
Users SHALL sign in with an email and password.

#### Scenario: Wrong password
- **WHEN** the password is wrong
- **THEN** the form shows "Wrong email or password"

### Requirement: Session length
Sessions last 30 days.
- Signing out ends the session on this device.
```

becomes

```
# auth
How users sign in.

1. Password sign-in: Users SHALL sign in with an email and password.
  a. Wrong password: WHEN the password is wrong THEN the form shows "Wrong email or password"
2. Session length: Sessions last 30 days.
  a. Signing out ends the session on this device.
```

The `## Purpose` text becomes the purpose. Each `### Requirement:` becomes a numbered requirement with its body as the sentence. Bullets in the body and each `#### Scenario:` become details, in that order, and a `#### Details` section that's already a labeled outline is kept. Expect to tighten the converted text by hand afterward; scenarios in particular read better rewritten as plain sentences.

## What it can't convert

- **Content with no place in an outline**: code blocks, tables, other `##` sections, other headings, or text before the first requirement. Adopt lists each line with its reason and moves nothing. Rewrite those lines in `openspec/specs/` as requirement text, details, or scenarios, then run it again.
- **Open changes in delta format** (`proposal.md` plus `specs/` deltas). Adopt moves them but can't turn deltas into outline edits, and lists them at the end. Write an `outline.md` for each ([Outlines](outlines.md)), or land them with OpenSpec before adopting.

Adopt refuses if `outline-spec/` already exists.

Specs already under `outline-spec/specs/` in the old format can be converted on their own with `outline-spec migrate-specs`.

## Running alongside OpenSpec

The two tools don't touch each other's files. `outline-spec init` and `update` write only `outline-spec-*` skills and `/outline-spec:` commands, and never remove OpenSpec's `openspec-*` skills, `/opsx:` commands, or `openspec/` folder. Both CLIs can be installed on one machine.

After adopting, the project's specs live in `outline-spec/`, so OpenSpec's commands no longer find them. Delete OpenSpec's skills and commands from the project when you're done with them, for example `.claude/skills/openspec-*` and `.claude/commands/opsx/`.
