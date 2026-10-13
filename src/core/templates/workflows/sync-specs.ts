/**
 * Sync workflow: apply a change's spec edits to the live specs early and keep the change open.
 */
import type { SkillTemplate, CommandTemplate } from '../types.js';
import { STORE_SELECTION_GUIDANCE } from './store-selection.js';
import { PROJECT_ROOT_GUARD } from './project-root.js';
import { optionalWorkflow } from '../optional-workflow.js';

const ARCHIVE_LATER = optionalWorkflow(
  'archive',
  'When the work is done, `/outl:archive` applies whatever outline.md holds by then and deletes the change folder, applied/ included.',
  'When the work is done, `outline-spec archive "<name>"` applies whatever outline.md holds by then and deletes the change folder, applied/ included.'
);

const SYNC_STEPS = `**Input**: Optionally specify a change name. If omitted, infer it from conversation context. If vague or ambiguous you MUST prompt for available changes.

**Steps**

1. **Select the change**

   If a name is provided, use it. Otherwise:
   - Infer from conversation context if the user mentioned a change
   - Auto-select if only one active change exists
   - If ambiguous, run \`outline-spec list --json\` and ask the user to select one

   Always announce: "Using change: <name>" and how to override (e.g., \`/outl:sync <other>\`).

2. **Validate**

   Run \`outline-spec validate "<name>"\`. It checks that outline.md applies cleanly
   against the live specs. If it reports errors, go to **On a mismatch** below
   and stop.

3. **Preview**

   Run \`outline-spec sync "<name>" --dry-run\` and show the user the result: each
   spec it creates, edits, or deletes, with the resulting text, and the
   \`applied/\` file it would write. Nothing is written yet. If it reports there
   is nothing to sync, say so and stop.

4. **Sync**

   Run \`outline-spec sync "<name>" --yes\`. It applies outline.md's
   \`## Requirements\` edits to the live specs in \`outline-spec/specs/\`, moves
   those edits verbatim into \`applied/<date>-<n>.md\` in the change folder, and
   leaves \`## Requirements\` in outline.md empty. Sync doesn't check tasks.

5. **Summarize**

   Show the change name, the specs it touched, and the applied/ file. Explain
   that the change stays open: keep working, add new spec edits to outline.md
   as they come up, and sync again whenever they should reach the live specs.
   The applied/ files are a record only; nothing reads them back.
   ${ARCHIVE_LATER}

**On a mismatch**

\`outline-spec validate\` or \`outline-spec sync\` stops and writes nothing when
outline.md doesn't match the live specs: struck text (\`~~...~~\`) that isn't in
the live item, a label the spec doesn't have, a \`(patch)\` requirement name that
doesn't exist, or a new item that collides with an existing label. Usually the
live spec moved on since the outline was written.

- Read the live spec with \`outline-spec show "<spec>" --type spec\` and the error.
- Update outline.md so it strikes the live text exactly, addresses the live
  labels, and puts new items after the last label at their level.
- Re-run from step 2.
- Never hand-edit the live specs in \`outline-spec/specs/\` to make an outline fit,
  and never copy text into them yourself. outline.md is the only place a change
  edits specs.

**Guardrails**
- Always validate and dry-run before syncing, and show the dry-run result
- Never edit live specs by hand; fix outline.md instead
- Never edit or re-apply files in applied/; they record edits already in the live specs`;

const INTRO = "Sync a change's spec edits to the live specs now and keep the change open.";

const BODY = `${INTRO}

${STORE_SELECTION_GUIDANCE}

${PROJECT_ROOT_GUARD}

${SYNC_STEPS}`;

export function getSyncSpecsSkillTemplate(): SkillTemplate {
  return {
    name: 'outl-sync-specs',
    description: "Sync an outline-spec change's spec edits to the live specs without archiving it. Applies outline.md's Requirements now, records them in the change's applied/ folder, and keeps the change open. Use when the user wants the specs updated mid-change and to keep working. Also use when the user says \"outline-spec sync\".",
    instructions: BODY,
    license: 'MIT',
    compatibility: 'Requires outline-spec CLI.',
    metadata: { author: 'outline-spec', version: '1.0' },
  };
}

export function getOutlineSpecSyncCommandTemplate(): CommandTemplate {
  return {
    name: 'outline-spec: Sync',
    description: "Apply a change's spec edits to the specs now and keep the change open",
    category: 'Workflow',
    tags: ['workflow', 'specs'],
    content: BODY,
  };
}
