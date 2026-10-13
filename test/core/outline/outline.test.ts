import { describe, expect, it } from "vitest";
import { applyEdit, labelFor, labelValue, parseChange, parseSpec, relabel, sides, touches, writeSpec } from "../../../src/core/outline/outline.js";

const LIVE = `# outfitting
Ships carry add-on equipment.

1. Makers: Every item is from one maker.
  a. Kessler makes radiators.
2. Catalog: The catalog is these items.
  a. RP-2 Radiator Panel: 0.5 / 2 / 0.
  b. M-60 RCS Pod: 1 / 2 / 0.5.
    i. Sold in pairs.
  c. Bracing Kit: 3 / 0 / 0 / +2 t armor.
  d. Overdrive Injectors: 0.5 / 0 / 1.
`;
const live = () => parseSpec(LIVE, "live");
const change = (reqs: string) => parseChange(`## Proposal\nX.\n\n## Requirements\n1. outfitting:\n${reqs}\n## Out of Scope\n1. Y\n`, "c")[0];
const land = (reqs: string) => writeSpec(applyEdit(live(), change(reqs))!);

describe("spec files", () => {
  it("round-trips", () => expect(writeSpec(live())).toBe(LIVE));
  it("reads the title and purpose", () => expect([live().name, live().purpose]).toEqual(["outfitting", "Ships carry add-on equipment."]));
  it("rejects lines that aren't outline items", () =>
    expect(() => parseSpec("# x\nPurpose.\n\n1. A: b.\nstray\n", "x")).toThrow("not an outline item"));
});

describe("marks", () => {
  it("swaps struck text for bold text", () => expect(sides("0.5 / ~~0~~ **1** / 1")).toEqual({ old: "0.5 / 0 / 1", new: "0.5 / 1 / 1" }));
  it("keeps spacing tidy around removals", () => expect(sides("a ~~b~~ c ~~d~~.").new).toBe("a c."));
  it("inserts", () => expect(sides("a **b** c")).toEqual({ old: "a c", new: "a b c" }));
});

describe("landing", () => {
  it("edits a detail by label", () =>
    expect(land("  a. Catalog (patch):\n    d. Overdrive Injectors: 0.5 / ~~0~~ **1** / 1.")).toContain("  d. Overdrive Injectors: 0.5 / 1 / 1."));

  it("edits a nested detail and leaves the rest alone", () => {
    const out = land("  a. Catalog (patch):\n    b.\n      i. Sold in ~~pairs~~ **fours**.");
    expect(out).toContain("    i. Sold in fours.");
    expect(out).toContain("  b. M-60 RCS Pod: 1 / 2 / 0.5.");
  });

  it("adds a detail at the end", () =>
    expect(land("  a. Catalog (patch):\n    e. **Salvage Plate: 2 / 0 / 0.**")).toMatch(/d\. Overdrive.*\n {2}e\. Salvage Plate: 2 \/ 0 \/ 0\.\n$/s));

  it("adds an unmarked detail whose label is new", () =>
    expect(land("  a. Catalog (patch):\n    e. Salvage Plate: 2 / 0 / 0.\n      i. Sold only at salvage yards.")).toMatch(
      /e\. Salvage Plate: 2 \/ 0 \/ 0\.\n {4}i\. Sold only at salvage yards\.\n$/,
    ));

  it("still treats an unmarked existing label as a path", () => expect(land("  a. Catalog (patch):\n    d. Something else.")).toBe(LIVE));

  it("refuses a new detail that isn't at the end", () =>
    expect(() => land("  a. Catalog (patch):\n    b. **Wedged in.**")).toThrow("label already in use"));

  it("removes a detail and leaves a gap", () => {
    const out = land("  a. Catalog (patch):\n    b. ~~M-60 RCS Pod: 1 / 2 / 0.5.~~");
    expect(out).not.toContain("M-60");
    expect(out).toContain("  c. Bracing Kit");
  });

  it("stops when struck text no longer matches", () =>
    expect(() => land("  a. Catalog (patch):\n    c. Bracing Kit: 3 / 0 / 0 / +~~7 t~~ **70 Hk** armor.")).toThrow("struck text doesn't match"));

  it("stops on a label that doesn't exist", () =>
    expect(() => land("  a. Catalog (patch):\n    z. ~~Nothing.~~")).toThrow("outfitting › Catalog › z: no such item"));

  it("edits a requirement sentence", () =>
    expect(land("  a. Catalog (patch): The catalog is ~~these~~ **all of the** items.")).toContain("2. Catalog: The catalog is all of the items."));

  it("renames a requirement", () => expect(land("  a. ~~Makers~~ **Brands** (patch):")).toContain("1. Brands: Every item is from one maker."));

  it("adds a requirement with the next number", () =>
    expect(land("  a. Hull rating: Frame items add Hk.\n    a. Current hull rises too.")).toMatch(/3\. Hull rating: Frame items add Hk\.\n {2}a\. Current hull rises too\.\n$/));

  it("removes a requirement", () => expect(land("  a. ~~Makers: Every item is from one maker.~~")).not.toContain("Makers"));

  it("requires (patch) on an existing requirement", () => expect(() => land("  a. Catalog: Something else.")).toThrow('mark it "(patch)"'));

  it("creates a spec", () => {
    const edit = parseChange("## Requirements\n1. docking: Ships dock at stations.\n  a. Clamps: Docking takes 2 s.\n", "c")[0];
    expect(writeSpec(applyEdit(null, edit)!)).toBe("# docking\nShips dock at stations.\n\n1. Clamps: Docking takes 2 s.\n");
  });

  it("reports every problem at once", () =>
    expect(() => land("  a. Catalog (patch):\n    y. ~~A.~~\n    z. ~~B.~~")).toThrow(/y: no such item[\s\S]*z: no such item/));
});

describe("labels", () => {
  it("counts letters past z", () => expect([labelFor("alpha", 27), labelValue("alpha", "aa")]).toEqual(["aa", 27]));
  it("counts roman numerals", () => expect([labelFor("roman", 14), labelValue("roman", "xiv")]).toEqual(["xiv", 14]));
  it("closes gaps", () => {
    const spec = parseSpec(land("  a. Catalog (patch):\n    b. ~~M-60 RCS Pod: 1 / 2 / 0.5.~~"), "x");
    expect(writeSpec({ ...spec, items: relabel(spec.items) })).toContain("  b. Bracing Kit");
  });
});

it("lists what a change touches", () =>
  expect(touches(change("  a. Catalog (patch):\n    b.\n      i. ~~Sold in pairs.~~\n    d. **x**\n    e. Unmarked new.\n  b. New thing: A."))).toEqual([
    "outfitting › Catalog › b.i",
    "outfitting › Catalog › d",
    "outfitting › Catalog › e",
    "outfitting › New thing",
  ]));
