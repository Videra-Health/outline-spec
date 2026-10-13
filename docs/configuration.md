# Configuration

## Project config: `outline-spec/config.yaml`

`init` creates it with only the schema set. Every other field is optional.

```yaml
schema: outline

context: |
  Designs and tasks must cover Windows, macOS, and Linux
  Write all artifacts in Spanish

rules:
  outline:
    - Name the user-visible screen for every requirement
  tasks:
    - Break tasks into chunks of at most 2 hours

operations:
  apply:
    guidance:
      - Keep test summaries concise
  land:
    guidance:
      - Summarize the landed spec edits before finishing
```

| Key | Effect |
|---|---|
| `schema` | The workflow schema for new changes: `outline` or a custom schema's name. |
| `context` | Free text added to every artifact's instructions and to apply and land. Up to 50 KB. |
| `rules` | Extra rules for one artifact, keyed by artifact id (`outline`, `design`, `tasks`, or a custom schema's ids). |
| `operations` | Advisory guidance for `apply` and `land`. `archive` is read as `land` when `land` isn't set. |
| `store` | A store id to use as the root when this `outline-spec/` folder has no `specs/` or `changes/` ([Stores](stores.md)). |
| `references` | Store ids whose specs are listed in instructions output, as ids or `{ id, remote }` ([Stores](stores.md#references)). |

Put in `context` only what an agent can't learn by reading the code: constraints, conventions, the language to write in. A bad field is dropped with a warning; it never fails a command. `config.yml` is read when `config.yaml` doesn't exist.

## Global settings

`config.json` holds per-machine settings. `outline-spec config path` prints where: `$XDG_CONFIG_HOME/outline-spec/` when that's set, otherwise `~/.config/outline-spec/` (`%APPDATA%\outline-spec\` on Windows).

| Key | Effect |
|---|---|
| `profile` | `core` (default) or `custom`. See [Profiles](skills.md#profiles). |
| `delivery` | `both` (default), `skills`, or `commands`. |
| `workflows` | The workflow ids of the `custom` profile. |
| `defaultStore` | A store id used when no `--store`, local root, or `store:` line applies. |

Change them with `outline-spec config set`, or `outline-spec config profile` for the profile and delivery.

## Environment variables

| Variable | Effect |
|---|---|
| `OUTLINE_SPEC_CONCURRENCY` | Parallel validations for bulk `validate` (default 6). |
| `OUTLINE_SPEC_NO_ANIMATION` | Any value turns off the `init` welcome animation. |
| `OUTLINE_SPEC_NO_COMPLETIONS=1` | Don't print the shell-completions tip. |
| `OUTLINE_SPEC_NO_AUTO_CONFIG=1` | `completion install` doesn't edit your shell profile. |
| `OUTLINE_SPEC_INTERACTIVE=0` | Never prompt. `CI` has the same effect. |
| `NO_COLOR` | Plain output. |

## Custom schemas

A schema lists a change's artifacts, the template and instruction for each, what each requires, and which file `apply` tracks. The built-in one is `outline` ([The outline schema](schema.md)).

To customize it, copy it into the project and edit the copy:

```bash
outline-spec schema fork outline my-flow
```

This writes `outline-spec/schemas/my-flow/` with `schema.yaml` and `templates/`. Set `schema: my-flow` in `config.yaml` to use it for new changes, or pass `--schema my-flow` to `new change`. `outline-spec schema init <name>` starts a schema from scratch instead.

Schemas resolve from the project (`outline-spec/schemas/`), then your user data folder (`~/.local/share/outline-spec/schemas/`, or `$XDG_DATA_HOME/outline-spec/schemas/`), then the built-in ones. `outline-spec schema which --all` shows where each comes from, and `outline-spec schema validate <name>` checks one.

Keep an `outline` artifact that writes `outline.md` if you want `land`, `pending`, and `validate` to work: they read the change's `outline.md`, whatever the schema.
