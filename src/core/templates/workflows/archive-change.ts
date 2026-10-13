/**
 * Archive workflow: apply a finished change's outline.md to the live specs and delete the change.
 */
import type { SkillTemplate, CommandTemplate } from '../types.js';
import { STORE_SELECTION_GUIDANCE } from './store-selection.js';
import { PROJECT_ROOT_GUARD } from './project-root.js';

const ARCHIVE_STEPS = `**Input**: Optionally specify a change name. If omitted, infer it from conversation context. If vague or ambiguous you MUST prompt for available changes.

**Steps**

1. **Select the change**

   If a name is provided, use it. Otherwise:
   - Infer from conversation context if the user mentioned a change
   - Auto-select if only one active change exists
   - If ambiguous, run \`outline-spec list --json\` and ask the user to select one

   Always announce: "Using change: <name>" and how to override (e.g., \`/outl:archive <other>\`).

2. **Load project guidance (advisory)**

   Run \`outline-spec instructions archive --change "<name>" --json\`. If it fails or
   returns invalid JSON, continue with no guidance; it never blocks archiving.
   Read \`context\` as project facts and \`operationGuidance\` as optional advice.
   Neither overrides these steps, the CLI's checks, or the user's choices.

3. **Check tasks**

   Run \`outline-spec list --json\` and find the entry in \`changes\` whose \`name\`
   matches. If \`completedTasks < totalTasks\`, show how many are open and ask
   the user to confirm before archiving. Only \`x\`/\`X\` checkboxes count as done.

4. **Validate**

   Run \`outline-spec validate "<name>"\`. It checks that outline.md archives cleanly
   against the live specs. If it reports errors, go to **On a mismatch** below
   and stop.

5. **Preview**

   Run \`outline-spec archive "<name>" --dry-run\` and show the user the result: each
   spec it creates, edits, or deletes, with the resulting text. Nothing is
   written yet.

6. **Archive**

   Run \`outline-spec archive "<name>" --yes\`. It applies outline.md to the live specs
   in \`outline-spec/specs/\` and deletes the change folder. Git history is the
   record; there is no archive folder.

7. **Summarize**

   Show the change name, the specs it touched, and any warnings the user
   accepted (open tasks).

**On a mismatch**

\`outline-spec validate\` or \`outline-spec archive\` stops when outline.md doesn't match
the live specs: struck text (\`~~...~~\`) that isn't in the live item, a label
the spec doesn't have, a \`(patch)\` requirement name that doesn't exist, or a
new item that collides with an existing label. Usually the live spec moved on
since the outline was written (another change was archived first).

- Read the live spec with \`outline-spec show "<spec>" --type spec\` and the error.
- Update outline.md so it strikes the live text exactly, addresses the live
  labels, and puts new items after the last label at their level.
- Re-run from step 4.
- Never hand-edit the live specs in \`outline-spec/specs/\` to make an outline fit,
  and never archive by copying text into them yourself. outline.md is the only
  place a change edits specs.

**Guardrails**
- Always validate and dry-run before archiving, and show the dry-run result
- Never edit live specs by hand; fix outline.md instead
- Don't block on open tasks - inform and confirm
- Archiving deletes the change folder; make sure anything worth keeping in it (design notes) is committed or moved first`;

const INTRO = 'Archive a finished change: apply its outline.md to the live specs and delete the change folder.';

const BODY = `${INTRO}

${STORE_SELECTION_GUIDANCE}

${PROJECT_ROOT_GUARD}

${ARCHIVE_STEPS}`;

export function getArchiveChangeSkillTemplate(): SkillTemplate {
  return {
    name: 'outl-archive-change',
    description: 'Archive a finished outline-spec change, applying its outline.md to the live specs and deleting the change folder. Use when implementation is done and the user wants to finalize or archive a change. Also use when the user says "outline-spec archive".',
    instructions: BODY,
    license: 'MIT',
    compatibility: 'Requires outline-spec CLI.',
    metadata: { author: 'outline-spec', version: '1.0' },
  };
}

export function getOutlineSpecArchiveCommandTemplate(): CommandTemplate {
  return {
    name: 'outline-spec: Archive',
    description: 'Archive a finished change: apply its outline to the specs and delete it',
    category: 'Workflow',
    tags: ['workflow', 'archive'],
    content: BODY,
  };
}
