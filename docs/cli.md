# CLI

Every command prints its own help with `--help`. Commands that read or write specs and changes take `--store <id>` to act on a registered [store](stores.md) instead of the nearest `outline-spec/` folder.

Global options: `--version`, `--no-color`.

## Setup

### outline-spec init [path]

Sets up outline-spec in a project: creates `outline-spec/` (`config.yaml`, `specs/`, `changes/`) and installs skills and commands for the chosen AI tools. Re-running it refreshes installed tools and adds newly chosen ones.

| Flag | Effect |
|---|---|
| `--tools <tools>` | `all`, `none`, or comma-separated tool ids. Skips the picker. `outline-spec init --help` lists the ids. |
| `--language <language>` | Write new artifacts in this language (added to `config.yaml`). |
| `--profile <profile>` | `core` or `custom` for this run, overriding the global profile. |
| `--no-animation` | Static welcome screen. |
| `--copilot-cloud` / `--no-copilot-cloud` | Set up, or skip, GitHub Copilot cloud coding-agent files without asking. |

With no `--tools` in an interactive terminal, init shows a picker. Otherwise it sets up the tools it detects, and exits 1 listing valid ids when it finds none.

**Store-only repositories.** When `outline-spec/config.yaml` has a `store:` line and the repo has no local specs or changes, run init from the repository root to install tool files without moving planning into the repo:

- Integration files are written in the code repo.
- `outline-spec/config.yaml` is preserved byte-for-byte.
- `outline-spec/specs/` and `outline-spec/changes/` are not created.

Init exits 1 from a subdirectory. `--language` also exits 1, because the language belongs in the external store's config.

### outline-spec update [path]

Regenerates installed skills and commands from the current version and profile, and removes ones for workflows the profile dropped. `--force` rewrites files even when they're current.

### outline-spec adopt [path]

Converts an OpenSpec project: moves `openspec/` to `outline-spec/` and converts its specs to outlines. See [Adopting](adopting.md).

| Flag | Effect |
|---|---|
| `--dry-run` | Report what would change and write nothing. |
| `--json` | JSON report. |

### outline-spec migrate-specs

Converts old-format specs already under `outline-spec/specs/` (`### Requirement:` / `#### Scenario:`) to outlines. Flags: `--dry-run`, `--json`, `--store <id>`.

## Changes

### outline-spec new change <name>

Creates `outline-spec/changes/<name>/` with its `.outline-spec.yaml` metadata.

| Flag | Effect |
|---|---|
| `--description <text>` | Write a `README.md` with this description. |
| `--goal <text>` | Store a goal in the change metadata. |
| `--schema <name>` | Workflow schema (default `outline`). |
| `--json`, `--store <id>` | |

### outline-spec status

Shows which artifacts of a change are done, ready, or blocked.

| Flag | Effect |
|---|---|
| `--change <id>` | The change. |
| `--all` | Every open change. |
| `--schema <name>` | Override the schema from `config.yaml`. |
| `--json`, `--store <id>` | |

### outline-spec instructions [artifact]

Prints what the agent needs for its next step: how to write an artifact (`outline`, `design`, `diagrams`, `tasks`), or the reserved forms `apply` and `archive`.

| Flag | Effect |
|---|---|
| `--change <id>` | The change. Required. |
| `--schema <name>` | Override the schema. |
| `--json`, `--store <id>` | |

The artifact form gives the output path, the schema instruction, the template, project context and rules, and what the artifact unlocks. `apply` gives context files, task progress, `state` (`blocked`, `ready`, `all_done`), and the apply instruction. `archive` gives project context and operation guidance from `config.yaml`.

In the `apply` JSON, each `tasks` entry carries `id`, `description`, `done`, `sourcePath`, and `line`. `sourcePath` is the absolute path to the tracked file that supplied the task, and `line` is the task checkbox's one-based line number in that file.

### outline-spec archive [change]

