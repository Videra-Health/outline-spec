import { promises as fs } from 'fs';
import path from 'path';
import { discoverSpecFiles } from './spec-discovery.js';

/**
 * Returns the ids of active changes: every directory under openspec/changes/
 * except hidden ones and an `archive` folder left by older projects.
 *
 * A change is resolved by its directory alone - the same rule `list`,
 * `status`, `instructions` and `validate` use (`getAvailableChanges`).
 * Requiring proposal.md here made `openspec show` and shell completion miss
 * changes those commands resolve: `openspec new change <name>` scaffolds only
 * `.openspec.yaml`, and a custom schema need not define a proposal artifact at
 * all (#1161).
 */
export async function getActiveChangeIds(root: string = process.cwd()): Promise<string[]> {
  const changesPath = path.join(root, 'openspec', 'changes');
  try {
    const entries = await fs.readdir(changesPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && entry.name !== 'archive' && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export async function getSpecIds(root: string = process.cwd()): Promise<string[]> {
  const specsPath = path.join(root, 'openspec', 'specs');
  const discovered = await discoverSpecFiles(specsPath);
  return discovered.map((spec) => spec.id);
}
