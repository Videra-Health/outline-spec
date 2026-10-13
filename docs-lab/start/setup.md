# Set up your project

> Add outline-spec to a project: run init, see what it wrote, and adjust it.

## Pick where outline-spec lives

- **In your repo (the default)**: specs and changes sit next to the code they describe and are versioned with it. The rest of this page follows this path.
- **In a store**: a separate planning repo shared by the repos that use it, for multi-repo setups or keeping planning out of the repo entirely. [Stores (beta)](../multi-repo/stores.md) covers when that's worth it and how to set one up.

## Initialize your project

With the CLI installed ([Installation](installation.md)), run init at the root of your project. In your terminal:

```bash
cd <your-project>
outline-spec init
```

Init asks which AI tools you use, writes the workflow files for the ones you pick, and reports what you got:

```
outline-spec Setup Complete

Created: Claude Code
6 skills and 6 commands in .claude/
Config: outline-spec/config.yaml (schema: spec-driven)
```

Restart your IDE for the new commands to take effect.

Re-running init is safe:

- Tools you already set up print `Refreshed` instead of `Created`.
- Running init again with a new tool selected adds that tool.
- The `--tools` flag skips the picker ([CLI reference](../reference/cli.md)).

### Migrate an existing `project.md`

Init does not copy legacy `outline-spec/project.md` into `config.yaml`. It keeps the file and prints an AI-assisted migration request.

In your AI chat:

```
Review outline-spec/project.md and migrate its useful content to outline-spec/config.yaml.
Keep context concise: include only project-wide facts needed during artifact creation, apply, and archive.
Move artifact-specific guidance into rules for the matching artifacts.
Move guidance for apply or archive into the matching operations entry.
Leave out generic, outdated, or verbose material. Do not delete project.md.
```

Review `config.yaml`, then delete `project.md` when ready.

## What init installs

Running init creates two things in your project:

- An `outline-spec/` folder at the repo root
- Workflow files (skills and commands) added to your AI tool's folder (`.agents/`, `.claude/`, etc.)

Commit all of it like the rest of your source. Init changes nothing else in your repo (if it finds leftovers from an older outline-spec version, it asks before cleaning them up).

### The `outline-spec/` folder

Every outline-spec artifact lives here, at the root of your project. Here's what that looks like:

```
outline-spec/
├── config.yaml     project settings and context for the AI
├── specs/          your specs (empty for now)
└── changes/        in-motion changes (empty for now)
    └── archive/    completed changes move here
```

[Project config](../customize/project-config.md) covers `config.yaml`.

### The workflow files (skills and commands)

These are the outline-spec workflows, the actions you'll use as you work. Here they are as installed skills, in the shared `.agents/` folder most tools use:

```
.agents/skills/
├── outline-spec-explore/              think through an idea first
├── outline-spec-propose/              propose a change
├── outline-spec-apply-change/         implement a change's tasks
├── outline-spec-update-change/        revise a change's plan
├── outline-spec-sync-specs/           sync a change's spec updates into specs/
├── outline-spec-archive-change/       move a finished change to the archive
├── outline-spec-verify-change/        check the implementation matches the plan (not included by default)
└── outline-spec-bulk-archive-change/  archive several changes at once (not included by default)
```

This is the default set plus two optional workflows. [Profiles](../customize/profiles.md) lists all twelve.

By default each workflow installs in two forms:

- **Skill** (`outline-spec-apply-change`): instructions your agent picks up on its own when you ask for the work.
- **Command** (`/outline-spec:apply` in Claude Code): a typed entry point for the same workflow, under a shorter name.

The two are functionally identical. A workflow's skill and its command carry the same instructions.

Why two: commands came first, and every tool spells them its own way. Skills are the newer standard shared across tools, but not every tool can invoke a skill directly, so commands stay as those tools' entry point.

Some tools install in skill form only. Where the tool runs skills directly, init skips commands and says so (`Commands skipped for: codex (uses skills)`).

We prefer skills and expect to retire commands eventually.

#### Change what gets installed

The interactive picker changes the delivery form and the workflow set ([Profiles](../customize/profiles.md)). In your terminal:

```bash
outline-spec config profile
```

Here's switching to skills only:

```
Current profile settings
  Delivery: both

? What do you want to configure? Delivery only
? Delivery mode (how workflows are installed): Skills only

Config changes:
  delivery: both -> skills
? Apply changes to this project now? (Y/n) y
```

Answering yes applies it to the current project on the spot. Other projects pick it up on their next `outline-spec update`. The setting is global, per machine.

#### Claude Code doesn't show the workflows

Claude Code loads outline-spec workflows from one or both of these project paths, based on your delivery setting:

- **Skills**: `.claude/skills/outline-spec-*/SKILL.md`
- **Commands**: `.claude/commands/outline-spec/<id>.md`

If the files are missing, refresh the project. In your terminal:

```bash
outline-spec update
```

If the command files exist but `/outline-spec:` shows no outline-spec commands, update Claude Code and restart it. If commands still don't load, enable skills too. In your terminal:

```bash
outline-spec config set delivery both
outline-spec update
```

Restart Claude Code, then run `/outline-spec-propose` in its chat. If only some workflows are missing, [change your profile](../customize/profiles.md#expanding-the-set-optional-workflows).

Setup is done. The [Quickstart](quickstart.md) takes your first change from here.
