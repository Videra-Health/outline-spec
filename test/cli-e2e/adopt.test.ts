import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCLI } from '../helpers/run-cli.js';

const OLD = '# auth Specification\n\n## Purpose\nSign users in.\n\n## Requirements\n### Requirement: Login\nThe system SHALL log users in.\n\n#### Scenario: Good password\n- **WHEN** the password matches\n- **THEN** a session starts\n';
const CONVERTED = '# auth\nSign users in.\n\n1. Login: The system SHALL log users in.\n  a. Good password: WHEN the password matches THEN a session starts\n';
const OUTLINE = '# hull\nShips have a hull.\n\n1. Plating: Hull plating stops damage.\n';

let root: string;
const at = (...p: string[]) => path.join(root, ...p);
const write = (rel: string, text: string) => {
  mkdirSync(path.dirname(at(rel)), { recursive: true });
  writeFileSync(at(rel), text);
};
const read = (rel: string) => readFileSync(at(rel), 'utf-8');
const cli = (...args: string[]) => runCLI(['adopt', ...args], { cwd: root });

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'outline-spec-adopt-'));
  write('openspec/config.yaml', 'schema: spec-driven\ncontext: |\n  Web app.\n');
  write('openspec/specs/auth/spec.md', OLD);
  write('openspec/specs/hull/spec.md', OUTLINE);
  write('openspec/changes/archive/2025-01-01-old/proposal.md', '# old\n');
  write('openspec/changes/add-mfa/proposal.md', '# MFA\n');
  write('openspec/changes/add-mfa/specs/auth/spec.md', '## ADDED Requirements\n### Requirement: MFA\n');
  write('openspec/changes/add-mfa/.openspec.yaml', 'schema: spec-driven\ncreated: 2025-01-02\n');
  write('openspec/changes/tidy/outline.md', '## Proposal\nTidy.\n\n## Requirements\n1. hull:\n');
  write('.claude/skills/openspec-propose/SKILL.md', 'OpenSpec skill\n');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('outline-spec adopt', () => {
  it('moves openspec/ to outline-spec/, converts specs, drops the archive, and sets the outline schema', async () => {
    const r = await cli();

    expect(r.exitCode).toBe(0);
    expect(existsSync(at('openspec'))).toBe(false);
    expect(read('outline-spec/specs/auth/spec.md')).toBe(CONVERTED);
    expect(read('outline-spec/specs/hull/spec.md')).toBe(OUTLINE);
    expect(existsSync(at('outline-spec/changes/archive'))).toBe(false);
    expect(read('outline-spec/config.yaml')).toBe('schema: outline\ncontext: |\n  Web app.\n');
    expect(read('outline-spec/changes/add-mfa/.outline-spec.yaml')).toBe('schema: outline\ncreated: 2025-01-02\n');
    expect(existsSync(at('outline-spec/changes/add-mfa/.openspec.yaml'))).toBe(false);
    expect(r.stdout).toMatch(/delta format[^\n]*\n {2}- add-mfa\n/);
    expect(r.stdout).not.toMatch(/- tidy/);
    expect(r.stdout).toContain('outline-spec update');
    // .claude/ belongs to OpenSpec and to `outline-spec update`; adopt leaves it alone.
    expect(read('.claude/skills/openspec-propose/SKILL.md')).toBe('OpenSpec skill\n');
    expect(existsSync(at('.claude/skills/outline-spec-propose'))).toBe(false);
  });

  it('writes nothing on --dry-run', async () => {
    const r = await cli('--dry-run', '--json');

    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({
      dryRun: true,
      blocked: false,
      deletedArchive: true,
      deltaChanges: ['add-mfa'],
      metadataRenamed: ['add-mfa'],
      schemaRewritten: ['outline-spec/config.yaml', 'outline-spec/changes/add-mfa/.outline-spec.yaml'],
    });
    expect(read('openspec/specs/auth/spec.md')).toBe(OLD);
    expect(existsSync(at('outline-spec'))).toBe(false);
  });

  it('stops before moving anything when a spec cannot convert', async () => {
    write('openspec/specs/auth/spec.md', `${OLD}\n## Why\nBecause.\n`);

    const r = await cli();

    expect(r.exitCode).toBe(1);
    expect(r.stdout).toMatch(/openspec\/specs\/auth\/spec\.md:15 \(section "Why"\)/);
    expect(r.stdout).toContain('Nothing moved');
    expect(existsSync(at('outline-spec'))).toBe(false);
    expect(existsSync(at('openspec/changes/archive'))).toBe(true);
  });

  it('refuses when outline-spec/ already exists', async () => {
    write('outline-spec/config.yaml', 'schema: outline\n');

    const r = await cli();

    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('outline-spec/ already exists');
    expect(read('openspec/specs/auth/spec.md')).toBe(OLD);
  });

  it('refuses without an openspec/ folder', async () => {
    rmSync(at('openspec'), { recursive: true });

    const r = await cli();

    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('No openspec/ folder');
  });

  it('leaves a project-local custom schema name alone', async () => {
    write('openspec/config.yaml', 'schema: my-flow\n');

    const r = await cli();

    expect(r.exitCode).toBe(0);
    expect(read('outline-spec/config.yaml')).toBe('schema: my-flow\n');
  });
});
