/**
 * Archive is the old name for land; it routes to the land flow.
 */
import type { SkillTemplate, CommandTemplate } from '../types.js';
import { STORE_SELECTION_GUIDANCE } from './store-selection.js';
import { PROJECT_ROOT_GUARD } from './project-root.js';
import { getLandSteps } from './land-change.js';
import { optionalWorkflow } from '../optional-workflow.js';

const POINTER = `Archive is now called land: it applies the change's outline.md to the live specs and deletes the change folder. There is no archive folder and no spec sync. Follow the land flow${optionalWorkflow('land', ' (\`/outline-spec:land\`)', '')}; its steps are repeated here so this works on its own.`;

export function getArchiveChangeSkillTemplate(): SkillTemplate {
  return {
    name: 'outline-spec-archive-change',
    description: 'Old name for landing an outline-spec change; routes to the land flow. Use when the user says "outline-spec archive".',
    instructions: `${POINTER}

${STORE_SELECTION_GUIDANCE}

${PROJECT_ROOT_GUARD}

${getLandSteps('archive')}`,
    license: 'MIT',
    compatibility: 'Requires outline-spec CLI.',
    metadata: { author: 'outline-spec', version: '1.0' },
  };
}

export function getOutlineSpecArchiveCommandTemplate(): CommandTemplate {
  return {
    name: 'outline-spec: Archive',
    description: 'Old name for land: apply a finished change to the specs and delete it',
    category: 'Workflow',
    tags: ['workflow', 'land'],
    content: `${POINTER}

${STORE_SELECTION_GUIDANCE}

${PROJECT_ROOT_GUARD}

${getLandSteps('archive')}`,
  };
}
