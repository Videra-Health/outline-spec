# outline-spec skills for skills.sh

Install the outline-spec workflow skills into any [skills.sh](https://skills.sh)-compatible agent:

```bash
npx skills add Videra-Health/outline-spec
```

Each `outl-*/SKILL.md` here is the same skill `outline-spec init` writes into a
project. The skills drive the `outline-spec` CLI, so for the full setup (CLI +
`outline-spec/` project scaffolding + slash commands) run:

```bash
npm install -g github:Videra-Health/outline-spec
outline-spec init
```

> These files are generated from the skill templates — do not edit by hand. Run
> `pnpm build && pnpm generate:skills` after changing a template;
> `skillssh-parity.test.ts` fails if they drift.
