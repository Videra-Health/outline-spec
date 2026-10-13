import { describe, expect, it } from 'vitest';
import { findItem, writeItem } from '../../../src/core/outline/item.js';
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
});
