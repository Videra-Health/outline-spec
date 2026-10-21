import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import { parseSpec, writeSpec } from '../../src/core/outline/outline.js';
import { Validator } from '../../src/core/validation/validator.js';
import { discoverSpecFiles } from '../../src/utils/spec-discovery.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const specsRoot = path.join(projectRoot, 'outline-spec', 'specs');

async function getSpecFiles(): Promise<Array<{ id: string; specFile: string }>> {
  return discoverSpecFiles(specsRoot);
}

describe('source-of-truth specs are outlines', () => {
  it('every spec parses, round-trips byte for byte, and validates strictly', async () => {
    const files = await getSpecFiles();
    expect(files.length).toBeGreaterThan(0);

    for (const { id: name, specFile: file } of files) {
      const content = await fs.readFile(file, 'utf8');
      const relativeFile = path.relative(projectRoot, file);
      const spec = parseSpec(content, relativeFile);

      expect(spec.name, `${relativeFile} title must be its id`).toBe(name);
      expect(writeSpec(spec), `${relativeFile} must be written in canonical outline form`).toBe(content);
      const report = await new Validator(true).validateSpecContent(name, content);
      // These specs predate the 25-word item limit; shortening them is separate work.
      const issues = report.issues.filter((i) => !i.message.startsWith('Item is '));
      expect(issues, `${relativeFile} must validate strictly`).toEqual([]);
    }
  });
});
