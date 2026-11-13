import { describe, expect, it } from 'vitest';
import { buildPullRequestOutline, marked } from '../../src/core/pr-outline.js';

const SHIPS = `# ships
Ships fly between stations.

1. Hulls: Every ship has a hull.
  a. A hull has 100 armor.
  b. A hull has a serial number.
2. Engines: Every ship has one engine.
  | id | Thrust | Mass |
  |---|---|---|
  | ion | 5 | 2 |
  | fusion | 9 | 4 |
3. Docking: Ships dock at stations.
`;

const outline = (now: string, base = SHIPS, name = 'ships') => buildPullRequestOutline(new Map([[name, base]]), new Map([[name, now]]));
const fellBack = (lines: string[]) => lines.some((l) => l.includes("couldn't be written exactly"));

describe('marked', () => {
  it('marks only the words that changed', () => {
    expect(marked('A hull has 100 armor.', 'A hull has 120 armor.')).toBe('A hull has ~~100~~ **120** armor.');
  });

  it('marks pure additions and removals', () => {
    expect(marked('Ships dock at stations.', 'Ships dock at any station.')).toMatch(/~~stations\.~~ \*\*any station\.\*\*|~~stations~~ \*\*any station\*\*/);
  });
});

describe('buildPullRequestOutline', () => {
  it('writes an edited detail under its requirement with patch and marks', () => {
    const out = outline(SHIPS.replace('100 armor', '120 armor'));
    expect(out.lines).toEqual(['1. ships:', '  a. Hulls (patch):', '    a. A hull has ~~100~~ **120** armor.']);
    expect(out.newLines).toEqual([]);
  });

  it('writes an added requirement whole, its lines new', () => {
    const out = outline(`${SHIPS}4. Cloaks: Some ships cloak.\n  a. A cloak hides a ship from sensors.\n`);
    expect(out.lines).toEqual(['1. ships:', '  a. Cloaks: Some ships cloak.', '    a. A cloak hides a ship from sensors.']);
    expect(out.newLines).toEqual([1, 2]);
  });

  it('strikes a removed requirement and a removed detail', () => {
    const out = outline(SHIPS.replace('3. Docking: Ships dock at stations.\n', '').replace('  b. A hull has a serial number.\n', ''));
    expect(out.lines).toEqual(['1. ships:', '  a. ~~Docking: Ships dock at stations.~~', '  b. Hulls (patch):', '    b. ~~A hull has a serial number.~~']);
    expect(fellBack(out.lines)).toBe(false);
  });

  it('writes a renamed requirement as a marked name', () => {
    const out = outline(SHIPS.replace('3. Docking:', '3. Berthing:'));
    expect(out.lines).toEqual(['1. ships:', '  a. ~~Docking~~ **Berthing** (patch):']);
  });

  it('writes a new spec with its purpose, every item new', () => {
    const out = buildPullRequestOutline(new Map(), new Map([['cargo', '# cargo\nShips carry cargo.\n\n1. Holds: A ship has one hold.\n  a. A hold has a size.\n']]));
    expect(out.lines).toEqual(['1. cargo: Ships carry cargo.', '  a. Holds: A ship has one hold.', '    a. A hold has a size.']);
    expect(out.newLines).toEqual([0, 1, 2]);
  });

  it('strikes a removed spec', () => {
    const out = buildPullRequestOutline(new Map([['ships', SHIPS]]), new Map());
    expect(out.lines).toEqual(['1. ~~ships: Ships fly between stations.~~']);
  });

  it('edits a table cell, adds a row and removes one', () => {
    const out = outline(SHIPS.replace('| ion | 5 | 2 |', '| ion | 6 | 2 |').replace('  | fusion | 9 | 4 |\n', '  | plasma | 7 | 3 |\n'));
    expect(fellBack(out.lines)).toBe(false);
    expect(out.lines.slice(0, 2)).toEqual(['1. ships:', '  a. Engines (patch):']);
    expect(out.lines.join('\n')).toContain('| ion | ~~5~~ **6** |  |');
    expect(out.lines.join('\n')).toContain('| plasma | 7 | 3 |');
    expect(out.lines.join('\n')).toContain('| ~~fusion~~ |  |  |');
  });

  it('marks an edited purpose and sentence', () => {
    const out = outline(SHIPS.replace('Ships fly between stations.', 'Ships fly between ports.').replace('Every ship has one engine.', 'Every ship has two engines.'));
    expect(out.lines).toEqual(['1. ships: Ships fly between ~~stations.~~ **ports.**', '  a. Engines (patch): Every ship has ~~one engine.~~ **two engines.**']);
  });

  it('leaves out a spec that differs only in whitespace', () => {
    expect(outline(SHIPS.replace('Every ship has a hull.', 'Every ship has a hull.  ')).lines).toEqual([]);
  });

  it('notes a spec whose outline would not archive back, rather than draw a wrong one', () => {
    // A head that renumbers its requirements can't be reached by archive, which never relabels.
    const out = outline(SHIPS.replace('3. Docking', '7. Docking'));
    expect(fellBack(out.lines)).toBe(true);
  });
});
