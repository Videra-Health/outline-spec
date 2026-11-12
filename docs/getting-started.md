# Getting started

## Install

outline-spec needs Node.js 20.19 or later. It isn't published to npm; install it from GitHub:

```bash
npm install -g github:Videra-Health/outline-spec
```

Or from a clone:

```bash
git clone https://github.com/Videra-Health/outline-spec.git
cd outline-spec
pnpm install && pnpm build && npm install -g .
```

Check it with `outline-spec --version`.

## Install the skills

Install the workflow skills and commands once, into your home directory, so every project gets them:

```bash
cd ~ && outline-spec init --tools claude,codex
rm -rf ~/outline-spec
```

Leave out `--tools` to pick your AI tools interactively. This writes to `~/.claude/` and `~/.agents/`. `init` also creates a project folder in `~`; remove it, or every repo under your home directory without its own `outline-spec/` will use it. Restart your AI tool so it picks up the new commands.

## Set up a project

At the root of your project:

```bash
outline-spec init --tools none
```

The skills are already installed, so `--tools none` creates only the project folder:

```
outline-spec/
├── config.yaml   schema and optional project context
├── specs/        the live specs, one <name>.md file each
└── changes/      open changes
```

Commit it.

Coming from OpenSpec? Use `outline-spec adopt` instead ([Adopting](adopting.md)).

## Your first change

In your AI tool:

```
/outl:propose add a dark mode toggle to settings
```

The agent creates `outline-spec/changes/add-dark-mode/` with `outline.md` (the proposal and spec edits), `diagrams.md`, and `tasks.md`. Read `outline.md`. On a new project the specs are empty, so the outline creates a spec:

```
## Requirements
1. settings: The settings screen and what each option does.
  a. Dark mode: A toggle in settings switches the app between light and dark themes.
    a. The choice persists across restarts.
```

Then:

```
/outl:apply
```

The agent implements the tasks and checks them off. When they're done:

```
/outl:archive
```

It validates the change, shows you the spec it will write, writes `outline-spec/specs/settings.md`, and deletes the change folder (there is no archive folder; git history is the record). Commit.

On a longer change, `/outl:sync` applies the spec edits so far and keeps the change open ([Workflows](workflows.md#sync)).

## Next

- [Outlines](outlines.md) for the spec and change format.
- [Workflows](workflows.md) for running changes in parallel and fixing one that no longer fits.
- [Configuration](configuration.md) to give the agent project context and rules.
