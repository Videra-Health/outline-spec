import { describe, expect, it } from "vitest";
import { applyEdit, parseChange, parseSpec, relabel, touches, writeSpec } from "../../../src/core/outline/outline.js";
import { splitRow, tableProblems } from "../../../src/core/outline/table.js";
import { planEdits } from "../../../src/core/outline/specs.js";

const LIVE = `# ships
Every hull the yards sell.

1. Catalog: The yards sell these hulls.
  | id | Name | Mass | Cost |
  |---|---|---|---|
  | prototype | Prototype | 40 | 12000 |
  | m60 | M-60 Courier | 25 | 8000 |
  | overdrive | Overdrive | 30 |  |
  a. Prices are in credits.
2. Fit budgets: Each hull has a fit budget.
  b. Budgets by hull:
    | id | Slots | Note |
    |---|---|---|
    | prototype | 4 | a \\| b |
    i. Slots never go negative.
`;
const live = () => parseSpec(LIVE, "live");
const change = (reqs: string) => parseChange(`## Proposal\nX.\n\n## Requirements\n1. ships:\n${reqs}\n`, "c")[0];
const apply = (reqs: string) => writeSpec(applyEdit(live(), change(reqs))!);
const catalog = (rows: string) => apply(`  a. Catalog (patch):\n${rows.replace(/^/gm, "    ")}`);
const tableOf = (out: string, item = "Catalog") => {
  const spec = parseSpec(out, "x");
  const node = spec.items.find((n) => n.text.startsWith(item))!;
  return node.table!;
};

describe("table files", () => {
  it("round-trips a canonical spec byte for byte", () => expect(writeSpec(live())).toBe(LIVE));

  it("reads tables at requirement and nested-detail depth, with details after", () => {
    const spec = live();
    expect(spec.items[0].table).toEqual({
      columns: ["id", "Name", "Mass", "Cost"],
      rows: [["prototype", "Prototype", "40", "12000"], ["m60", "M-60 Courier", "25", "8000"], ["overdrive", "Overdrive", "30", ""]],
    });
    expect(spec.items[0].children[0].text).toBe("Prices are in credits.");
    expect(spec.items[1].children[0].table!.rows[0]).toEqual(["prototype", "4", "a | b"]);
    expect(spec.items[1].children[0].children[0].label).toBe("i");
  });

  it("normalizes padded and aligned tables to the unpadded form", () => {
    const padded = LIVE.replace("  | id | Name | Mass | Cost |\n  |---|---|---|---|", "  |id|  Name   | Mass |Cost|\n  | :--- | :---: | ---: | -- |")
      .replace("| m60 | M-60 Courier | 25 | 8000 |", "| m60       | M-60 Courier |   25 |  8000")
      .replace("| overdrive | Overdrive | 30 |  |", "| overdrive | Overdrive | 30 | |");
    expect(padded).not.toBe(LIVE);
    expect(writeSpec(parseSpec(padded, "x"))).toBe(LIVE);
  });

  it("splits escaped pipes", () => expect(splitRow("| a \\| b | c |")).toEqual(["a | b", "c"]));

  it("refuses a table that isn't directly under an item", () => {
    expect(() => parseSpec("# x\nP.\n\n1. A: b.\n    | id |\n    |---|\n", "x")).toThrow("directly under its item");
    expect(() => parseSpec("# x\nP.\n\n1. A: b.\n  a. c.\n  | id |\n  |---|\n", "x")).toThrow("before the item's details");
  });

  it("refuses two tables on one item", () =>
    expect(() => parseSpec("# x\nP.\n\n1. A: b.\n  | id |\n  |---|\n\n  | id |\n  |---|\n", "x")).toThrow("at most one table"));

  it("needs a separator row", () => expect(() => parseSpec("# x\nP.\n\n1. A: b.\n  | id |\n  | a |\n", "x")).toThrow("separator row"));

  it("reports bad ids, cell counts, headers, and blank columns", () => {
    const problems = tableProblems({ columns: ["name", "X", "X"], rows: [["A", "", ""], ["b", ""], ["b", "", ""]] });
    expect(problems.map((p) => p.message)).toEqual([
      `a table's first column must be "id", not "name"`,
      `duplicate column "X"`,
      `id "A" must be lowercase letters, digits, "_", ".", or "-", starting with a letter or digit`,
      `row "b" has 2 cells; the header has 3`,
      `duplicate id "b"`,
      `column "X" is blank in every row`,
      `column "X" is blank in every row`,
    ]);
  });

  it("keeps tables on their items when relabeling", () => {
    const spec = live();
    const out = writeSpec({ ...spec, items: relabel(spec.items) });
    expect(out).toContain("1. Catalog: The yards sell these hulls.\n  | id | Name | Mass | Cost |");
    expect(out).toContain("  a. Budgets by hull:\n    | id | Slots | Note |");
  });
});

