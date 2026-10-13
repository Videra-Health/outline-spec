import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { loadChangeContext } from '../../src/core/artifact-graph/instruction-loader.js';
import { METADATA_FILENAME } from '../../src/utils/change-metadata.js';
import {
  CHANGE_METADATA_KNOWN_KEYS,
  ChangeMetadataSchema,
} from '../../src/core/change-metadata/schema.js';

const OUTLINE = `## Proposal
Pure internal refactor with no spec-level behavior change.`;

describe('unrecognized keys in .openspec.yaml', () => {
  it('knows exactly the keys ChangeMetadataSchema defines', () => {
    // A key added to the schema but not to this list would warn on, and fail
    // --strict for, every change that uses it.
    expect([...CHANGE_METADATA_KNOWN_KEYS].sort()).toEqual(
      Object.keys(ChangeMetadataSchema.shape).sort()
    );
  });
});

describe('status/instructions report unrecognized change metadata keys', () => {
  let tempDir: string;
  let changeDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), 'test-status-unknown-metadata-'));
    changeDir = path.join(tempDir, 'openspec', 'changes', 'probe');
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(path.join(changeDir, 'outline.md'), OUTLINE, 'utf-8');
    await fs.writeFile(
      path.join(changeDir, METADATA_FILENAME),
      'schema: outline\nskip_specs: true\nskip_design: true\n',
      'utf-8'
    );
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('returns a warning when loading a change whose .openspec.yaml has unknown keys', () => {
    const context = loadChangeContext(tempDir, 'probe');

    // skip_specs went away with delta specs, so it is now just another unknown key.
    expect(context.metadata).not.toHaveProperty('skip_specs');
    expect(context.warnings).toEqual([expect.stringContaining('skip_design')]);
    expect(context.warnings[0]).toContain('skip_specs');
  });
});
