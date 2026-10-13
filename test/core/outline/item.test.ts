import { describe, expect, it } from 'vitest';
import { findItem, rowObject, writeItem } from '../../../src/core/outline/item.js';
import { parseSpec } from '../../../src/core/outline/outline.js';

const SPEC = parseSpec(
  '# cfg\nConfig files.\n\n1. Reads config.yaml: It reads config.yaml.\n  a. Tabs fail.\n2. Reads config: It reads config.\n  a. One.\n    i. Nested.\n',
  'cfg'
);

describe('findItem', () => {
  it('resolves a requirement by name, preferring the longest name with dots', () => {
    expect(findItem(SPEC, 'Reads config.yaml').node.label).toBe('1');
    expect(findItem(SPEC, 'Reads config.yaml.a').node.text).toBe('Tabs fail.');
    expect(findItem(SPEC, 'Reads config.a.i').node.text).toBe('Nested.');
  });

  it('resolves by label path', () => expect(writeItem(findItem(SPEC, '2.a'))).toBe('  a. One.\n    i. Nested.'));

  it('names what is missing', () => {
    expect(() => findItem(SPEC, 'Nope')).toThrow('No requirement or label "Nope" in cfg');
    expect(() => findItem(SPEC, '2.z')).toThrow('No item "z" under 2.');
  });

  it('resolves a table row by id, including ids with dots', () => {
    const spec = parseSpec('# s\nP.\n\n1. Catalog: C.\n  | id | Mass |\n  |---|---|\n  | m.60 | 25 |\n  a. D.\n', 's');
    const found = findItem(spec, 'Catalog.m.60');
    expect(found.row).toEqual(['m.60', '25']);
    expect(rowObject(found)).toEqual({ id: 'm.60', Mass: '25' });
    expect(findItem(spec, 'Catalog.a').node.text).toBe('D.');
    expect(() => findItem(spec, 'Catalog.nope')).toThrow('No item "nope"');
  });
});
