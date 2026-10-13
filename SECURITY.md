# Security Policy

## Reporting a vulnerability

Report privately through [GitHub Security Advisories](https://github.com/heneryville/outline-spec/security/advisories/new). Please don't open a public issue for a suspected vulnerability. Include the affected version or commit, reproduction steps, and the impact you see.

Fixes go to `main`. There are no maintained release branches.

## Threat model

outline-spec is a local command-line tool. It has no server, no network listener, and no daemon. It reads and writes files under the directory you run it in, using paths you supply, with your own permissions. It sends no telemetry and doesn't check for updates.

| In scope | Out of scope |
| --- | --- |
| Code execution triggered by parsing a spec, config, schema, or template file | Reading or writing a file path you passed to the CLI yourself |
| Escaping the directory outline-spec was pointed at, via untrusted input | Static-analysis findings on path joins with no untrusted input |
| Prototype pollution or injection reachable from a config or spec file | Denial of service against your own machine using your own input |
| | Vulnerabilities in devDependencies that never reach an installed CLI |

## What the CLI does on your machine

| Surface | Behavior |
| --- | --- |
| Install scripts | No `preinstall`, `install`, or `postinstall` script. `prepare` builds from source for git and local-directory installs. Shell completions are opt-in via `outline-spec completion install`. |
| Running other programs | Shell calls use fixed literals (`which gh`, `gh auth status`). Anything carrying your input, such as feedback text, editor paths, or workset commands, uses an argument array, never string interpolation. On Windows, `.cmd` shims go through `cross-spawn`. |
| Network | None, except `outline-spec feedback`, which runs `gh` to open an issue when you ask it to. |

## Automated checks

CI runs `pnpm audit --prod` on pull requests, pushes to `main`, and weekly, plus GitHub's dependency review on pull requests. Every GitHub Action is pinned to a commit SHA.
