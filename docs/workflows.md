# Workflows

A change moves through three steps: propose, apply, land. Each is a skill and a slash command in your AI tool ([Skills and commands](skills.md)), and each drives the CLI underneath.

## Propose

`/outline-spec:propose "add digital wallets"` creates `outline-spec/changes/<name>/` and writes its artifacts in order:

- `outline.md`: the proposal and the spec edits ([Outlines](outlines.md)).
- `design.md`: only when the change needs technical decisions explained.
- `tasks.md`: a checklist of implementation tasks, ending with the land step.

The agent reads the specs the change touches before writing the outline, and runs `outline-spec validate <change>` to check that the outline lands cleanly against them.

To step through artifacts one at a time instead, use `new` and then `continue`. `ff` writes every artifact implementation needs in one pass. To think an idea through first, use `explore`. These are in [Skills and commands](skills.md#workflows).

Review the outline before applying. `outline-spec show <change> --diff` prints the spec text the change would produce.

## Apply

`/outline-spec:apply` works through `tasks.md`, writing code and checking off each task (`- [ ]` to `- [x]`). It stops to ask when a task is unclear or blocked.

If the plan changes while you build, `/outline-spec:update` revises the change's artifacts and keeps them consistent with each other. It never edits code.

## Land

`/outline-spec:land` finishes the change:

1. It warns about unchecked tasks and asks before going on.
2. It runs `outline-spec validate <change>`.
3. It runs `outline-spec land <change> --dry-run` and shows you the resulting spec text.
4. It runs `outline-spec land <change> --yes`, which writes the specs and deletes the change folder.

Commit the result. There is no archive folder: git history keeps the change.

`/outline-spec:archive` and `outline-spec archive` are kept as old names for land.

## Parallel changes

Any number of changes can be open at once. Because outline edits address single details by label, two changes that edit different details of the same requirement both land cleanly, in either order.

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

An overlap is a warning. Whichever change lands second has to agree with the text the first one left.

## When a change no longer fits

If another change landed first and edited the same item, the second change's struck text no longer matches. Validation reports it, and land refuses and writes nothing:

```
$ outline-spec land b
✖ Error: Cannot land 'b'; nothing was written:
widgets › Spin › a: struck text doesn't match the live item
Fix: Fix outline.md in outline-spec/changes/b/ so it matches the live specs, then rerun.
```

To fix it:

1. Read the live item: `outline-spec show widgets --item "Spin.a"`.
2. Edit the change's `outline.md` so it strikes the live text exactly, addresses live labels, and puts new items after the last label at their level.
3. Run `outline-spec validate b`, then land again.

Never edit the live specs by hand to make a change fit. `outline.md` is the only place a change edits specs, and the land skill follows the same rule.

## Labels and gaps

Removed items leave gaps in the labels. `outline-spec relabel <spec>` renumbers a spec without gaps, and refuses while any open change edits that spec. Run it when nothing is pending against the spec, or not at all. Gaps are harmless.
