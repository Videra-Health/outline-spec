# Outlines

Specs in `outline-spec/specs/<name>/spec.md` are labeled outlines. A change holds its spec edits in its own `outline.md`, also an outline, until it lands. Landing applies the edits to the live specs and deletes the change folder. Git history is the archive.

## Spec files

```
# checkout
How a shopper pays for the items in their cart.

1. Cart total: The cart shows a running total of its items.
  a. The total includes tax at the shopper's local rate.
  b. Shipping is added once an address is entered.
    i. Orders over $50 ship free.
2. Payment: The shopper pays by card.
  a. Card numbers are never stored.
  c. A declined card shows the processor's reason.
3. Guest checkout: A shopper can pay without an account.
```

- The first line is `# ` and the spec's folder name. The text after it, up to the first item, is the spec's purpose.
- Each numbered item is a requirement: its name, a colon, and one sentence. The name is how changes find it, so keep `: ` out of names.
- Details nest under a requirement, two spaces per level, labeled `a.`, then `i.`, then `1.` by depth, and the cycle repeats.
- One sentence per item. A spec describes behavior someone can observe, not how the code does it.

### Labels never shift

A removed item leaves a gap (`2.b` above is gone, so `2.c` stays `c`). A new item goes at the end of its level. Labels stay stable, so an open change can keep addressing `Payment › c` while other changes land around it.

To close gaps, run `outline-spec relabel <spec>`. It refuses while any open change edits that spec, because those changes address the old labels.

## Change outlines

A change's `outline.md` has a `## Proposal` section, a `## Requirements` section holding the spec edits, and an optional `## Out of Scope`. Under `## Requirements`, list only what the change adds, edits, or removes. Anything unchanged stays out.

- **Top level: a spec**, by folder name and a colon. A new spec gives its purpose after the colon.
- **Second level: a requirement**, found by its exact name. Its label in the change doesn't matter.
  - `Name (patch):` edits an existing requirement. List only the details that change under it.
  - `Name: sentence` with no tag adds a new requirement, numbered after the spec's last one. Its details are written plainly, labeled from `a.`.
- **Deeper levels: details**, addressed by their live labels. Under a requirement, the change's labels are the spec's labels.
  - A bare label (`b.`) changes nothing. It only leads to a deeper item.
  - A label the live spec doesn't have is a new detail. Write it plainly with no marks, using a label after the last one at its level.

### Marking edits

Edits to existing text are marked inline:

- `~~dropped words~~` removes words.
- `**added words**` adds words.
- `~~old~~ **new**` swaps one for the other.
- A wholly struck item, `~~text~~`, removes the item and everything under it.
- Unmarked text on an existing label changes nothing.

Struck text must match the live spec exactly (whitespace aside). If it doesn't, landing stops and writes nothing, rather than edit an item that moved on.

### Renames and removals

- **Rename a requirement** by marking its name: `~~Old name~~ **New name** (patch):`.
- **Edit a requirement's sentence** by marking it after the colon: `Payment (patch): The shopper pays by card **or digital wallet**.`
- **Edit a spec's purpose** the same way, after the spec name: `checkout: How a shopper pays for ~~the items in their cart~~ **an order**.`
- **Remove a detail** by striking its text, with the label outside the marks: `c. ~~A declined card shows the processor's reason.~~`
- **Remove a requirement**: strike the whole line, `~~Guest checkout: A shopper can pay without an account.~~`
- **Remove a spec**: strike its top-level line, `~~checkout: How a shopper pays for the items in their cart.~~`. Landing deletes the spec file.

## Worked example

This change raises the free-shipping line, renames `Payment` and adds wallets to it, removes guest checkout, and adds a new `receipts` spec:

```
# Outline

## Proposal
Raise the free-shipping line to $75, accept digital wallets, drop guest checkout, and email a receipt.

## Requirements
1. checkout:
  a. Cart total (patch):
    b.
      i. Orders over ~~$50~~ **$75** ship free.
  b. ~~Payment~~ **Payment methods** (patch): The shopper pays by card **or digital wallet**.
    d. A wallet payment uses the wallet's own confirmation screen.
  c. ~~Guest checkout: A shopper can pay without an account.~~
2. receipts: What the shopper gets after paying.
  a. Email receipt: Every order sends an email receipt.
    a. The receipt lists each item, the tax, and the shipping.
```

- `b.` passes through to `b.i` without changing `b`.
- `d.` is new: the spec's last detail under `Payment` is `c`, so the next label is `d`, even though `b` is a gap.
- `receipts` doesn't exist yet, so its purpose follows the colon and everything under it is written plainly.

`outline-spec land wallets --dry-run` prints the result:

```
# checkout
How a shopper pays for the items in their cart.

1. Cart total: The cart shows a running total of its items.
  a. The total includes tax at the shopper's local rate.
  b. Shipping is added once an address is entered.
    i. Orders over $75 ship free.
2. Payment methods: The shopper pays by card or digital wallet.
  a. Card numbers are never stored.
  c. A declined card shows the processor's reason.
  d. A wallet payment uses the wallet's own confirmation screen.
```

```
# receipts
What the shopper gets after paying.

1. Email receipt: Every order sends an email receipt.
  a. The receipt lists each item, the tax, and the shipping.
```

Requirement `3` is gone and leaves a gap. No other label moved.

## What landing checks

`outline-spec validate <change>` and `outline-spec land <change>` stop, with every problem listed, when:

- struck text doesn't match the live item, sentence, or purpose;
- a `(patch)` requirement, or a detail label being edited or removed, doesn't exist;
- a new requirement already exists (mark it `(patch)` instead) or has no sentence;
- a new detail reuses a label in use, or doesn't come after the last label at its level;
- a new spec has no purpose, or a removed spec doesn't exist.

Nothing is written when any check fails. [Workflows](workflows.md#when-a-change-no-longer-fits) covers fixing a change that stopped fitting.

## Why outlines

OpenSpec's delta specs replace whole requirements, so two changes that edit different details of one requirement overwrite each other when the second lands. Outline edits address single details by label, so those two changes merge. When they do touch the same item, struck text no longer matches and landing stops instead of overwriting.
