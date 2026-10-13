# Workflows

A change moves through three steps: propose, apply, archive, with an optional sync along the way. Each is a skill and a slash command in your AI tool ([Skills and commands](skills.md)), and each drives the CLI underneath.

## Propose

`/outl:propose "add digital wallets"` creates `outline-spec/changes/<name>/` and writes its artifacts in order:

- `outline.md`: the proposal and the spec edits ([Outlines](outlines.md)).
- `diagrams.md`: the few views (sequence diagram, call tree, state machine, data shapes, and so on) that explain the change.
- `tasks.md`: a checklist of implementation tasks, ending with the archive step.

The agent reads the specs the change touches before writing the outline, and runs `outline-spec validate <change>` to check that the outline archives cleanly against them.

To step through artifacts one at a time instead, use `new` and then `continue`. `ff` writes every artifact implementation needs in one pass. To think an idea through first, use `explore`. These are in [Skills and commands](skills.md#workflows).

Review the outline before applying. `outline-spec show <change> --diff` prints the spec text the change would produce.

## Apply

`/outl:apply` works through `tasks.md`, writing code and checking off each task (`- [ ]` to `- [x]`). It stops to ask when a task is unclear or blocked.

If the plan changes while you build, `/outl:update` revises the change's artifacts and keeps them consistent with each other. It never edits code.

## Sync

`/outl:sync` applies a change's spec edits to the live specs now and keeps the change open:

1. It runs `outline-spec validate <change>`.
2. It runs `outline-spec sync <change> --dry-run` and shows you the resulting spec text and the `applied/` file it would write.
3. It runs `outline-spec sync <change> --yes`, which writes the specs, moves the applied `## Requirements` section verbatim into `applied/<date>-<n>.md` in the change folder, and leaves `## Requirements` in `outline.md` empty.

Sync doesn't check tasks. Add new spec edits to `outline.md` as they come up and sync again whenever they should reach the live specs.

### Sync or archive

- **Sync** when the live specs should change before the work is done: a long change whose finished parts other changes need to build on, or spec edits you want reviewed and committed now. The change stays open.
- **Archive** when the work is done. It applies whatever `outline.md` still holds, possibly nothing, and deletes the change folder, `applied/` included.

A change you never sync just archives as before.

## Archive

`/outl:archive` finishes the change:

1. It warns about unchecked tasks and asks before going on.
2. It runs `outline-spec validate <change>`.
3. It runs `outline-spec archive <change> --dry-run` and shows you the resulting spec text.
4. It runs `outline-spec archive <change> --yes`, which writes the specs and deletes the change folder.

Commit the result. Archiving applies the outline and deletes the change folder; there is no archive folder, and git history keeps the change and its `applied/` records.

## Parallel changes

Any number of changes can be open at once. Because outline edits address single details by label, two changes that edit different details of the same requirement both archive cleanly, in either order.

`outline-spec pending` lists what each open change touches and where two touch the same item:

```
a
  widgets › Spin › a
b
  widgets › Spin › a
  widgets › Spin › b

overlaps:
  widgets › Spin › a: a, b
```

An overlap is a warning. Whichever change is archived second has to agree with the text the first one left.

## When a change no longer fits

If another change was archived or synced first and edited the same item, the second change's struck text no longer matches. Validation reports it, and archive and sync refuse and write nothing:

```
$ outline-spec archive b
✖ Error: Cannot archive 'b'; nothing was written:
widgets › Spin › a: struck text doesn't match the live item
Fix: Fix outline.md in outline-spec/changes/b/ so it matches the live specs, then rerun.
```

To fix it:

1. Read the live item: `outline-spec show widgets --item "Spin.a"`.
2. Edit the change's `outline.md` so it strikes the live text exactly, addresses live labels, and puts new items after the last label at their level.
3. Run `outline-spec validate b`, then archive or sync again.

Never edit the live specs by hand to make a change fit. `outline.md` is the only place a change edits specs, and the archive and sync skills follow the same rule.

## Labels and gaps

Removed items leave gaps in the labels. `outline-spec relabel <spec>` renumbers a spec without gaps, and refuses while any open change edits that spec. Run it when nothing is pending against the spec, or not at all. Gaps are harmless.
