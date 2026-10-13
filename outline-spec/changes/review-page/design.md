# Design

## Context

A change's files are already parsed for `validate` (`validateChange`), `pending` (`collectPending`), and `archive` (`planChange`), so the page's data needs no new parsing. The CLI has no Markdown renderer; `diff` is already a dependency. Schemas are zod-checked in `src/core/artifact-graph/types.ts`, project config is parsed field by field in `readProjectConfig`, and `.outline-spec.yaml` rejects unknown keys via `CHANGE_METADATA_KNOWN_KEYS`.

## Decisions

- **Render Markdown in the page, not the CLI.** The CLI embeds a JSON payload; the template loads `marked` and `mermaid` from jsDelivr and renders client-side. No new runtime dependency, and a forked template controls all presentation. Alternative: `marked` as a CLI dependency, rejected because it still needs client-side Mermaid.
- **Template contract.** The template holds one `<script type="application/json" id="outline-spec-review"></script>` that the CLI fills. Payload: `{ change, generatedAt, banner: { valid, errors[], overlaps[{ change, requirements[] }] }, tabs: [{ title, kind: "markdown", files[{ name, markdown }] } | { title, kind: "spec-changes", specs[] }] }`. The JSON is escaped so `</script>` in a file can't end the tag.
- **Spec changes computed in the CLI.** Built from `planChange` (live spec vs planned spec per touched requirement) and word-diffed with `diffWords` into `{ text, added?, removed? }` segments, so templates don't reimplement outline semantics. Table edits reuse `pending`'s per-cell touches.
- **Output in temp, or `--out`.** Default `path.join(os.tmpdir(), 'outline-spec-review', <first 8 hex of sha256(root path)>-<root basename>, '<change>.html')`, keeping generated HTML out of git; the hash avoids collisions between projects with the same basename. Claude Code's Artifact tool publishes only from the working directory or its scratchpad, and macOS's `os.tmpdir()` is neither, so skills pass `--out <scratchpad>/review-<change>.html`. All joins via `path`.
- **The page is a Claude artifact first.** The template is built to the Artifact page contract: colors as `:root` tokens with a dark theme under `prefers-color-scheme` and `data-theme`, an explicit `body` background, scripts only from jsDelivr/cdnjs, Google Fonts only, no horizontal scroll at phone width. The same file opens fine as a local page for other agents.
- **`review-on` is the gate, `--for` asks it.** Skills run `outline-spec review <change> --for propose --json` and act only on `enabled: true`, so the skill text never parses config itself.
- **Link stored as `reviewUrl`** in `.outline-spec.yaml`, added to `CHANGE_METADATA_KNOWN_KEYS`. The CLI never publishes; skills publish with whatever page tool the agent has and record the link with `--url`.
- **Config tabs replace, not merge.** `review.tabs` swaps the whole list; merging by title invites surprises when a schema renames a tab.

## Risks / Trade-offs

- [Page needs network for jsDelivr] → Acceptable for a review page; the payload is still readable in the file's source.
- [Agents differ in page tools] → Skill text names the capability ("publish a private HTML page and open it"), with Claude Code's Artifact tool as the example, and falls back to the path.
- [Update's "outline changed" check] → The update skill already knows which artifacts it rewrote; it renders when outline.md was one of them.