describe("table edits", () => {
  it("edits a cell and leaves other rows and columns alone", () => {
    const out = catalog("| id | Cost |\n|---|---|\n| m60 | ~~8000~~ **9000** |");
    expect(out).toContain("| m60 | M-60 Courier | 25 | 9000 |");
    expect(out.replace("9000", "8000")).toBe(LIVE);
  });

  it("ignores unmarked and blank cells", () =>
    expect(catalog("| id | Name | Cost |\n|---|---|---|\n| m60 | Anything at all |  |\n| prototype | Prototype | ~~12000~~ **13000** |")).toBe(
      LIVE.replace("12000", "13000"),
    ));

  it("fills an empty cell", () => expect(catalog("| id | Cost |\n|---|---|\n| overdrive | **5000** |")).toContain("| overdrive | Overdrive | 30 | 5000 |"));

  it("stops when struck text doesn't match the live cell", () =>
    expect(() => catalog("| id | Cost |\n|---|---|\n| m60 | ~~7000~~ **9000** |")).toThrow(
      'ships › Catalog › m60 › Cost: struck text doesn\'t match the live cell "8000"',
    ));

  it("adds a row at the end, blank in columns the change doesn't list", () =>
    expect(catalog("| id | Name | Mass |\n|---|---|---|\n| hauler | Hauler | 80 |")).toContain("| overdrive | Overdrive | 30 |  |\n  | hauler | Hauler | 80 |  |\n  a."));

  it("removes a row", () => {
    const out = catalog("| id |\n|---|\n| ~~m60~~ |");
    expect(out).not.toContain("m60");
    expect(() => catalog("| id |\n|---|\n| ~~nope~~ |")).toThrow("ships › Catalog › nope: no such row to remove");
  });

  it("adds a column at the end", () => {
    const t = tableOf(catalog("| id | **Crew** |\n|---|---|\n| m60 | 2 |\n| prototype | **3** |"));
    expect(t.columns).toEqual(["id", "Name", "Mass", "Cost", "Crew"]);
    expect(t.rows.map((r) => r[4])).toEqual(["3", "2", ""]);
  });

  it("removes a column", () => {
    const t = tableOf(catalog("| id | ~~Mass~~ |\n|---|---|"));
    expect(t.columns).toEqual(["id", "Name", "Cost"]);
    expect(t.rows[0]).toEqual(["prototype", "Prototype", "12000"]);
  });

  it("renames a column and edits cells under it", () => {
    const t = tableOf(catalog("| id | ~~Cost~~ **Price** |\n|---|---|\n| m60 | ~~8000~~ **8500** |"));
    expect(t.columns[3]).toBe("Price");
    expect(t.rows[1][3]).toBe("8500");
  });

  it("refuses unknown, duplicate, and id columns", () => {
    expect(() => catalog("| id | Speed |\n|---|---|")).toThrow("ships › Catalog › [Speed]: no such column");
    expect(() => catalog("| id | ~~Speed~~ |\n|---|---|")).toThrow("[Speed]: no such column");
    expect(() => catalog("| id | **Mass** |\n|---|---|")).toThrow("[Mass]: column already exists");
    expect(() => catalog("| ~~id~~ **key** | Mass |\n|---|---|")).toThrow('never edit the "id" column');
  });

  it("refuses to change an id or reuse one", () => {
    expect(() => catalog("| id |\n|---|\n| ~~m60~~ **m61** |")).toThrow("ships › Catalog › m60: never change an id; edit a name column instead");
    expect(() => catalog("| id |\n|---|\n| **m60** |")).toThrow("m60: row already exists");
    expect(() => catalog("| id | Name |\n|---|---|\n| Big Ship | Big |")).toThrow('id "Big Ship" must be lowercase');
  });

  it("edits a table under a nested detail", () =>
    expect(apply("  a. Fit budgets (patch):\n    b.\n      | id | Slots |\n      |---|---|\n      | prototype | ~~4~~ **5** |\n      | m60 | 3 |")).toContain(
      "    | prototype | 5 | a \\| b |\n    | m60 | 3 |  |\n    i. Slots never go negative.",
    ));

  it("gives an item without a table a whole new one", () => {
    const out = apply("  a. Catalog (patch):\n    a.\n      | id | Rate |\n      |---|---|\n      | std | 1 |");
    expect(out).toContain("  a. Prices are in credits.\n    | id | Rate |\n    |---|---|\n    | std | 1 |");
    expect(() => apply("  a. Catalog (patch):\n    a.\n      | id | **Rate** |\n      |---|---|")).toThrow("has no table to edit");
  });

  it("writes a new requirement's and new detail's tables plainly", () => {
    const out = apply("  a. Docks: Hulls dock.\n    | id | Clamp |\n    |---|---|\n    | m60 | 2 s |\n  b. Catalog (patch):\n    b. New detail.\n      | id | X |\n      |---|---|\n      | a | 1 |");
    expect(out).toContain("3. Docks: Hulls dock.\n  | id | Clamp |\n  |---|---|\n  | m60 | 2 s |");
    expect(out).toContain("  b. New detail.\n    | id | X |\n    |---|---|\n    | a | 1 |");
    expect(() => apply("  a. Docks: Hulls dock.\n    | id |\n    |---|\n    | a |\n    | a |")).toThrow('ships › Docks: duplicate id "a"');
  });

  it("removes a table with its item", () => expect(apply("  a. ~~Catalog: The yards sell these hulls.~~")).not.toContain("| prototype | Prototype"));

  it("reports every problem, and writes nothing, when a bad cell edit sits among good ones", () => {
    const edit = change("  a. Catalog (patch):\n    | id | Cost | Mass |\n    |---|---|---|\n    | prototype | ~~12000~~ **1** | ~~40~~ **41** |\n    | m60 | ~~1~~ **2** | ~~9~~ **3** |");
    const before = writeSpec(live());
    const spec = live();
    expect(() => applyEdit(spec, edit)).toThrow(/m60 › Cost: struck[\s\S]*m60 › Mass: struck/);
    expect(writeSpec(spec)).toBe(before);
  });

  it("plans atomically across specs", () => {
    expect(() => planEdits("/nonexistent", [change("  a. Catalog (patch):\n    | id | Cost |\n    |---|---|\n    | m60 | ~~1~~ **2** |")])).toThrow(
      "ships › Catalog: no such requirement to patch",
    );
  });
});

