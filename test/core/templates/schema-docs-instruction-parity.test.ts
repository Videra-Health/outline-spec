import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseSchema } from '../../../src/core/artifact-graph/schema.js';

// docs/schema.md quotes every built-in `outline` instruction verbatim; this keeps it in step with schema.yaml.
const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const SCHEMA_DIR = path.join(REPO_ROOT, 'schemas', 'outline');
const DOC_PATH = path.join(REPO_ROOT, 'docs', 'schema.md');

const normalize = (value: string): string => value.replace(/\r\n?/g, '\n').trim();

// The fence length varies per block because an instruction may contain its own
// ``` example, so the outer fence has to be longer.
const QUOTED_INSTRUCTION =
  /### Instructions\n\n[^\n]*\n\n(`{3,})md\n([\s\S]*?)\n\1\n/g;

describe('outline schema docs', () => {
  it('quotes every outline instruction verbatim', () => {
    const schema = parseSchema(
      fs.readFileSync(path.join(SCHEMA_DIR, 'schema.yaml'), 'utf-8')
    );
    const doc = fs.readFileSync(DOC_PATH, 'utf-8').replace(/\r\n?/g, '\n');

    const quoted = [...doc.matchAll(QUOTED_INSTRUCTION)].map(match => match[2]);
    const expected: Array<[string, string]> = [
      ...schema.artifacts.map(
        (artifact): [string, string] => [artifact.id, artifact.instruction ?? '']
      ),
      ['apply', schema.apply?.instruction ?? ''],
    ];

    expect(quoted).toHaveLength(expected.length);
    expected.forEach(([id, instruction], index) => {
      expect(instruction, `${id} has no instruction to quote`).not.toBe('');
      expect(normalize(quoted[index]), `${id} instruction is stale in ${path.basename(DOC_PATH)}`).toBe(
        normalize(instruction)
      );
    });
  });

  it('keeps the tasks guidance on docs/schema.md', () => {
    const doc = fs.readFileSync(DOC_PATH, 'utf-8').replace(/\r\n?/g, '\n');
    expect(doc).toContain('Each group lands the tests and docs its own work calls for');
    expect(doc).toContain('Each task states how to verify it');
  });
});
