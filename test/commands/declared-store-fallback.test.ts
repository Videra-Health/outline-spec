import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { getGlobalDataDir, registerStore } from '../../src/core/index.js';
import { runCLI, type RunCLIResult } from '../helpers/run-cli.js';
import { snapshotDirectory as snapshot } from '../helpers/fs-snapshot.js';
import { createOutlineSpecRoot, writeSpec } from '../helpers/outline-spec-fixtures.js';

describe('declared store fallback (3.2)', () => {
  let tempDir: string;
  let globalDataDir: string;
  let env: NodeJS.ProcessEnv;
  let storeRoot: string;
  let pointerRepo: string;

  beforeEach(async () => {
    tempDir = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), 'outline-spec-declared-'))
    );
    env = {
      XDG_DATA_HOME: path.join(tempDir, 'data'),
      XDG_CONFIG_HOME: path.join(tempDir, 'config'),
      OUTLINE_SPEC_INTERACTIVE: '0',
    };
    globalDataDir = getGlobalDataDir({ env });

    storeRoot = path.join(tempDir, 'team-context');
    createOutlineSpecRoot(storeRoot);
    await registerStore({ id: 'team-context', localPath: storeRoot, globalDataDir });

    pointerRepo = path.join(tempDir, 'app-repo');
    fs.mkdirSync(path.join(pointerRepo, 'outline-spec'), { recursive: true });
    fs.writeFileSync(
      path.join(pointerRepo, 'outline-spec', 'config.yaml'),
      'store: team-context\n'
    );
  });

  afterEach(() => {
    // Windows can hold a brief handle on a just-exited spawned CLI; retry
    // the recursive remove so EBUSY during teardown does not flake the run.
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  function parseJson(result: RunCLIResult): any {
    return JSON.parse(result.stdout);
  }


  it('runs the externalized-planning journey without --store anywhere', async () => {
    const pointerBefore = snapshot(pointerRepo);

    const created = await runCLI(['new', 'change', 'billing-rework', '--json'], {
      cwd: pointerRepo,
      env,
    });
    expect(created.exitCode).toBe(0);
    expect(parseJson(created).root).toEqual({
      path: fs.realpathSync.native(storeRoot),
      source: 'declared',
      store_id: 'team-context',
    });

    const statusHuman = await runCLI(['status', '--change', 'billing-rework'], {
      cwd: pointerRepo,
      env,
    });
    expect(statusHuman.exitCode).toBe(0);
    expect(statusHuman.stderr).toContain('Using outline-spec root: team-context');

    // Hint continuity: follow-ups carry --store on BOTH surfaces. A text
    // `Next:` line that dropped the flag would resolve against the pointer
    // repo instead of the store.
    expect(statusHuman.stdout).toContain(
      'Next: outline-spec instructions outline --change "billing-rework" --store team-context --json'
    );

    const statusJson = await runCLI(['status', '--change', 'billing-rework', '--json'], {
      cwd: pointerRepo,
      env,
    });
    expect(parseJson(statusJson).nextSteps.join(' ')).toContain('--store team-context');

    const instructions = await runCLI(
      ['instructions', 'outline', '--change', 'billing-rework', '--json'],
      { cwd: pointerRepo, env }
    );
    expect(instructions.exitCode).toBe(0);

    const changeDir = path.join(storeRoot, 'outline-spec', 'changes', 'billing-rework');
    fs.writeFileSync(
      path.join(changeDir, 'outline.md'),
      '## Proposal\nBilling rework.\n\n## Requirements\n1. billing: Bills customers.\n  a. Billing: The system bills.\n'
    );

    const validate = await runCLI(['validate', 'billing-rework', '--json', '--no-interactive'], {
      cwd: pointerRepo,
      env,
    });
    expect(validate.exitCode).toBe(0);

    const list = await runCLI(['list', '--json'], { cwd: pointerRepo, env });
    expect(parseJson(list).root.source).toBe('declared');

    const show = await runCLI(['show', 'billing-rework', '--json', '--type', 'change'], {
      cwd: pointerRepo,
      env,
    });
    expect(show.exitCode).toBe(0);

    const archived = await runCLI(['archive', 'billing-rework', '--yes', '--json'], {
      cwd: pointerRepo,
      env,
    });
    expect(archived.exitCode).toBe(0);
    expect(fs.existsSync(changeDir)).toBe(false);
    expect(fs.existsSync(path.join(storeRoot, 'outline-spec', 'specs', 'billing', 'spec.md'))).toBe(true);

    // The pointer repo is byte-identical: no specs/, no changes/, nothing.
    expect(snapshot(pointerRepo)).toEqual(pointerBefore);
    // Heaviest test in the file (8 CLI subprocess spawns); the 10s default
    // is tight on slow Windows runners.
  }, 60_000);

  it('composes with 3.1: the declared root surfaces the store own references', async () => {
    const upstreamRoot = path.join(tempDir, 'upstream-context');
    createOutlineSpecRoot(upstreamRoot);
    writeSpec(upstreamRoot, 'platform-rules', '# platform-rules\nPlatform rules.\n\n1. Rule: The platform has rules.\n');
    await registerStore({ id: 'upstream-context', localPath: upstreamRoot, globalDataDir });
    fs.writeFileSync(
      path.join(storeRoot, 'outline-spec', 'config.yaml'),
      'schema: outline\nreferences:\n  - upstream-context\n'
    );

    const created = await runCLI(['new', 'change', 'ref-check', '--json'], {
      cwd: pointerRepo,
      env,
    });
    expect(created.exitCode).toBe(0);

    const instructions = await runCLI(
      ['instructions', 'outline', '--change', 'ref-check', '--json'],
      { cwd: pointerRepo, env }
    );
    const refs = parseJson(instructions).references;
    expect(refs.map((entry: any) => entry.store_id)).toEqual(['upstream-context']);
  });

  it('installs integrations in a pointer repo without creating a local planning root', async () => {
    const legacyAgentsPath = path.join(pointerRepo, 'outline-spec', 'AGENTS.md');
    fs.writeFileSync(legacyAgentsPath, 'Keep this pointer-repo file.\n');
    const before = snapshot(pointerRepo);
    const initialized = await runCLI(['init', '.', '--tools', 'claude'], {
      cwd: pointerRepo,
      env,
    });

    expect(initialized.exitCode).toBe(0);
    expect(fs.existsSync(path.join(pointerRepo, '.claude', 'skills', 'outl-propose', 'SKILL.md'))).toBe(true);
    expect(fs.readFileSync(path.join(pointerRepo, 'outline-spec', 'config.yaml'), 'utf8')).toBe(
      'store: team-context\n'
    );
    expect(fs.existsSync(path.join(pointerRepo, 'outline-spec', 'specs'))).toBe(false);
    expect(fs.existsSync(path.join(pointerRepo, 'outline-spec', 'changes'))).toBe(false);
    expect(fs.readFileSync(legacyAgentsPath, 'utf8')).toBe('Keep this pointer-repo file.\n');

    expect(before.get('outline-spec/config.yaml')).toBe('store: team-context\n');
  });

  it.skipIf(process.platform === 'win32')('installs integrations through a symlinked pointer-repo root', async () => {
    const alias = path.join(tempDir, 'repo-alias');
    fs.symlinkSync(pointerRepo, alias, 'dir');
    const initialized = await runCLI(['init', alias, '--tools', 'claude'], {
      cwd: tempDir,
      env,
    });

    expect(initialized.exitCode).toBe(0);
    expect(fs.existsSync(path.join(pointerRepo, '.claude', 'skills', 'outl-propose', 'SKILL.md'))).toBe(true);
    expect(fs.readFileSync(path.join(pointerRepo, 'outline-spec', 'config.yaml'), 'utf8')).toBe(
      'store: team-context\n'
    );
  });

  it('applies explicit Copilot cloud choices without changing the pointer config', async () => {
    const configPath = path.join(pointerRepo, 'outline-spec', 'config.yaml');
    const setupStepsPath = path.join(
      pointerRepo,
      '.github',
      'workflows',
      'copilot-setup-steps.yml'
    );
    const agentPath = path.join(pointerRepo, '.github', 'agents', 'outline-spec.agent.md');
    const before = fs.readFileSync(configPath, 'utf8');

    const enabled = await runCLI(
      ['init', '.', '--tools', 'github-copilot', '--copilot-cloud'],
      { cwd: pointerRepo, env }
    );

    expect(enabled.exitCode).toBe(0);
    expect(fs.existsSync(setupStepsPath)).toBe(true);
    expect(fs.existsSync(agentPath)).toBe(true);
    expect(fs.readFileSync(configPath, 'utf8')).toBe(before);

    const disabled = await runCLI(
      ['init', '.', '--tools', 'github-copilot', '--no-copilot-cloud'],
      { cwd: pointerRepo, env }
    );

    expect(disabled.exitCode).toBe(0);
    expect(fs.existsSync(setupStepsPath)).toBe(false);
    expect(fs.existsSync(agentPath)).toBe(false);
    expect(fs.readFileSync(configPath, 'utf8')).toBe(before);
    expect(fs.existsSync(path.join(pointerRepo, 'outline-spec', 'specs'))).toBe(false);
  });

  it('rejects --language in a pointer repo without changing either root', async () => {
    const pointerBefore = snapshot(pointerRepo);
    const storeBefore = snapshot(storeRoot);
    const result = await runCLI(
      ['init', '.', '--tools', 'none', '--language', 'French'],
      { cwd: pointerRepo, env }
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--language cannot update an external store');
    expect(snapshot(pointerRepo)).toEqual(pointerBefore);
    expect(snapshot(storeRoot)).toEqual(storeBefore);
  });

  it('refuses init for malformed pointers and from pointer-repo subdirectories', async () => {
    // A broken declaration must not be buried under a scaffold.
    fs.writeFileSync(
      path.join(pointerRepo, 'outline-spec', 'config.yaml'),
      'store: [team-context]\n'
    );
    const malformed = await runCLI(['init', '.'], { cwd: pointerRepo, env });
    expect(malformed.exitCode).toBe(1);
    expect(malformed.stderr).toContain('Fix or remove the store: line');
    expect(fs.existsSync(path.join(pointerRepo, 'outline-spec', 'specs'))).toBe(false);

    // And a subdirectory of a pointer repo must not grow a nested root
    // that silently diverts work away from the declared store.
    fs.writeFileSync(
      path.join(pointerRepo, 'outline-spec', 'config.yaml'),
      'store: team-context\n'
    );
    const subdir = path.join(pointerRepo, 'packages', 'api');
    fs.mkdirSync(subdir, { recursive: true });
    const nested = await runCLI(['init', '.'], { cwd: subdir, env });
    expect(nested.exitCode).toBe(1);
    expect(nested.stderr).toContain("externalized to store 'team-context'");
    expect(fs.existsSync(path.join(subdir, 'outline-spec'))).toBe(false);
  });

  it('keeps real-root stdout byte-identical when a pointer is present, with one warning', async () => {
    const realRepo = path.join(tempDir, 'real-repo');
    createOutlineSpecRoot(realRepo);
    const runs: Record<string, { stdout: string; warnings: number }> = {};

    for (const [label, config] of [
      ['without', 'schema: outline\n'],
      ['with', 'schema: outline\nstore: team-context\n'],
    ] as const) {
      fs.writeFileSync(path.join(realRepo, 'outline-spec', 'config.yaml'), config);
      const result = await runCLI(['list', '--json'], { cwd: realRepo, env });
      expect(result.exitCode).toBe(0);
      runs[label] = {
        stdout: result.stdout,
        warnings: (result.stderr.match(/the declaration is ignored/g) ?? []).length,
      };
    }

    expect(runs.with.stdout).toBe(runs.without.stdout);
    expect(runs.without.warnings).toBe(0);
    expect(runs.with.warnings).toBe(1);
  });
});
