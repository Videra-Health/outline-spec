# outline-spec

> Instructions for a coding agent: install the outline-spec CLI and set up the user's project.

Follow these steps in order, and stop where a step says to stop.

## 1. Runtime

Run `node --version`. outline-spec needs Node.js 20.19.0 or later. If Node is missing or older, say so and stop. Don't install or switch Node versions yourself.

## 2. Install

Run `outline-spec --version`. If it prints a version, the CLI is installed; skip to step 4.

outline-spec isn't on the npm registry. Show the user this command and get confirmation before running it, since it installs software outside the project:

```bash
npm install -g github:heneryville/outline-spec
```

Stop and ask if the install needs sudo or admin rights, or fails with a permissions error. Never edit shell startup files.

## 3. PATH

Run `outline-spec --version`. If the command isn't found, say where npm installed it and how to add that directory to PATH, then stop until the user confirms.

## 4. Initialize

Pick the folder: the root of the project the user is working in, usually the version control root. Name it and let the user correct you. If it's a home directory, a temp directory, or holds no project, stop and ask.

If the project has an `openspec/` folder, it uses OpenSpec. Run `outline-spec adopt --dry-run`, show the user the report, and run `outline-spec adopt` only if they agree.

Work out which AI tools the user uses. You're probably running inside one; name it and ask what else they use. Map each to an id from `outline-spec init --help` (Copilot is `github-copilot`). Then run:

```bash
outline-spec init --tools <ids>
```

adding the path when it isn't the current folder.

## 5. Report

Relay what init printed: how many skills and commands it created and where, and what to restart. Tell the user how to start a change in their tool, taking the spelling from the files init created: `/outl:propose` in Claude Code, `/outl-propose` in most other tools, `@outl-propose` in Amazon Q, `$outl-propose` in Codex, `/skill:outl-propose` in Kimi Code.
