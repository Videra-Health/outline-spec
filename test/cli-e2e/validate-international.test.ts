import { afterAll, describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { runCLI } from '../helpers/run-cli.js';

const tempRoots: string[] = [];

/** Create a temporary project containing a non-English main spec. */
async function prepareNonEnglishSpec(): Promise<string> {
  const projectDir = await fs.mkdtemp(path.join(tmpdir(), 'openspec-i18n-validation-'));
  tempRoots.push(projectDir);
  const specDir = path.join(projectDir, 'openspec', 'specs', '日志记录');
  await fs.mkdir(specDir, { recursive: true });
  await fs.writeFile(
    path.join(specDir, 'spec.md'),
    `# 日志记录
记录应用程序中的重要事件，以便团队能够诊断问题、调查故障、审计活动并了解长期的系统行为。

1. 事件记录: 系统记录应用程序中的重要事件。
  a. 应用程序生成重要事件时，系统保存该事件。
`
  );
  return projectDir;
}

/** Create a temporary project containing a non-English change that adds a spec. */
async function prepareNonEnglishChange(): Promise<string> {
  const projectDir = await fs.mkdtemp(path.join(tmpdir(), 'openspec-i18n-change-validation-'));
  tempRoots.push(projectDir);
  const changeDir = path.join(projectDir, 'openspec', 'changes', '添加日志');
  await fs.mkdir(changeDir, { recursive: true });
  await fs.mkdir(path.join(projectDir, 'openspec', 'specs'), { recursive: true });
  await fs.writeFile(
    path.join(changeDir, 'outline.md'),
    `## Proposal
团队需要诊断问题。

## Requirements
1. 日志记录: 记录应用程序中的重要事件。
  a. 事件记录: 系统记录应用程序中的重要事件。
    a. 应用程序生成重要事件时，系统保存该事件。
`
  );
  return projectDir;
}

afterAll(async () => {
  await Promise.all(tempRoots.map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('non-English validation (#243)', () => {
  it('validates a non-English spec cleanly, strict mode included', async () => {
    const projectDir = await prepareNonEnglishSpec();

    const normal = await runCLI(
      ['validate', '日志记录', '--type', 'spec', '--no-interactive'],
      { cwd: projectDir }
    );
    expect(normal.exitCode).toBe(0);
    expect(normal.stdout).toContain('Specification');
    expect(normal.stdout).toContain('is valid');

    const normalJson = await runCLI(
      ['validate', '日志记录', '--type', 'spec', '--json', '--no-interactive'],
      { cwd: projectDir }
    );
    const report = JSON.parse(normalJson.stdout);
    expect(normalJson.exitCode).toBe(0);
    expect(report.summary.totals).toMatchObject({ passed: 1, failed: 0 });
    expect(report.items[0]).toMatchObject({ valid: true, issues: [] });

    const strict = await runCLI(
      ['validate', '日志记录', '--type', 'spec', '--strict', '--no-interactive'],
      { cwd: projectDir }
    );
    expect(strict.exitCode).toBe(0);
    expect(strict.stdout).toContain('is valid');
  });

  it('validates a non-English change cleanly, strict mode included', async () => {
    const projectDir = await prepareNonEnglishChange();

    for (const extra of [[], ['--strict']]) {
      const result = await runCLI(
        ['validate', '添加日志', '--type', 'change', '--json', '--no-interactive', ...extra],
        { cwd: projectDir }
      );
      const report = JSON.parse(result.stdout);
      expect(result.exitCode).toBe(0);
      expect(report.summary.totals).toMatchObject({ passed: 1, failed: 0 });
      expect(report.items[0]).toMatchObject({ id: '添加日志', type: 'change', valid: true, issues: [] });
    }
  });
});
