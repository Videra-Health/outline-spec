/**
 * Skill Generation Utilities
 *
 * Shared utilities for generating skill and command files.
 */

import {
  getExploreSkillTemplate,
  getNewChangeSkillTemplate,
  getContinueChangeSkillTemplate,
  getApplyChangeSkillTemplate,
  getUpdateChangeSkillTemplate,
  getFfChangeSkillTemplate,
  getArchiveChangeSkillTemplate,
  getVerifyChangeSkillTemplate,
  getOnboardSkillTemplate,
  getOutlineSpecProposeSkillTemplate,
  getOutlineSpecExploreCommandTemplate,
  getOutlineSpecNewCommandTemplate,
  getOutlineSpecContinueCommandTemplate,
  getOutlineSpecApplyCommandTemplate,
  getOutlineSpecUpdateCommandTemplate,
  getOutlineSpecFfCommandTemplate,
  getOutlineSpecArchiveCommandTemplate,
  getOutlineSpecVerifyCommandTemplate,
  getOutlineSpecOnboardCommandTemplate,
  getOutlineSpecProposeCommandTemplate,
  type SkillTemplate,
} from '../templates/skill-templates.js';
import type { CommandContent } from '../command-generation/index.js';
import {
  assertWorkflowConditionalsResolved,
  resolveOptionalWorkflows,
} from '../templates/optional-workflow.js';
import { ALL_WORKFLOWS } from '../profiles.js';
import { OUTLINE_SPEC_CLI_ALLOWED_TOOLS } from './allowed-tools.js';

/**
 * The workflow set a template body is rendered against.
 *
 * `workflowFilter` is both the list of workflows to install and the set a
 * template may refer to, so resolving optional-workflow conditionals here —
 * the one place every generation path (init, update, migration, the skills.sh
 * distribution) already funnels through — keeps a reference to an uninstalled
 * workflow out of every generated file (#1734, umbrella #919).
 *
 * With no filter, every workflow is installed (that is what an unfiltered call
 * means), so the installed branch is kept.
 */
function resolveInstalledWorkflows(
  workflowFilter?: readonly string[]
): ReadonlySet<string> {
  return new Set<string>(workflowFilter ?? ALL_WORKFLOWS);
}

/**
 * Skill template with directory name and workflow ID mapping.
 */
export interface SkillTemplateEntry {
  template: SkillTemplate;
  dirName: string;
  workflowId: string;
}

/**
 * Command template with ID mapping.
 */
export interface CommandTemplateEntry {
  template: ReturnType<typeof getOutlineSpecExploreCommandTemplate>;
  id: string;
}

/**
 * Gets skill templates with their directory names, optionally filtered by workflow IDs.
 *
 * @param workflowFilter - If provided, only return templates whose workflowId is in this array
 */
export function getSkillTemplates(workflowFilter?: readonly string[]): SkillTemplateEntry[] {
  const all: SkillTemplateEntry[] = [
    { template: getExploreSkillTemplate(), dirName: 'outl-explore', workflowId: 'explore' },
    { template: getNewChangeSkillTemplate(), dirName: 'outl-new-change', workflowId: 'new' },
    { template: getContinueChangeSkillTemplate(), dirName: 'outl-continue-change', workflowId: 'continue' },
    { template: getApplyChangeSkillTemplate(), dirName: 'outl-apply-change', workflowId: 'apply' },
    { template: getUpdateChangeSkillTemplate(), dirName: 'outl-update-change', workflowId: 'update' },
    { template: getFfChangeSkillTemplate(), dirName: 'outl-ff-change', workflowId: 'ff' },
    { template: getArchiveChangeSkillTemplate(), dirName: 'outl-archive-change', workflowId: 'archive' },
    { template: getVerifyChangeSkillTemplate(), dirName: 'outl-verify-change', workflowId: 'verify' },
    { template: getOnboardSkillTemplate(), dirName: 'outl-onboard', workflowId: 'onboard' },
    { template: getOutlineSpecProposeSkillTemplate(), dirName: 'outl-propose', workflowId: 'propose' },
  ];

  const installed = resolveInstalledWorkflows(workflowFilter);
  const selected = workflowFilter ? all.filter(entry => installed.has(entry.workflowId)) : all;

  return selected.map(entry => ({
    ...entry,
    template: {
      ...entry.template,
      instructions: resolveOptionalWorkflows(entry.template.instructions, installed),
    },
  }));
}

/**
 * Gets command templates with their IDs, optionally filtered by workflow IDs.
 *
 * @param workflowFilter - If provided, only return templates whose id is in this array
 */
export function getCommandTemplates(workflowFilter?: readonly string[]): CommandTemplateEntry[] {
  const all: CommandTemplateEntry[] = [
    { template: getOutlineSpecExploreCommandTemplate(), id: 'explore' },
    { template: getOutlineSpecNewCommandTemplate(), id: 'new' },
    { template: getOutlineSpecContinueCommandTemplate(), id: 'continue' },
    { template: getOutlineSpecApplyCommandTemplate(), id: 'apply' },
    { template: getOutlineSpecUpdateCommandTemplate(), id: 'update' },
    { template: getOutlineSpecFfCommandTemplate(), id: 'ff' },
    { template: getOutlineSpecArchiveCommandTemplate(), id: 'archive' },
    { template: getOutlineSpecVerifyCommandTemplate(), id: 'verify' },
    { template: getOutlineSpecOnboardCommandTemplate(), id: 'onboard' },
    { template: getOutlineSpecProposeCommandTemplate(), id: 'propose' },
  ];

  const installed = resolveInstalledWorkflows(workflowFilter);
  const selected = workflowFilter ? all.filter(entry => installed.has(entry.id)) : all;

  return selected.map(entry => ({
    ...entry,
    template: {
      ...entry.template,
      content: resolveOptionalWorkflows(entry.template.content, installed),
    },
  }));
}

/**
 * Converts command templates to CommandContent array, optionally filtered by workflow IDs.
 *
 * @param workflowFilter - If provided, only return contents whose id is in this array
 */
export function getCommandContents(workflowFilter?: readonly string[]): CommandContent[] {
  const commandTemplates = getCommandTemplates(workflowFilter);
  return commandTemplates.map(({ template, id }) => ({
    id,
    name: template.name,
    description: template.description,
    category: template.category,
    tags: template.tags,
    body: template.content,
  }));
}

/**
 * Generates skill file content with YAML frontmatter.
 *
 * @param template - The skill template
 * @param generatedByVersion - The outline-spec version to embed in the file
 * @param transformInstructions - Optional callback to transform the instructions content
 */
export function generateSkillContent(
  template: SkillTemplate,
  generatedByVersion: string,
  transformInstructions?: (instructions: string) => string
): string {
  const instructions = transformInstructions
    ? transformInstructions(template.instructions)
    : template.instructions;

  assertWorkflowConditionalsResolved(
    instructions,
    `Skill '${template.name}' was generated without resolving its optional-workflow blocks`
  );

  return `---
name: ${template.name}
description: ${template.description}
allowed-tools: ${OUTLINE_SPEC_CLI_ALLOWED_TOOLS}
license: ${template.license || 'MIT'}
compatibility: ${template.compatibility || 'Requires outline-spec CLI.'}
metadata:
  author: ${template.metadata?.author || 'outline-spec'}
  version: "${template.metadata?.version || '1.0'}"
  generatedBy: "${generatedByVersion}"
---

${instructions}
`;
}