describe("table touches", () => {
  const edit = change(
    [
      "  a. Catalog (patch):",
      "    | id | Cost | ~~Mass~~ | **Crew** | ~~Name~~ **Title** |",
      "    |---|---|---|---|---|",
      "    | m60 | ~~8000~~ **9000** |  | 2 |  |",
      "    | ~~overdrive~~ |  |  |  |  |",
      "    | hauler | 100 |  |  |  |",
      "    | prototype | 12000 |  |  |  |",
      "  b. Fit budgets (patch):",
      "    b.",
      "      | id | Slots |",
      "      |---|---|",
      "      | prototype | ~~4~~ **5** |",
    ].join("\n"),
  );

  it("reports cells, rows, and columns against the live spec", () =>
    expect(touches(edit, live())).toEqual([
      "ships › Catalog › [Mass]",
      "ships › Catalog › [Crew]",
      "ships › Catalog › [Name]",
      "ships › Catalog › m60 › Cost",
      "ships › Catalog › overdrive",
      "ships › Catalog › hauler",
      "ships › Fit budgets › b › prototype › Slots",
    ]));

  it("guesses new rows from plain filled cells without the live spec", () => expect(touches(edit)).toContain("ships › Catalog › hauler"));

  it("reports a whole new table by columns and rows", () =>
    expect(touches(change("  a. Catalog (patch):\n    a.\n      | id | Rate |\n      |---|---|\n      | std | 1 |"), live())).toEqual([
      "ships › Catalog › a › [Rate]",
      "ships › Catalog › a › std",
    ]));
});
