# Outline

## Proposal
Spec items stay short, with details as sub-items, and spec files render on GitHub one item per line instead of one paragraph per requirement.

## Requirements
1. cli-validate:
  a. Item length: Validation SHALL warn on any spec or outline item over 25 words.
    a. A requirement's name doesn't count toward its words.
    b. An outline item counts its text after archive.
    c. The warning names the item and suggests moving lists, examples, and extra clauses into sub-items.
2. outline-spec-conventions:
  a. Spec layout: Every command that writes a spec SHALL lay it out so GitHub renders each item on its own line.
    a. An item line followed by one of its details ends in a Markdown line break.
    b. A blank line comes before each requirement after the first, and around each table.
    c. Parsing ignores the line breaks and blank lines.
    d. `migrate-specs` rewrites outline specs written before this layout, and reports them as updated.
  b. Short items: The outline instruction SHALL ask for one short sentence per item, with lists, examples, and extra clauses as sub-items.
