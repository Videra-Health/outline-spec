import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildBanner, buildSpecChanges, buildTabs, fillTemplate, type TableDiff } from '../../src/core/review.js';

const SHIPS = `# ships
Ships fly between stations.

1. Hulls: Every ship has a hull.
  a. A hull has 100 armor.
2. Engines: Every ship has one engine.
  | id | Thrust | Mass |
  |---|---|---|
  | ion | 5 | 2 |
  | fusion | 9 | 4 |
3. Docking: Ships dock at stations.
`;
const CARGO = `# cargo
Ships carry cargo.

1. Holds: A ship has one hold.
`;

let root: string;
const changesDir = () => path.join(root, 'changes');
const specsDir = () => path.join(root, 'specs');
const write = (rel: string, text: string) => {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
};
const change = (name: string, reqs: string) => write(`changes/${name}/outline.md`, `## Proposal\nWhy.\n\n## Requirements\n${reqs}`);

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'outline-spec-review-'));
  write('specs/ships/spec.md', SHIPS);
  write('specs/cargo/spec.md', CARGO);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('buildBanner', () => {
  it('passes a clean change with no overlaps', async () => {
    change('c1', '1. ships:\n  a. Docking (patch): Ships dock at ~~stations~~ **any station**.\n');
    expect(await buildBanner(changesDir(), specsDir(), 'c1')).toEqual({ valid: true, errors: [], overlaps: [] });
  });

  it('lists each error for an invalid change', async () => {
    change('c1', '1. ships:\n  a. Nope (patch):\n  b. Hulls: Again.\n');
    const banner = await buildBanner(changesDir(), specsDir(), 'c1');
    expect(banner.valid).toBe(false);
    expect(banner.errors).toEqual([
      'ships › Nope: no such requirement to patch',
      'ships › Hulls: requirement already exists; mark it "(patch)"',
    ]);
  });

  it('names other changes touching the same requirements', async () => {
    change('c1', '1. ships:\n  a. Hulls (patch):\n    a. A hull has ~~100~~ **120** armor.\n  b. Docking (patch): Ships dock at ~~stations~~ **ports**.\n');
    change('c2', '1. ships:\n  a. Hulls (patch):\n    b. A hull has a name.\n');
    change('c3', '1. cargo:\n  a. Holds (patch): A ship has ~~one hold~~ **two holds**.\n');
    const banner = await buildBanner(changesDir(), specsDir(), 'c1');
    expect(banner.overlaps).toEqual([{ change: 'c2', requirements: ['ships › Hulls'] }]);
  });
});

