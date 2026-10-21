import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { parseSpec } from '../../../src/core/outline/outline.js';
import { readLiveSpec, specFile, specNameProblem, writePlan } from '../../../src/core/outline/specs.js';

const SPEC = '# demo\nA demo.\n\n1. Thing: It does a thing.\n';

describe('outline spec files', () => {
  let specsDir: string;
  beforeEach(() => {
    specsDir = path.join(mkdtempSync(path.join(os.tmpdir(), 'outline-spec-specs-')), 'specs');
    mkdirSync(specsDir);
  });
  afterEach(() => rmSync(path.dirname(specsDir), { recursive: true, force: true }));

  it('maps ids to <id>.md, nested ids through area folders', () => {
    expect(specFile(specsDir, 'cli-list')).toBe(path.join(specsDir, 'cli-list.md'));
    expect(specFile(specsDir, 'platform/session-layout')).toBe(path.join(specsDir, 'platform', 'session-layout.md'));
  });

  it('rejects a nested spec named spec, which would look like the old layout', () => {
    expect(specNameProblem('area/spec')).toMatch(/must not end in 'spec'/);
    expect(specNameProblem('spec')).toBeNull();
    expect(specNameProblem('area/specs')).toBeNull();
  });

  it('creates area folders for a new spec', () => {
    writePlan(specsDir, new Map([['platform/session-layout', parseSpec(SPEC, 'x')]]));
    expect(existsSync(path.join(specsDir, 'platform', 'session-layout.md'))).toBe(true);
  });

  it('deletes a removed spec and the area folders it empties, never the specs root', () => {
    mkdirSync(path.join(specsDir, 'a', 'b'), { recursive: true });
    writeFileSync(path.join(specsDir, 'a', 'b', 'deep.md'), SPEC);
    writeFileSync(path.join(specsDir, 'top.md'), SPEC);
    writePlan(specsDir, new Map([['a/b/deep', null], ['top', null]]));
    expect(readdirSync(specsDir)).toEqual([]);
    expect(existsSync(specsDir)).toBe(true);
  });

  it('keeps an area folder that still holds another spec', () => {
    mkdirSync(path.join(specsDir, 'area'));
    writeFileSync(path.join(specsDir, 'area', 'one.md'), SPEC);
    writeFileSync(path.join(specsDir, 'area', 'two.md'), SPEC);
    writePlan(specsDir, new Map([['area/one', null]]));
    expect(readdirSync(path.join(specsDir, 'area'))).toEqual(['two.md']);
  });

  it('reports a case-only clash when the file system is case-insensitive', () => {
    writeFileSync(path.join(specsDir, 'auth.md'), SPEC);
    const insensitive = existsSync(path.join(specsDir, 'AUTH.md'));
    if (!insensitive) {
      expect(readLiveSpec(specsDir, 'Auth')).toBeNull();
      return;
    }
    expect(() => readLiveSpec(specsDir, 'Auth')).toThrow(/conflicts with spec 'auth'/);
    expect(readLiveSpec(specsDir, 'auth')).not.toBeNull();
  });
});
