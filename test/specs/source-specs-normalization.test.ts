import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import { parseSpec, writeSpec } from '../../src/core/outline/outline.js';
import { Validator } from '../../src/core/validation/validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const specsRoot = path.join(projectRoot, 'openspec', 'specs');

async function getSpecFiles(): Promise<string[]> {
  const entries = await fs.readdir(specsRoot, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const specFile = path.join(specsRoot, entry.name, 'spec.md');
    try {
      await fs.access(specFile);
      files.push(specFile);
    } catch {
      // Ignore directories without spec.md
    }
  }
  return files.sort();
}

describe('source-of-truth specs are outlines', () => {
  it('every spec parses, round-trips byte for byte, and validates strictly', async () => {
    const files = await getSpecFiles();
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = await fs.readFile(file, 'utf8');
      const relativeFile = path.relative(projectRoot, file);
      const name = path.basename(path.dirname(file));
      const spec = parseSpec(content, relativeFile);

      expect(spec.name, `${relativeFile} title must be its folder name`).toBe(name);
      expect(writeSpec(spec), `${relativeFile} must be written in canonical outline form`).toBe(content);
      const report = await new Validator(true).validateSpecContent(name, content);
      expect(report.issues, `${relativeFile} must validate strictly`).toEqual([]);
    }
  });
});