describe('buildSpecChanges', () => {
  it('tags new and removed specs and lists their requirements whole', () => {
    change('c1', '1. docks: Stations have docks.\n  a. Berths: A dock has berths.\n    a. Four per dock.\n2. ~~cargo: Ships carry cargo.~~\n');
    expect(buildSpecChanges(changesDir(), specsDir(), 'c1')).toEqual([
      {
        name: 'docks',
        status: 'new',
        purpose: [{ text: 'Stations have docks.', added: true }],
        requirements: [
          {
            label: '1',
            name: 'Berths',
            kind: 'added',
            after: 'A dock has berths.\na. Four per dock.',
            lines: [{ segments: [{ text: 'A dock has berths.' }] }, { segments: [{ text: 'a. Four per dock.' }] }],
          },
        ],
      },
      {
        name: 'cargo',
        status: 'removed',
        purpose: [{ text: 'Ships carry cargo.', removed: true }],
        requirements: [{ label: '1', name: 'Holds', kind: 'removed', live: 'A ship has one hold.', lines: [{ segments: [{ text: 'A ship has one hold.' }] }] }],
      },
    ]);
  });

  it('tags added, edited, and removed requirements, with edits as a line diff', () => {
    change(
      'c1',
      '1. ships:\n  a. Hulls (patch):\n    a. A hull has ~~100~~ **120** armor.\n  b. ~~Docking: Ships dock at stations.~~\n  c. Fuel: Ships burn fuel.\n'
    );
    const [ships] = buildSpecChanges(changesDir(), specsDir(), 'c1');
    expect(ships.status).toBe('changed');
    expect(ships.purpose).toBeUndefined();
    expect(ships.requirements.map((r) => [r.name, r.kind])).toEqual([
      ['Hulls', 'edited'],
      ['Docking', 'removed'],
      ['Fuel', 'added'],
    ]);
    const hulls = ships.requirements[0];
    expect(hulls.lines).toEqual([
      { segments: [{ text: 'Every ship has a hull.' }] },
      {
        segments: [{ text: 'a. A hull has ' }, { text: '100', removed: true }, { text: '120', added: true }, { text: ' armor.' }],
        changed: true,
      },
    ]);
    expect(ships.requirements[1].live).toBe('Ships dock at stations.');
    expect(ships.requirements[2].after).toBe('Ships burn fuel.');
  });

  it('reads a renamed requirement as an edit', () => {
    change('c1', '1. ships:\n  a. ~~Docking~~ **Berthing** (patch):\n');
    const [ships] = buildSpecChanges(changesDir(), specsDir(), 'c1');
    expect(ships.requirements).toMatchObject([{ name: 'Berthing', renamedFrom: 'Docking', kind: 'edited' }]);
  });

  it('lists table edits as pending names them', () => {
    change(
      'c1',
      '1. ships:\n  a. Engines (patch):\n    | id | Thrust | **Cost** |\n    |---|---|---|\n    | ion | ~~5~~ **6** | 10 |\n    | ~~fusion~~ | | |\n    | warp | 20 | 99 |\n'
    );
    const [ships] = buildSpecChanges(changesDir(), specsDir(), 'c1');
    expect(ships.requirements[0].tableEdits).toEqual(['[Cost]', 'ion › Thrust', 'fusion', 'warp']);
    expect(ships.requirements[0].after).toContain('| ion | 6 | 2 | 10 |');
    const table = (ships.requirements[0].lines[1] as { table: TableDiff }).table;
    expect(table.columns).toEqual([{ text: 'id' }, { text: 'Thrust' }, { text: 'Mass' }, { text: 'Cost', added: true }]);
    expect(table.rows).toEqual([
      { changed: true, cells: [[{ text: 'ion' }], [{ text: '5', removed: true }, { text: '6', added: true }], [{ text: '2' }], [{ text: '10' }]] },
      { removed: true, changed: true, cells: [[{ text: 'fusion' }], [{ text: '9' }], [{ text: '4' }], [{ text: '' }]] },
      { added: true, changed: true, cells: [[{ text: 'warp' }], [{ text: '20' }], [{ text: '' }], [{ text: '99' }]] },
    ]);
  });

  it('compares table cells only within their row and column', () => {
    change('c1', '1. ships:\n  a. Engines (patch):\n    | id | Thrust | Mass |\n    |---|---|---|\n    | ion | ~~5~~ **2** | ~~2~~ **7** |\n');
    const table = (buildSpecChanges(changesDir(), specsDir(), 'c1')[0].requirements[0].lines[1] as { table: TableDiff }).table;
    expect(table.rows[0].cells).toEqual([[{ text: 'ion' }], [{ text: '5', removed: true }, { text: '2', added: true }], [{ text: '2', removed: true }, { text: '7', added: true }]]);
    expect(table.rows[1]).toEqual({ cells: [[{ text: 'fusion' }], [{ text: '9' }], [{ text: '4' }]] });
  });

  it('pairs an edited detail with the line it replaces and keeps unrelated lines whole', () => {
    change('c1', '1. ships:\n  a. Hulls (patch):\n    a. A hull has ~~100~~ **1,400,000** armor.\n    b. Docking clamps lock on contact.\n');
    const lines = buildSpecChanges(changesDir(), specsDir(), 'c1')[0].requirements[0].lines;
    expect(lines.filter((l) => l.changed)).toEqual([
      { segments: [{ text: 'a. A hull has ' }, { text: '100', removed: true }, { text: '1,400,000', added: true }, { text: ' armor.' }], changed: true },
      { segments: [{ text: 'b. Docking clamps lock on contact.', added: true }], changed: true },
    ]);
  });

  it('throws with every problem when the outline does not apply', () => {
    change('c1', '1. ships:\n  a. Nope (patch):\n');
    expect(() => buildSpecChanges(changesDir(), specsDir(), 'c1')).toThrow(/no such requirement to patch/);
  });
});

