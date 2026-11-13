import { describe, expect, it } from 'vitest';
import { isOutlineSpec, migrateSpec as migrateRaw } from '../../../src/core/outline/migrate.js';
import { compact } from './compact.js';
import { parseSpec } from '../../../src/core/outline/outline.js';

const migrateSpec = (...args: Parameters<typeof migrateRaw>) => {
  const r = migrateRaw(...args);
  return { ...r, text: compact(r.text) };
};
const OLD = (body: string, purpose = 'The round scope at the top of the sidebar.') =>
  `# radar Specification\n\n## Purpose\n${purpose}\n\n## Requirements\n\n${body}`;

describe('migrateSpec', () => {
  it('converts details, indenting them under their requirement', () => {
    const r = migrateSpec(
      OLD(
        '### Requirement: Radar\nA round radar 160 px across\nshows the space around the ship.\n\n#### Details\na. It is a circle.\nb. Range is 200 u.\n  i. R cycles 100, 200, and 400.\n'
      ),
      'radar'
    );
    expect(r.unplaced).toEqual([]);
    expect(r.text).toBe(
      [
        '# radar',
        'The round scope at the top of the sidebar.',
        '',
        '1. Radar: A round radar 160 px across shows the space around the ship.',
        '  a. It is a circle.',
        '  b. Range is 200 u.',
        '    i. R cycles 100, 200, and 400.',
        '',
      ].join('\n')
    );
  });

  it('keeps detail labels as written, gaps included', () => {
    const r = migrateSpec(OLD('### Requirement: R\nSentence.\n\n#### Details\na. One.\nc. Three.\n'), 'radar');
    expect(r.text).toContain('  a. One.\n  c. Three.\n');
  });

  it('drops a details list that only repeats the sentence', () => {
    const r = migrateSpec(OLD('### Requirement: R\nThe sentence.\n\n#### Details\na. The sentence.\n'), 'radar');
    expect(r.text).toMatch(/1\. R: The sentence\.\n$/);
  });

  it('turns scenarios into details after any details, stripping bullets and bold', () => {
    const r = migrateSpec(
      OLD(
        '### Requirement: Sweep\nThe system SHALL sweep.\n\n#### Details\na. Every 2 s.\n\n#### Scenario: Contact brightens\n- **WHEN** the ring passes a contact\n- **THEN** it brightens\n- **AND** fades over 1 s\n\n#### Scenario: No contacts\n- **WHEN** nothing is near\n- **THEN** only the ring shows\n'
      ),
      'radar'
    );
    expect(r.unplaced).toEqual([]);
    expect(r.text).toContain(
      [
        '1. Sweep: The system SHALL sweep.',
        '  a. Every 2 s.',
        '  b. Contact brightens: WHEN the ring passes a contact THEN it brightens AND fades over 1 s',
        '  c. No contacts: WHEN nothing is near THEN only the ring shows',
      ].join('\n')
    );
  });

  it('numbers requirements in order and keeps a lone ** inside a glob', () => {
    const r = migrateSpec(
      OLD('### Requirement: A\nFirst.\n\n### Requirement: B\nSecond.\n\n#### Scenario: Glob\n- **WHEN** it reads `specs/**/*.md`\n'),
      'radar'
    );
    expect(r.text).toContain('1. A: First.\n2. B: Second.\n  a. Glob: WHEN it reads `specs/**/*.md`');
  });

  it('places body bullet lists as details before scenarios', () => {
    const r = migrateSpec(OLD('### Requirement: R\nThe CLI SHALL:\n- respect --no-interactive\n- respect CI=1\n\n#### Scenario: S\n- **WHEN** x\n'), 'radar');
    expect(r.text).toContain('1. R: The CLI SHALL:\n  a. respect --no-interactive\n  b. respect CI=1\n  c. S: WHEN x');
  });

  it('joins a wrapped bullet line onto its bullet', () => {
    const r = migrateSpec(OLD('### Requirement: R\nThe CLI SHALL:\n- respect --no-interactive and\n  the CI variable\n- respect CI=1\n'), 'radar');
    expect(r.unplaced).toEqual([]);
    expect(r.text).toContain('1. R: The CLI SHALL:\n  a. respect --no-interactive and the CI variable\n  b. respect CI=1\n');
  });

  it('turns a paragraph after a list into a detail after the list', () => {
    const r = migrateSpec(
      OLD('### Requirement: R\nOrigins SHALL be stored as:\n- lowercased;\n- without a default port.\n\nA refused update SHALL change\nnothing.\n\n#### Scenario: S\n- **WHEN** x\n'),
      'radar'
    );
    expect(r.unplaced).toEqual([]);
    expect(r.text).toContain(
      '1. R: Origins SHALL be stored as:\n  a. lowercased;\n  b. without a default port.\n  c. A refused update SHALL change nothing.\n  d. S: WHEN x\n'
    );
  });

  it('nests a second list under the paragraph that introduces it', () => {
    const r = migrateSpec(
      OLD('### Requirement: R\nEach call SHALL be given:\n- the story;\n- the report.\n\nThe agent SHALL be told:\n- to explain why;\n- to leave out AI attribution.\n'),
      'radar'
    );
    expect(r.unplaced).toEqual([]);
    expect(r.text).toContain(
      [
        '1. R: Each call SHALL be given:',
        '  a. the story;',
        '  b. the report.',
        '  c. The agent SHALL be told:',
        '    i. to explain why;',
        '    ii. to leave out AI attribution.',
      ].join('\n')
    );
  });

  it('makes a body table the requirement table, adding an id column when it has none', () => {
    const r = migrateSpec(
      OLD('### Requirement: Bands\nA failure SHALL be graded into one band:\n\n| Band | Sentry |\n|---|---|\n| Inert | none |\n| Tracked (2-5 s) | warning |\n'),
      'radar'
    );
    expect(r.unplaced).toEqual([]);
    expect(parseSpec(r.text, 'x').items[0].table).toEqual({
      columns: ['id', 'Band', 'Sentry'],
      rows: [
        ['inert', 'Inert', 'none'],
        ['tracked-2-5-s', 'Tracked (2-5 s)', 'warning'],
      ],
    });
  });

  it('keeps dots and underscores in a generated id', () => {
    const r = migrateSpec(OLD('### Requirement: R\nSentence.\n\n| type | fires when |\n|---|---|\n| `session-report.downloaded` | a report is downloaded |\n'), 'radar');
    expect(parseSpec(r.text, 'x').items[0].table?.rows[0][0]).toBe('session-report.downloaded');
  });

  it('keeps a body table whose first column is already id', () => {
    const r = migrateSpec(OLD('### Requirement: R\nSentence.\n\n| id | Value |\n|---|---|\n| issuer | the site |\n'), 'radar');
    expect(r.unplaced).toEqual([]);
    expect(parseSpec(r.text, 'x').items[0].table).toEqual({ columns: ['id', 'Value'], rows: [['issuer', 'the site']] });
  });

  it('reports a body table whose rows would share an id', () => {
    const r = migrateSpec(OLD('### Requirement: R\nSentence.\n\n| Name | V |\n|---|---|\n| A b | 1 |\n| a-b | 2 |\n'), 'radar');
    expect(r.unplaced.map((u) => u.reason)).toEqual(Array(4).fill('table whose rows have no unique id'));
  });

  it('reads a line starting with # and no space as text, not a heading', () => {
    const r = migrateSpec(OLD('### Requirement: R\nThe suite SHALL carry manifold-tuatara\n#43. The suite SHALL score it.\n'), 'radar');
    expect(r.unplaced).toEqual([]);
    expect(r.text).toContain('1. R: The suite SHALL carry manifold-tuatara #43. The suite SHALL score it.');
  });

  it('keeps a TBD purpose verbatim and reports it', () => {
    const tbd = 'TBD - created by archiving change add-flight-hud. Update Purpose after archive.';
    const r = migrateSpec(OLD('### Requirement: R\nSentence.\n', tbd), 'radar');
    expect(parseSpec(r.text, 'x').purpose).toBe(tbd);
    expect(r.notes).toEqual([`placeholder purpose kept: ${tbd}`]);
  });

  it('reports what it cannot place instead of dropping it', () => {
    const r = migrateSpec(
      OLD('### Requirement: R\nSentence.\n\n#### Scenario: S\n- **WHEN** x\n```text\nout\n```\n\n## Why\nBecause.\n'),
      'radar'
    );
    expect(r.unplaced.map((u) => [u.line, u.reason])).toEqual([
      [13, 'code block'],
      [14, 'code block'],
      [15, 'code block'],
      [17, 'section "Why"'],
      [18, 'section "Why"'],
    ]);
  });

  it('reports a details line without a label', () => {
    const r = migrateSpec(OLD('### Requirement: R\nSentence.\n\n#### Details\na. One.\ncontinued\n'), 'radar');
    expect(r.unplaced).toEqual([expect.objectContaining({ reason: 'details line without a label', text: 'continued' })]);
  });

  it('produces specs that parse back to the same text', () => {
    const r = migrateSpec(OLD('### Requirement: R\nSentence.\n\n#### Scenario: S\n- **WHEN** x\n'), 'radar');
    expect(isOutlineSpec(r.text)).toBe(true);
  });
});

describe('isOutlineSpec', () => {
  it('tells outlines from old-format specs', () => {
    expect(isOutlineSpec('# radar\nPurpose.\n\n1. R: Sentence.\n')).toBe(true);
    expect(isOutlineSpec(OLD('### Requirement: R\nSentence.\n'))).toBe(false);
  });
});
