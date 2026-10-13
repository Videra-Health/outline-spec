# Outlines

Specs in `outline-spec/specs/<name>/spec.md` are labeled outlines. A change holds its spec edits in its own `outline.md`, also an outline, until it is archived. Archiving applies the edits to the live specs and deletes the change folder. There is no archive folder; git history is the record.

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
- An item may carry a table of facts about many things ([Tables](#tables)).
- One sentence per item. A spec describes behavior someone can observe, not how the code does it.

### Labels never shift

A removed item leaves a gap (`2.b` above is gone, so `2.c` stays `c`). A new item goes at the end of its level. Labels stay stable, so an open change can keep addressing `Payment › c` while other changes are archived around it.

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

Struck text must match the live spec exactly (whitespace aside). If it doesn't, archiving stops and writes nothing, rather than edit an item that moved on.

### Renames and removals

- **Rename a requirement** by marking its name: `~~Old name~~ **New name** (patch):`.
- **Edit a requirement's sentence** by marking it after the colon: `Payment (patch): The shopper pays by card **or digital wallet**.`
- **Edit a spec's purpose** the same way, after the spec name: `checkout: How a shopper pays for ~~the items in their cart~~ **an order**.`
- **Remove a detail** by striking its text, with the label outside the marks: `c. ~~A declined card shows the processor's reason.~~`
- **Remove a requirement**: strike the whole line, `~~Guest checkout: A shopper can pay without an account.~~`
- **Remove a spec**: strike its top-level line, `~~checkout: How a shopper pays for the items in their cart.~~`. Archiving deletes the spec file.

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

`outline-spec archive wallets --dry-run` prints the result:

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

## What archiving checks

`outline-spec validate <change>` and `outline-spec archive <change>` stop, with every problem listed, when:

- struck text doesn't match the live item, sentence, or purpose;
- a `(patch)` requirement, or a detail label being edited or removed, doesn't exist;
- a new requirement already exists (mark it `(patch)` instead) or has no sentence;
- a new detail reuses a label in use, or doesn't come after the last label at its level;
- a new spec has no purpose, or a removed spec doesn't exist;
- a table edit doesn't fit the live table ([Tables](#editing-a-table)).

Nothing is written when any check fails. [Workflows](workflows.md#when-a-change-no-longer-fits) covers fixing a change that stopped fitting.

## Tables

When an item lists the same few facts for many things (every ship, every catalog item), give it a table instead of a run-on list.

```
# ships
The hulls the yards sell.

1. Catalog: Every yard sells these hulls.
  | id | Name | Mass t | Cost | Cooling MW |
  |---|---|---|---|---|
  | prototype | Prototype | 40 | 12000 | 2 |
  | m60 | M-60 Courier | 25 | 8000 | 1 |
  | overdrive | Overdrive | 30 | 15000 | 3 |
  a. A hull's cost includes its factory fit.
2. Fit budgets: Each hull has a fit budget.
  b. Slots by hull:
    | id | Slots |
    |---|---|
    | prototype | 4 |
    | m60 | 2 |
```

- A table belongs to one item, a requirement or a detail at any depth. It sits directly under the item, indented one level deeper, before the item's details. An item has at most one table.
- It is a Markdown table: a header row, a separator row, then data rows. The first column is `id`.
- Ids are unique within the table and match `^[a-z0-9][a-z0-9_.-]*$`. Use the thing's id in the code or data when it has a readable one, otherwise a kebab-case slug of its name. Never change an id; edit a name column instead. Tables in different specs may share ids, since `prototype` is the same ship everywhere.
- Every row has as many cells as the header. A blank cell is empty. Cells are one line; write `\|` for a pipe inside a cell.
- Archiving writes tables unpadded: one space either side of each cell and `|---|` separators. A wide new cell then never re-pads the other rows, so parallel changes don't conflict in git. Any padding or alignment parses, but a hand-aligned table is normalized the next time a change archives into its spec.

### Editing a table

Under `## Requirements`, reach the item the way you would to edit a detail, and repeat its table with the `id` column and only the columns the change touches. Columns are matched by their exact header text and rows by id. Rows and columns the change doesn't list stay as they are.

- A blank or unmarked cell changes nothing. Unmarked text may repeat the live value for readability; it isn't checked.
- `~~old~~ **new**` edits a cell. The struck text must match the live cell.
- An id the live table lacks is a new row, written plainly. It goes at the end, blank in the columns the change doesn't list.
- A struck id, `~~m60~~`, removes its row.
- A bold header, `**Crew**`, adds a column at the end. Listed rows get their value, the rest are blank.
- A struck header, `~~Cooling MW~~`, removes a column. `~~Old~~ **New**` renames one.
- A table under an item that has none becomes its table, every row new. A new requirement or detail just includes its table.
- Removing an item removes its table.

This change renames `Catalog`, reprices the courier, retires the overdrive, adds a hauler, adds a crew column, renames the mass column, drops cooling, and gives the courier another slot:

```
## Requirements
1. ships:
  a. ~~Catalog~~ **Hull catalog** (patch):
    | id | Cost | ~~Cooling MW~~ | ~~Mass t~~ **Mass (t)** | **Crew** | Name |
    |---|---|---|---|---|---|
    | m60 | ~~8000~~ **8500** |  |  | 2 | M-60 Courier |
    | ~~overdrive~~ |  |  |  |  |  |
    | hauler | 9000 |  | 80 | 6 | Hauler |
  b. Fit budgets (patch):
    b.
      | id | Slots |
      |---|---|
      | m60 | ~~2~~ **3** |
```

The result:

```
1. Hull catalog: Every yard sells these hulls.
  | id | Name | Mass (t) | Cost | Crew |
  |---|---|---|---|---|
  | prototype | Prototype | 40 | 12000 |  |
  | m60 | M-60 Courier | 25 | 8500 | 2 |
  | hauler | Hauler | 80 | 9000 | 6 |
  a. A hull's cost includes its factory fit.
2. Fit budgets: Each hull has a fit budget.
  b. Slots by hull:
    | id | Slots |
    |---|---|
    | prototype | 4 |
    | m60 | 3 |
```

`Name` is listed only so the rows read well; its unmarked cells change nothing. `outline-spec pending` reports this change's table edits as `ships › Catalog › m60 › Cost` (a cell), `ships › Catalog › overdrive` (a row added or removed), and `ships › Catalog › [Crew]` (a column added, removed, or renamed), and lists an overlap when two changes touch the same cell, row, or column.

Archiving a table edit stops, naming `spec › item › id › column`, when:

- struck text doesn't match the live cell;
- a header that isn't bold names no live column, or a bold one names a column that exists;
- a struck id has no row, a bold id already has one, or the change edits an id or the `id` header;
- a row's cell count doesn't match the change's header;
- the resulting table breaks a table rule (bad or duplicate id, wrong cell count).

### Referring to a column

Another spec refers to a column instead of copying its numbers: ``(see `ships` Catalog, Cost)``. The item is a requirement name, or a path as `show --item` takes it (`Fit budgets.b`). `outline-spec validate` warns when the spec, item, table, or column doesn't exist.

## Why outlines

OpenSpec's delta specs replace whole requirements, so two changes that edit different details of one requirement overwrite each other when the second is archived. Outline edits address single details by label, so those two changes merge. When they do touch the same item, struck text no longer matches and archiving stops instead of overwriting.