describe('buildTabs', () => {
  it('renders files in the listed order and skips missing ones', () => {
    write('changes/c1/design.md', '# Design');
    write('changes/c1/diagrams.md', '# Diagrams');
    const tabs = buildTabs(changesDir(), specsDir(), 'c1', [
      { title: 'Diagrams', from: ['diagrams.md', 'notes.md', 'design.md'] },
    ]);
    expect(tabs).toEqual([
      {
        title: 'Diagrams',
        kind: 'markdown',
        files: [
          { name: 'diagrams.md', kind: 'markdown', markdown: '# Diagrams' },
          { name: 'design.md', kind: 'markdown', markdown: '# Design' },
        ],
      },
    ]);
  });

  it('drops a tab whose files are all missing', () => {
    change('c1', '1. cargo:\n  a. Holds (patch): A ship has ~~one hold~~ **two holds**.\n');
    const tabs = buildTabs(changesDir(), specsDir(), 'c1', [
      { title: 'Outline', from: ['outline.md'] },
      { title: 'Diagrams', from: ['diagrams.md'] },
      { title: 'Spec changes', view: 'spec-changes' },
    ]);
    expect(tabs.map((t) => t.title)).toEqual(['Outline', 'Spec changes']);
  });

  it('expands a glob entry into its matches by name, as / paths, and marks html files', () => {
    write(path.join('changes', 'c1', 'designs', 'b-panel.html'), '<p>b</p>');
    write(path.join('changes', 'c1', 'designs', 'a-hud.HTML'), '<p>a</p>');
    write(path.join('changes', 'c1', 'designs', 'notes.md'), '# notes');
    const [tab] = buildTabs(changesDir(), specsDir(), 'c1', [{ title: 'Designs', from: ['designs/*.{html,HTML}'] }]);
    expect(tab).toEqual({
      title: 'Designs',
      kind: 'markdown',
      files: [
        { name: 'designs/a-hud.HTML', kind: 'html', markdown: '<p>a</p>' },
        { name: 'designs/b-panel.html', kind: 'html', markdown: '<p>b</p>' },
      ],
    });
  });

  it('drops a tab whose glob matches nothing', () => {
    change('c1', '1. cargo:\n  a. Holds (patch): A ship has ~~one hold~~ **two holds**.\n');
    const tabs = buildTabs(changesDir(), specsDir(), 'c1', [
      { title: 'Outline', from: ['outline.md'] },
      { title: 'Designs', from: ['designs/*.html'] },
    ]);
    expect(tabs.map((t) => t.title)).toEqual(['Outline']);
  });

  it('carries the error when spec changes cannot be computed', () => {
    change('c1', '1. ships:\n  a. Nope (patch):\n');
    const [tab] = buildTabs(changesDir(), specsDir(), 'c1', [{ title: 'Spec changes', view: 'spec-changes' }]);
    expect(tab).toMatchObject({ kind: 'spec-changes', specs: [], error: expect.stringContaining('no such requirement') });
  });
});

describe('fillTemplate', () => {
  it('escapes the payload so file text cannot close the script tag', () => {
    const html = fillTemplate('<body><script type="application/json" id="outline-spec-review"></script></body>', {
      change: 'c1',
      generatedAt: 'now',
      banner: { valid: true, errors: [], overlaps: [] },
      tabs: [{ title: 'Outline', kind: 'markdown', files: [{ name: 'outline.md', markdown: '</script><b>$&</b>' }] }],
    });
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    const json = /id="outline-spec-review">([\s\S]*?)<\/script>/.exec(html)![1];
    expect(JSON.parse(json).tabs[0].files[0].markdown).toBe('</script><b>$&</b>');
  });
});