Applies a change's `outline.md` to the live specs and deletes the change folder. It checks the whole outline first and writes nothing if any edit doesn't fit ([What archiving checks](outlines.md#what-archiving-checks)). There is no archive folder; git history is the record. It warns about unchecked tasks. It applies only what `outline.md` still holds, and deletes `applied/` with the rest of the folder.

| Flag | Effect |
|---|---|
| `--dry-run` | Print the resulting spec text and write nothing. |
| `-y, --yes` | Skip confirmation prompts. |
| `--json`, `--store <id>` | |

### outline-spec sync [change]

Applies the spec edits under `outline.md`'s `## Requirements` to the live specs now and keeps the change open. It selects and checks the change the same way `archive` does and writes nothing if any edit doesn't fit. Then it moves the applied section verbatim into `applied/<YYYY-MM-DD>-<n>.md` in the change folder and leaves `## Requirements` empty ([Applied records](outlines.md#applied-records)). It doesn't check tasks. With no edits under `## Requirements`, it reports nothing to sync and exits 0. Also runs as `outl sync`.

| Flag | Effect |
|---|---|
| `--dry-run` | Print the resulting spec text and the `applied/` path, and write nothing. |
| `-y, --yes` | Skip the confirmation prompt (asked only in a terminal). |
| `--json`, `--store <id>` | |

`--json` prints `{ "synced": "<change>", "specs": [{ "name", "action" }], "applied": "<path to the applied file, relative to the root>" }`. `action` is `updated`, `created`, or `deleted`; `applied` is `null` when there was nothing to sync. `--dry-run` adds `"dryRun": true` and each spec's `text`. A failure prints `"synced": null` with a `status` diagnostic, such as `sync_conflicts`.

### outline-spec pending

Lists what each open change touches (`spec › requirement › label`; for tables, `… › <id> › <Column>` per cell, `… › <id>` per added or removed row, `… › [Column]` per column change) and where two changes touch the same item, cell, row, or column. Flags: `--json`, `--store <id>`.

### outline-spec relabel <spec>

Renumbers a spec's labels without gaps. Refused while an open change edits that spec. Flag: `--store <id>`.

### outline-spec change show|list|validate

Older per-type forms. `change show [name]` prints `outline.md` (`--json`, `--diff`, `--no-interactive`). `change list` is deprecated in favor of `outline-spec list` (`--json`, `--long`). `change validate [name]` takes `--strict`, `--json`, `--no-interactive`.

## Specs and inspection

### outline-spec list

Lists open changes, or specs with `--specs`. Flags: `--changes`, `--sort recent|name`, `--json`, `--store <id>`.

### outline-spec show [item]

Shows a change or a spec.

| Flag | Effect |
|---|---|
| `--type change\|spec` | Disambiguate a name used by both. |
| `--diff` | For a change: the spec text archiving it would produce. |
| `--item <path>` | For a spec: one requirement or detail, as `"Payment"` or `"Cart total.b.i"`, printed with its table. A table row id after the item's path gives that row, as `"Catalog.m60"` or `"Fit budgets.b.prototype"` (JSON: `row` as `{ column: cell }`). |
| `--json`, `--no-interactive`, `--store <id>` | |

### outline-spec validate [item]

Checks that specs parse as outlines with a purpose and well-formed labels, and that changes archive cleanly against the live specs.

| Flag | Effect |
|---|---|
| `--all`, `--changes`, `--specs` | Validate everything, or every item of one type. |
| `--type change\|spec` | Disambiguate a name. |
| `--strict` | Treat warnings as failures. |
| `--report full\|findings` | Bulk report content. |
| `--concurrency <n>` | Parallel validations (default 6, or `OUTLINE_SPEC_CONCURRENCY`). |
| `--json`, `--no-interactive`, `--store <id>` | |

### outline-spec spec show|list|validate

Older per-type forms. `spec show [id]` takes `--item`, `--json`, `--no-interactive`. `spec list` takes `--json`, `--long`. `spec validate [id]` takes `--strict`, `--json`, `--no-interactive`.

### outline-spec view

An interactive dashboard of specs and changes. Flag: `--store <id>`.

## Schemas

### outline-spec schemas

Lists available schemas. Flags: `--json`, `--store <id>`.

### outline-spec templates

Shows the resolved template path for each artifact. Flags: `--schema <name>`, `--json`.

### outline-spec schema which|validate|fork|init

- `schema which [name]`: where a schema resolves from. `--all`, `--json`.
- `schema validate [name]`: check a schema's structure and templates. `--verbose`, `--json`.
- `schema fork <source> [name]`: copy a schema into the project to customize it. `--force`, `--json`.
- `schema init <name>`: create a project-local schema. `--description <text>`, `--artifacts <list>`, `--default` / `--no-default`, `--force`, `--json`.

See [Configuration](configuration.md#custom-schemas).

## Global settings

### outline-spec config

Global settings in `config.json` ([Configuration](configuration.md#global-settings)). `--scope global` is the only scope.

- `config path`: the file's location.
- `config list [--json]`: all settings.
- `config get <key>`, `config set <key> <value> [--string] [--allow-unknown]`, `config unset <key>`.
- `config reset --all [-y]`: back to defaults.
- `config edit`: open in `$EDITOR`.
- `config profile [preset]`: pick workflows and delivery interactively, or `config profile core` to reset to the core set.

## Stores and context

See [Stores](stores.md).

- `store setup [id]`: create and register a store. `--path <path>`, `--init-git` (default) / `--no-init-git`, `--remote <url>`, `--json`.
- `store register [path]`: register an existing store. `--id <id>`, `--yes`, `--json`.
- `store unregister <id>`: forget a registration, keep the files. `--json`.
- `store remove <id>`: forget a registration and delete the folder. `--yes`, `--json`.
- `store list` (`ls`): registered stores. `--json`.
- `store doctor [id]`: check registration and metadata. `--json`.
- `doctor`: relationship health for the resolved root. `--json`, `--store <id>`.
- `context`: the working context for the resolved root. `--json`, `--code-workspace <path>`, `--force`, `--store <id>`.
- `workset create [name]` (`--member <member>` repeatable, `--tool <id>`, `--json`), `workset list` (`ls`, `--json`), `workset open <name>` (`--tool <id>`), `workset remove <name>` (`--yes`, `--json`): saved local working views of several folders.

## Other

- `outline-spec version [--json]`: the installed version.
- `outline-spec feedback <message> [--body <text>]`: open a GitHub issue with `gh`, or print a prefilled link when `gh` isn't available.
- `outline-spec completion generate|install|uninstall [shell]`: shell completions for bash, zsh, fish, and PowerShell. `install` takes `--verbose`; `uninstall` takes `-y, --yes`.
