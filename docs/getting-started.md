# Getting started

## Install

outline-spec needs Node.js 20.19 or later. It isn't published to npm; install it from GitHub:

```bash
npm install -g github:heneryville/outline-spec
```

Or from a clone:

```bash
git clone https://github.com/heneryville/outline-spec.git
cd outline-spec
pnpm install && pnpm build && npm install -g .
```

Check it with `outline-spec --version`.

## Set up a project

At the root of your project:

```bash
outline-spec init
```

`init` asks which AI tools you use and installs the workflow skills and commands for each. `--tools claude,cursor` skips the picker, and `--tools none` creates only the project folder. It creates:

```
outline-spec/
├── config.yaml   schema and optional project context
├── specs/        the live specs
└── changes/      open changes
```

plus the skills and commands in each tool's folder, for example `.claude/skills/` and `.claude/commands/outline-spec/` for Claude Code. Commit all of it. Restart your AI tool so it picks up the new commands.

Coming from OpenSpec? Use `outline-spec adopt` instead ([Adopting](adopting.md)).

## Your first change

In your AI tool:

```
/outline-spec:propose add a dark mode toggle to settings
```

The agent creates `outline-spec/changes/add-dark-mode/` with `outline.md` (the proposal and spec edits), `tasks.md`, and `design.md` if the change needs one. Read `outline.md`. On a new project the specs are empty, so the outline creates a spec:

```
## Requirements
1. settings: The settings screen and what each option does.
  a. Dark mode: A toggle in settings switches the app between light and dark themes.
    a. The choice persists across restarts.
```

Then:

```
/outline-spec:apply
```

The agent implements the tasks and checks them off. When they're done:

```
/outline-spec:land
```

It validates the change, shows you the spec it will write, writes `outline-spec/specs/settings/spec.md`, and deletes the change folder. Commit.

## Next

- [Outlines](outlines.md) for the spec and change format.
- [Workflows](workflows.md) for running changes in parallel and fixing one that no longer fits.
- [Configuration](configuration.md) to give the agent project context and rules.
