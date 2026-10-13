/** Finds and removes skills and commands generated under the old `outline-spec` prefix. */

import path from 'path';
import * as fs from 'fs';
import { AI_TOOLS, LEGACY_OUTLINE_SPEC_SKILL_NAMES } from './config.js';
import { CommandAdapterRegistry } from './command-generation/index.js';
import { ALL_WORKFLOWS } from './profiles.js';
import { hasGlobalSkillTarget, resolveToolSkillsDir, toolSupportsSkills } from './shared/skill-paths.js';
import { FileSystemUtils } from '../utils/file-system.js';

const PREFIX = 'outl';
const LEGACY_PREFIX = 'outline-spec';

/** Spells a current command path the way the old prefix did (`outl/` and `outl-` back to `outline-spec`). */
export function toLegacyPrefixPath(commandPath: string): string {
  const dir = path
    .dirname(commandPath)
    .split(path.sep)
    .map((segment) => (segment === PREFIX ? LEGACY_PREFIX : segment))
    .join(path.sep);
  const base = path.basename(commandPath).replace(new RegExp(`^${PREFIX}-`), `${LEGACY_PREFIX}-`);
  return path.join(dir, base);
}

function legacySkillDirs(projectPath: string, toolId: string): { root: string; dir: string }[] {
  const tool = AI_TOOLS.find((candidate) => candidate.value === toolId);
  if (!tool || !toolSupportsSkills(tool)) return [];
  const skillsDirs = [
    resolveToolSkillsDir(projectPath, tool),
    ...(tool.legacySkillsDirs ?? []).map((root) => path.join(projectPath, root, 'skills')),
  ];
  const root = hasGlobalSkillTarget(tool) ? resolveToolSkillsDir(projectPath, tool) : projectPath;
  return skillsDirs.flatMap((skillsDir) =>
    LEGACY_OUTLINE_SPEC_SKILL_NAMES.map((name) => path.join(skillsDir, name))
      .filter((dir) => fs.existsSync(path.join(dir, 'SKILL.md')))
      .map((dir) => ({ root, dir }))
  );
}

function legacyCommandFiles(projectPath: string, toolId: string): { current: string; legacy: string }[] {
  const adapter = CommandAdapterRegistry.get(toolId);
  if (!adapter) return [];
  return ALL_WORKFLOWS.map((workflow) => {
    const relative = adapter.getFilePath(workflow);
    return {
      current: path.join(projectPath, relative),
      legacy: path.join(projectPath, toLegacyPrefixPath(relative)),
    };
  }).filter(({ current, legacy }) => legacy !== current && fs.existsSync(legacy));
}

/** Whether a tool still has skills or commands generated under the old prefix. */
export function hasLegacyPrefixArtifacts(projectPath: string, toolId: string): boolean {
  return (
    legacySkillDirs(projectPath, toolId).length > 0 ||
    legacyCommandFiles(projectPath, toolId).length > 0
  );
}

/** Removes a tool's old-prefix skills and commands; returns how many were removed. */
export async function removeLegacyPrefixArtifacts(projectPath: string, toolId: string): Promise<number> {
  let removed = 0;

  for (const { root, dir } of legacySkillDirs(projectPath, toolId)) {
    FileSystemUtils.assertPathWithin(root, dir);
    await fs.promises.rm(dir, { recursive: true, force: true });
    removed++;
  }

  for (const { current, legacy } of legacyCommandFiles(projectPath, toolId)) {
    FileSystemUtils.assertPathWithin(projectPath, legacy);
    await fs.promises.unlink(legacy);
    removed++;
    await removeEmptyLegacyDirs(path.dirname(legacy), path.dirname(current));
  }

  return removed;
}

/** Removes old-prefix directories (such as `.claude/commands/outline-spec/`) once emptied, stopping where the old and new paths meet. */
async function removeEmptyLegacyDirs(legacyDir: string, currentDir: string): Promise<void> {
  while (legacyDir !== currentDir && path.basename(legacyDir) !== '') {
    try {
      if ((await fs.promises.readdir(legacyDir)).length > 0) return;
      await fs.promises.rmdir(legacyDir);
    } catch {
      return;
    }
    legacyDir = path.dirname(legacyDir);
    currentDir = path.dirname(currentDir);
  }
}
