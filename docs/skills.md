# Skills and commands

`outline-spec init` installs the workflows into each AI tool you pick, and `outline-spec update` refreshes them. Each workflow is a skill your agent picks up when you ask for the work, and a slash command you can type. A workflow's skill and command carry the same instructions.

## Where they go

Each tool gets its own folder. For Claude Code:

- Skills: `.claude/skills/outl-*/SKILL.md`
- Commands: `.claude/commands/outl/<id>.md`, typed as `/outl:<id>`

Other tools use their own folder (`.cursor/`, `.gemini/`, the shared `.agents/`, and so on). `outline-spec init --help` lists every tool id.

How you invoke a workflow depends on the tool. Claude Code uses `/outl:propose` for the command and `/outl-propose` for the skill. Most other tools use `/outl-propose`. Amazon Q uses `@outl-propose`, Codex `$outl-propose`, and Kimi Code `/skill:outl-propose`. GSD, Rovo Dev, and SourceCraft Code Assistant have no slash form for skills, so you ask for the work by name. Where a tool runs skills directly, init installs skills only and says so.

Commit the installed files with the rest of your project.

## Workflows

| Workflow | Skill | What it does |
|---|---|---|
| `propose` | `outl-propose` | Creates a change and writes `outline.md`, `design.md` when needed, and `tasks.md` in one step. |
| `explore` | `outl-explore` | A thinking partner for an idea or a problem. It reads code and specs and never writes code. It captures the discussion only when you ask, or say yes when it offers: it runs `outline-spec new change` and writes the artifacts you name. |
| `apply` | `outl-apply-change` | Implements a change's tasks and checks each off in the tracked file identified by `sourcePath` and one-based `line`. A schema can track tasks across multiple files. |
| `update` | `outl-update-change` | Revises a change's artifacts and keeps them consistent with each other. Never edits code. |
| `archive` | `outl-archive-change` | Validates, previews with `--dry-run`, and archives a finished change: applies its outline to the specs and deletes the folder ([Workflows](workflows.md#archive)). |
| `new` | `outl-new-change` | Creates an empty change and stops, ready for `continue`. |
| `continue` | `outl-continue-change` | Writes the next ready artifact of a change. |
| `ff` | `outl-ff-change` | Writes every artifact a change needs before implementation, in one pass. |
| `verify` | `outl-verify-change` | Checks that the implementation matches the change's artifacts before archiving. |
| `onboard` | `outl-onboard` | Walks through one real change end to end, explaining each step. |

## Profiles

A profile chooses which workflows are installed. It's a global setting, per machine.

### Core profile

The default `core` profile installs `propose`, `explore`, `apply`, `update`, and `archive`.

### Custom profile

`outline-spec config profile` opens a picker for the workflow set and the delivery form. Any set other than the core one is saved as `custom`. `outline-spec config profile core` goes back to the core set.

### Delivery

Delivery chooses the form: `both` (default), `skills`, or `commands`.

```bash
outline-spec config set delivery skills
```

After changing the profile or delivery, run `outline-spec update` in each project. The interactive picker offers to update the current project for you.

## When workflows don't show up

If the files are missing, run `outline-spec update`. If Claude Code has the command files but `/outline-spec:` shows nothing, update and restart Claude Code. If commands still don't load, install skills too:

```bash
outline-spec config set delivery both
outline-spec update
```

Restart Claude Code and run `/outl-propose`.

## Coexisting with OpenSpec

outline-spec only writes and removes its own files: `outl-*` skills, `outline-spec/` commands, and its own markers. OpenSpec's `openspec-*` skills, `/opsx:` commands, and `openspec/` folder are left alone, so both can be installed in one project while you move over ([Adopting](adopting.md)).

## skills.sh

The repo's `skills/` folder holds the same skills for [skills.sh](https://skills.sh):

```bash
npx skills add heneryville/outline-spec
```

They drive the CLI, so install `outline-spec` too ([Getting started](getting-started.md#install)).
