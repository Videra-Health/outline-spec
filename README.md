# outline-spec

outline-spec gives you and your coding agent a written plan before code is written, and keeps a living spec of what the software does. Specs are labeled outlines. Each change carries its spec edits as a small outline of its own, marked up with `~~removed~~` and `**added**` text, and archiving the change applies those edits to the live specs by label.

```
1. checkout:
  a. Cart total (patch):
    b.
      i. Orders over ~~$50~~ **$75** ship free.
```

Because an edit addresses one labeled detail, two changes that touch different details of the same requirement both archive cleanly. When they touch the same detail, the second one stops with a clear error instead of overwriting the first.

## Fork notice

outline-spec is a fork of [OpenSpec](https://github.com/Fission-AI/OpenSpec) by Fission AI, under the MIT license (see [LICENSE](LICENSE)). OpenSpec's delta specs replace whole requirements, so parallel changes to one requirement overwrite each other. This fork replaces them with outline specs that merge by label. It also drops scenarios, spec sync, the archive folder, telemetry, and the update check, and renames the CLI, project folder, skills, and commands so both tools can be installed side by side. [CHANGELOG.md](CHANGELOG.md) has the details.

## Install

Node.js 20.19 or later.

```bash
npm install -g github:Videra-Health/outline-spec
```

Or from a clone:

```bash
pnpm install && pnpm build && npm install -g .
```

## Quick start

```bash
cd your-project
outline-spec init                      # pick your AI tools
# in your AI tool:
/outl:propose add dark mode    # writes outline.md, diagrams.md, and tasks.md
/outl:apply                    # implements the tasks
/outl:archive                  # applies the outline to the specs
```

Moving from OpenSpec? Run `outline-spec adopt` ([Adopting](docs/adopting.md)).

## Docs

- [Getting started](docs/getting-started.md)
- [Outlines](docs/outlines.md): the spec and change format
- [Workflows](docs/workflows.md): propose, apply, archive, and parallel changes
- [CLI](docs/cli.md)
- [Skills and commands](docs/skills.md)
- [Configuration](docs/configuration.md) and [the outline schema](docs/schema.md)
- [Adopting an OpenSpec project](docs/adopting.md)
- [Stores](docs/stores.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
