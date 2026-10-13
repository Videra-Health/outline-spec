/**
 * Profile System
 *
 * Defines workflow profiles that control which workflows are installed.
 * Profiles determine WHICH workflows; delivery (in global config) determines HOW.
 */

import type { Profile } from './global-config.js';

/**
 * Core workflows included in the 'core' profile.
 * These provide the streamlined experience for new users.
 */
export const CORE_WORKFLOWS = ['propose', 'explore', 'apply', 'update', 'land', 'archive'] as const;

/**
 * All available workflows in the system.
 */
export const ALL_WORKFLOWS = [
  'propose',
  'explore',
  'new',
  'continue',
  'apply',
  'update',
  'ff',
  'land',
  'archive',
  'verify',
  'onboard',
] as const;

/** Workflows removed with delta specs; update deletes their installed skills and commands. */
export const RETIRED_WORKFLOWS: ReadonlyMap<string, string> = new Map([
  ['sync', 'openspec-sync-specs'],
  ['bulk-archive', 'openspec-bulk-archive-change'],
]);

export type WorkflowId = (typeof ALL_WORKFLOWS)[number];
export type CoreWorkflowId = (typeof CORE_WORKFLOWS)[number];

/**
 * Resolves which workflows should be active for a given profile configuration.
 *
 * - 'core' profile always returns CORE_WORKFLOWS
 * - 'custom' profile returns the provided customWorkflows (minus retired ones) and required dependencies
 */
export function getProfileWorkflows(
  profile: Profile,
  customWorkflows?: string[]
): readonly string[] {
  if (profile === 'custom') {
    const workflows = (customWorkflows ?? []).filter((w) => !RETIRED_WORKFLOWS.has(w));
    // `archive` only points at the land flow, so it needs `land` installed.
    const archiveIndex = workflows.indexOf('archive');
    if (archiveIndex !== -1 && !workflows.includes('land')) {
      return [...workflows.slice(0, archiveIndex), 'land', ...workflows.slice(archiveIndex)];
    }
    return workflows;
  }
  return CORE_WORKFLOWS;
}
