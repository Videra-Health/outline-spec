# outline-spec

Outline Spec is a spec-first approach to using coding agents similar ot OpenSpec and SpecKit.
Specs are living concise definitions of what the code *should* do.
This differs in that:
1. Specs are hierarchical outlines, making specs very concise
2. Archived specs are not retained. No more 2k LOC changes for only 100 lines of real changes
3. Every proposal includes a detailed artifact showing the spec differences

## Outlines

Specs are labeled outlines. Each change carries its spec edits as a small outline of its own, marked up with `~~removed~~` and `**added**` text, and archiving the change applies those edits to the live specs by label.

```
1. checkout:
  a. Cart total (patch):
    b.
      i. Orders over ~~$50~~ **$75** ship free.
```

## Fork notice

outline-spec is a fork of [OpenSpec](https://github.com/Fission-AI/OpenSpec) by Fission AI, under the MIT license (see [LICENSE](LICENSE)). Outline spec follows the same propose/apply/archive cycle as OpenSpec, but has changed mostly how those specs are represented (as outlines) in the final archived spec.

## Install

Node.js 20.19 or later.

Install the CLI, then install the skills once into your home directory so every project gets them:

```bash
npm install -g github:Videra-Health/outline-spec
cd ~ && outline-spec init --tools claude,codex   # or pick your AI tools interactively
rm -rf ~/outline-spec                            # init also made a project folder in ~; drop it
```

From a clone, replace the first line with `pnpm install && pnpm build && npm install -g .`.

## Quick start

```bash
cd your-project
# in your AI tool:
/outl:propose add dark mode    # writes outline.md, diagrams.md, and tasks.md
/outl:apply                    # implements the tasks
/outl:archive                  # applies the outline to the specs
```

Moving from OpenSpec? Run `outline-spec adopt` ([Adopting](docs/adopting.md)).

## Docs

- [Getting started](docs/getting-started.md)
- [Outlines](docs/outlines.md): the spec and change format
- [Workflows](docs/workflows.md): propose, apply, sync, archive, and parallel changes
- [CLI](docs/cli.md)
- [Skills and commands](docs/skills.md)
- [Configuration](docs/configuration.md) and [the outline schema](docs/schema.md)
- [Adopting an OpenSpec project](docs/adopting.md)
- [Stores](docs/stores.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
