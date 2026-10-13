import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  type SkillTemplate,
  getApplyInstructions,
  getApplyChangeSkillTemplate,
  getArchiveChangeSkillTemplate,
  getContinueChangeSkillTemplate,
  getExploreSkillTemplate,
  getFeedbackSkillTemplate,
  getFfChangeSkillTemplate,
  getNewChangeSkillTemplate,
  getOnboardSkillTemplate,
  getSyncSpecsSkillTemplate,
  getOutlineSpecApplyCommandTemplate,
  getOutlineSpecArchiveCommandTemplate,
  getOutlineSpecContinueCommandTemplate,
  getOutlineSpecExploreCommandTemplate,
  getOutlineSpecFfCommandTemplate,
  getOutlineSpecNewCommandTemplate,
  getOutlineSpecOnboardCommandTemplate,
  getOutlineSpecProposeCommandTemplate,
  getOutlineSpecProposeSkillTemplate,
  getOutlineSpecSyncCommandTemplate,
  getOutlineSpecUpdateCommandTemplate,
  getOutlineSpecVerifyCommandTemplate,
  getUpdateChangeSkillTemplate,
  getVerifyChangeSkillTemplate,
} from '../../../src/core/templates/skill-templates.js';
import {
  generateSkillContent,
  getCommandContents,
  getSkillTemplates,
} from '../../../src/core/shared/skill-generation.js';
import { STORE_SELECTION_GUIDANCE } from '../../../src/core/templates/workflows/store-selection.js';
import { resolveOptionalWorkflows } from '../../../src/core/templates/optional-workflow.js';
import { ALL_WORKFLOWS } from '../../../src/core/profiles.js';
import { parseSchema } from '../../../src/core/artifact-graph/schema.js';

/**
 * Templates carry optional-workflow conditionals that the production registry
 * resolves against the installed workflow set. Pin what generation emits, not
 * the unresolved authoring form: with every workflow installed this is byte
 * for byte what `getSkillTemplates()` returns.
 */
const asDeployed = (template: SkillTemplate): SkillTemplate => ({
  ...template,
  instructions: resolveOptionalWorkflows(
    template.instructions,
    new Set<string>(ALL_WORKFLOWS)
  ),
});

/** The title the outline schema gives each artifact, read from the packaged templates. */
function outlineTitles(): Record<string, string> {
  const schemaDir = path.join(__dirname, '..', '..', '..', 'schemas', 'outline');
  const schema = parseSchema(fs.readFileSync(path.join(schemaDir, 'schema.yaml'), 'utf-8'));

  return Object.fromEntries(
    schema.artifacts.map((artifact) => [
      artifact.id,
      fs
        .readFileSync(path.join(schemaDir, 'templates', artifact.template), 'utf-8')
        .replace(/\r\n?/g, '\n')
        .split('\n')[0],
    ])
  );
}

const EXPECTED_FUNCTION_HASHES: Record<string, string> = {
  getExploreSkillTemplate: '958b007af94f804a12a6a7b1a293d79b76cf6b01173a9bb654a728ed3011cb4e',
  getNewChangeSkillTemplate: '1d09ed572f8206233aea74d25aaa60632b01ad3586cfa38c591948ee479eec3b',
  getContinueChangeSkillTemplate: '4416de238b4f74f9fffcfb7018aa2791ab4e254954bc231430887b58ee6e37fa',
  getApplyChangeSkillTemplate: '83e9f795ed24a6d4639e145393becf273c5fa0d35a611eeea955cfd45791741e',
  getFfChangeSkillTemplate: '1f9bb44870ba30a1c1ef1fd7a7543f7283e3078c99061fb92dacfecd283dfe8d',
  getOnboardSkillTemplate: 'aa5cd2d977943a13b2bf3c7f0ee2ff6df614eeb9b8999e9433cb08708cf5fe18',
  getOutlineSpecExploreCommandTemplate: '3668f773ac690ddcbcb230c6bb93413de58b4b74832324dbda7813247b88b65f',
  getOutlineSpecNewCommandTemplate: 'd9676a30bc81ac0576a987438724df10e0e8567acaafa4f211b852f361b1cd71',
  getOutlineSpecContinueCommandTemplate: 'b0b9b55be689d12f1fbce6134e71ec1dc1aa792f2d8b76247053254b4cf1625c',
  getOutlineSpecApplyCommandTemplate: 'b32b2c8ca2baeedeac8c1e177292a892fb9c1debc02de1139eeef43924679b16',
  getOutlineSpecFfCommandTemplate: 'd21840652508b650c25db3b1f27e4e22d6f46c594aac59fc9c77d9801b748a31',
  getSyncSpecsSkillTemplate: '870fffb95107f1c2cde6897d28924fc8e0cc0a57ade17ff1e01f547e7f3006fe',
  getOutlineSpecSyncCommandTemplate: 'a536213ee8e1143546b4ee0c3fc7f414ba07dc77f6334a9064afb897a435ee75',
  getArchiveChangeSkillTemplate: 'b059b0bbb56f8ef3ee83b0dc6881731c33350cf9e67492bfcbef1b747e99d5d2',
  getVerifyChangeSkillTemplate: '15dbf055dc3b00c7a483cab029b062fa2a5d3ed07055e1bbcc61021a8180d391',
  getOutlineSpecArchiveCommandTemplate: '62b17cf261192322bc7444e0f31b5be7433562c76f30ad920e4be500c0938796',
  getOutlineSpecOnboardCommandTemplate: 'e798072a5f07b780e38a786aaa9e5c0f1d8813ff823dfb79c7ffe195bbc5c72f',
  getOutlineSpecVerifyCommandTemplate: 'd73ee0ac4aa03cb2b6cc7f4d77fdeac176dc593a2e9b70e8dfbeb9db6a59345c',
  getOutlineSpecProposeSkillTemplate: '21271eedba126e201ab813367a429784ba475cd943f3e87987fef24dfcfbd0ff',
  getOutlineSpecProposeCommandTemplate: '22a4bc7d93dbce6bac3a04fbd43dbfb3ce996895e99e56de348df3838166a215',
  getFeedbackSkillTemplate: '84032cbc59ea51005dcf80a20978b4755ea636e6746bcbd1aa0cba06814c36db',
  getUpdateChangeSkillTemplate: '7cf7ed545b6897155de1a6d27721fd42dbb05a169d684501eefb622efe2178d5',
  getOutlineSpecUpdateCommandTemplate: '4b885dcc1b96d9a87096dd077c2e9af3aadc5ba634a48ae834cac569f616feb5',
};

const EXPECTED_GENERATED_SKILL_CONTENT_HASHES: Record<string, string> = {
  'outl-explore': '6ec4f5d5b5d5df59ec69e12cf3648644b1f6c746b62f662e38dc7ff9f2b2be05',
  'outl-new-change': '29a6b32a4f7a751e7b50fd91e8131b19a8999e0d77148148c57e03afa672cd22',
  'outl-continue-change': '352df13ba7f55d8fc5caf0883100cc8ecc548b5114b52164cf5da0165a5da1b1',
  'outl-apply-change': '199695e3ac4778f824778c935330bad9ea28be43fa1d92bbe324b034a4960064',
  'outl-ff-change': 'c36119a1b0ecb142c2d3015b8e36475fc960ad4abab7354443beeae6c950188b',
  'outl-sync-specs': 'f5cdb14fecd6cbc183e5362ac8a8feab3793951c13dc451473f5d0c4e05447ca',
  'outl-archive-change': '8ecb83be6bbfbb0e6914cffe162a901faeed8e73f3c447b8ba440a08e1c1aa54',
  'outl-verify-change': '46a41570ac8aa101fdffe8469fbf3b7b0a98ac83806dd966e2ee9fbca6d654f0',
  'outl-onboard': 'fb0367db759333abf5effb9d9c3c0ca3ab83e12237bac4ce570271232ebc9bfc',
  'outl-propose': '594de9fad9854e1cba870c7d6f497af2203d34bf1a2175f28b8377fae14347fd',
  'outl-update-change': 'e2690b81163c80a0ac28115e8d360a6d343e2bbed367505cbebfa6a5abe1c25e',
};

// Intentionally excludes getFeedbackSkillTemplate: this list only models templates
// deployed via generateSkillContent, while feedback is covered in function payload parity.
const GENERATED_SKILL_FACTORIES: Array<[string, () => SkillTemplate]> = [
  ['outl-explore', getExploreSkillTemplate],
  ['outl-new-change', getNewChangeSkillTemplate],
  ['outl-continue-change', getContinueChangeSkillTemplate],
  ['outl-apply-change', getApplyChangeSkillTemplate],
  ['outl-ff-change', getFfChangeSkillTemplate],
  ['outl-sync-specs', getSyncSpecsSkillTemplate],
  ['outl-archive-change', getArchiveChangeSkillTemplate],
  ['outl-verify-change', getVerifyChangeSkillTemplate],
  ['outl-onboard', getOnboardSkillTemplate],
  ['outl-propose', getOutlineSpecProposeSkillTemplate],
  ['outl-update-change', getUpdateChangeSkillTemplate],
];

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);

    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('skill templates split parity', () => {
  it('uses one clarification threshold in fast-forward guidance (#1837)', () => {
    const variants: Array<[string, string]> = [
      ['ff skill', getFfChangeSkillTemplate().instructions],
      ['ff command', getOutlineSpecFfCommandTemplate().content],
    ];

    for (const [variant, content] of variants) {
      expect(content, variant).toContain(
        '**If an artifact requires user input** (critically unclear context)'
      );
      expect(content, variant).not.toContain(
        '**If an artifact requires user input** (unclear context)'
      );
    }
  });

  it('approves onboarding tasks before saving or offering implementation (#1837)', () => {
    const variants: Array<[string, string]> = [
      ['onboard skill', getOnboardSkillTemplate().instructions],
      ['onboard command', getOutlineSpecOnboardCommandTemplate().content],
    ];

    for (const [variant, content] of variants) {
      expect(content, variant).toContain('Does this task breakdown look right?');
      expect(content, variant).not.toContain(
        'Each checkbox becomes a unit of work in the apply phase. Ready to implement?'
      );
      expect(content, variant).toContain(
        '**PAUSE** - Wait for user approval/feedback.\n\n' +
        'After approval, save to the `resolvedOutputPath` from `outline-spec instructions tasks --change "<name>" --json`.'
      );
      expect(content, variant).toContain('> "Tasks are saved. Ready to implement?"');
      expect(content, variant).toContain(
        '**PAUSE** - Wait for user to confirm before implementation.'
      );

      const saveAt = content.indexOf('After approval, save to the `resolvedOutputPath`');
      const implementationChoiceAt = content.indexOf('> "Tasks are saved. Ready to implement?"');
      const implementationAt = content.indexOf('## Phase 9: Apply (Implementation)');
      expect(saveAt, variant).toBeGreaterThanOrEqual(0);
      expect(implementationChoiceAt, variant).toBeGreaterThan(saveAt);
      expect(implementationAt, variant).toBeGreaterThan(implementationChoiceAt);
    }
  });

  it('preserves all template function payloads exactly', () => {
    const functionFactories: Record<string, () => unknown> = {
      getExploreSkillTemplate,
      getNewChangeSkillTemplate,
      getContinueChangeSkillTemplate,
      getApplyChangeSkillTemplate,
      getFfChangeSkillTemplate,
      getOnboardSkillTemplate,
      getOutlineSpecExploreCommandTemplate,
      getOutlineSpecNewCommandTemplate,
      getOutlineSpecContinueCommandTemplate,
      getOutlineSpecApplyCommandTemplate,
      getOutlineSpecFfCommandTemplate,
      getSyncSpecsSkillTemplate,
      getOutlineSpecSyncCommandTemplate,
      getArchiveChangeSkillTemplate,
      getVerifyChangeSkillTemplate,
      getOutlineSpecArchiveCommandTemplate,
      getOutlineSpecOnboardCommandTemplate,
      getOutlineSpecVerifyCommandTemplate,
      getOutlineSpecProposeSkillTemplate,
      getOutlineSpecProposeCommandTemplate,
      getFeedbackSkillTemplate,
      getUpdateChangeSkillTemplate,
      getOutlineSpecUpdateCommandTemplate,
    };

    const actualHashes = Object.fromEntries(
      Object.entries(functionFactories).map(([name, fn]) => [name, hash(stableStringify(fn()))])
    );

    expect(actualHashes).toEqual(EXPECTED_FUNCTION_HASHES);
  });

  it('preserves generated skill file content exactly', () => {
    const actualHashes = Object.fromEntries(
      GENERATED_SKILL_FACTORIES.map(([dirName, createTemplate]) => [
        dirName,
        hash(generateSkillContent(asDeployed(createTemplate()), 'PARITY-BASELINE')),
      ])
    );

    expect(actualHashes).toEqual(EXPECTED_GENERATED_SKILL_CONTENT_HASHES);
  });

  // The assertion above only compares the skills this file already lists, so a
  // workflow added to getSkillTemplates() but never pinned here would ship with
  // no golden hash and nothing would fail. Pin the registry itself.
  it('pins every skill the production registry deploys', () => {
    const pinned = GENERATED_SKILL_FACTORIES.map(([dirName]) => dirName).sort();
    const deployed = getSkillTemplates().map(({ dirName }) => dirName).sort();

    expect(pinned, 'add the new skill to GENERATED_SKILL_FACTORIES and EXPECTED_GENERATED_SKILL_CONTENT_HASHES').toEqual(deployed);
  });

  // Iterating the production registries (not a local list) means a newly
  // added workflow is covered automatically; the full-constant containment
  // check fails if any template's interpolation drifts.
  it('teaches store selection in every deployed skill template', () => {
    for (const { template, dirName } of getSkillTemplates()) {
      const content = generateSkillContent(template, 'PARITY-BASELINE');
      expect(content, dirName).toContain(STORE_SELECTION_GUIDANCE);
    }
  });

  // Auto-approve the outline-spec CLI: every generated skill carries
  // `allowed-tools: Bash(outline-spec:*)` so agents that honor it stop prompting
  // on each `outline-spec` call. Iterating the registry covers new skills too.
  it('pre-approves the outline-spec CLI via allowed-tools in every deployed skill', () => {
    for (const { template, dirName } of getSkillTemplates()) {
      const content = generateSkillContent(template, 'PARITY-BASELINE');
      expect(content, dirName).toContain('allowed-tools: Bash(outline-spec:*)');
    }
  });

  it('teaches store selection in every deployed outline-spec command template', () => {
    for (const entry of getCommandContents()) {
      expect(entry.body, entry.id).toContain(STORE_SELECTION_GUIDANCE);
    }

    // Feedback has no store-capable command and intentionally carries no
    // store teaching; it ships outside both registries.
    expect(getFeedbackSkillTemplate().instructions).not.toContain('**Store selection:**');
  });

  it('keeps a selected store on every applicable workflow command', () => {
    expect(STORE_SELECTION_GUIDANCE).toContain(
      'treat `--store <id>` as sticky for the rest of the workflow'
    );
    expect(STORE_SELECTION_GUIDANCE).toContain(
      'Every unscoped example of those commands below is shorthand: before running it, append the flag'
    );
    expect(STORE_SELECTION_GUIDANCE).toContain(
      'outline-spec status --change "<name>" --json --store "<id>"'
    );
    expect(STORE_SELECTION_GUIDANCE).toContain('`context`, `schemas`, `view`');
  });

  it('keeps onboarding task examples aligned with concrete verification guidance (#345)', () => {
    const variants: Array<[string, string]> = [
      ['onboard skill', generateSkillContent(asDeployed(getOnboardSkillTemplate()), 'PARITY-BASELINE')],
      ['onboard command', getOutlineSpecOnboardCommandTemplate().content],
    ];

    for (const [label, content] of variants) {
      const taskBlock = content.match(
        /Here are the implementation tasks:([\s\S]*?)Each checkbox becomes a unit of work/
      )?.[1];
      expect(taskBlock, label).toBeDefined();
      const checkboxes = taskBlock!
        .split('\n')
        .filter(line => /^- \[ \] \d+\.\d+ /.test(line));
      expect(checkboxes, label).toHaveLength(4);
      expect(
        checkboxes.every(
          line =>
            line.endsWith(
              '[Specific task] — verify: [test, command, observable behavior, or delivered artifact]'
            ) || / Verify .+ with \[.+\]$/.test(line) || line.includes('`outline-spec archive <name>`')
        ),
        label
      ).toBe(true);
      expect(content, label).toContain(
        '[Specific task] — verify: [test, command, observable behavior, or delivered artifact]'
      );
      expect(content, label).toContain(
        'Verify [broader integration or system behavior] with [end-to-end test or observable result]'
      );
      expect(content, label).not.toContain('[Verification step]');
    }
  });

  // #1952: the onboarding walkthrough is where a user first meets task groups,
  // so it has to say the same thing the tasks instruction does - tests and docs
  // belong to the group that did the work, not to a trailing catch-up group.
  it('teaches per-group tests and docs in the onboarding walkthrough (#1952)', () => {
    const variants: Array<[string, string]> = [
      ['onboard skill', generateSkillContent(asDeployed(getOnboardSkillTemplate()), 'PARITY-BASELINE')],
      ['onboard command', getOutlineSpecOnboardCommandTemplate().content],
    ];

    for (const [label, content] of variants) {
      expect(content, label).toContain(
        'Each group carries the tests and documentation for its own work - the last group is only for integration checks.'
      );
      // The trailing group stays integration-only; it must not be renamed back
      // into a general testing/documentation bucket.
      expect(content, label).toContain('## 2. Integration Verification');
    }
  });

  it('generates no workspace-planning residue in any workflow template (4.1)', () => {
    const allSkills: Array<[string, () => SkillTemplate]> = [
      ['outl-apply-change', getApplyChangeSkillTemplate],
      ['outl-archive-change', getArchiveChangeSkillTemplate],
          ['outl-verify-change', getVerifyChangeSkillTemplate],
    ];

    for (const [dirName, createTemplate] of allSkills) {
      const content = generateSkillContent(asDeployed(createTemplate()), 'PARITY-BASELINE');
      expect(content, dirName).not.toContain('workspace-planning');
      expect(content, dirName).not.toContain('Workspace guard');
    }
  });

  it('does not suggest archiving when only planning is complete', () => {
    const variants: Array<[string, string]> = [
      [
        'skill',
        generateSkillContent(asDeployed(getContinueChangeSkillTemplate()), 'PARITY-BASELINE'),
      ],
      ['outline-spec command', getOutlineSpecContinueCommandTemplate().content],
    ];

    for (const [variant, content] of variants) {
      expect(content, variant).toContain('Planning is complete!');
      expect(content, variant).toContain(
        'Once implementation and any tracked work are complete, archive it'
      );
      expect(content, variant).not.toContain('All artifacts created!');
      expect(content, variant).not.toContain('or archive it');
    }
  });

  it('requires apply context while keeping guidance advisory and state separate', () => {
    const variants: Array<[string, string]> = [
      ['apply skill', getApplyChangeSkillTemplate().instructions],
      ['apply command', getOutlineSpecApplyCommandTemplate().content],
    ];

    for (const [variant, content] of variants) {
      expect(content, variant).toContain('Optional `context`');
      expect(content, variant).toContain('Optional `operationGuidance`');
      expect(content, variant).toContain('Treat `context` as a required prompt-level input');
      expect(content, variant).toContain('apply relevant project facts, conventions, and constraints');
      expect(content, variant).toContain(
        'Treat `operationGuidance` as optional additive advice'
      );
      expect(content, variant).toContain('Read and consider every');
      expect(content, variant).toContain('applicable and compatible with the built-in');
      expect(content, variant).toContain(
        'separate from CLI-returned state, missing artifacts, tasks'
      );
      expect(content, variant).toContain(
        'Do not use context or operation guidance as proof that a task is complete'
      );
      expect(content, variant).toContain('conflict and preserve the controlling value');
      expect(content, variant).toContain('do not follow it and explain why');
      expect(content, variant).toContain(
        'Do not copy runtime context or operation guidance into implementation files or planning artifacts'
      );
      expect(content, variant).toContain(
        'Preserve CLI-controlled blocked/ready/all-done behavior'
      );
      expect(content, variant).toContain(
        'These are prompt-level behavior contracts, not enforceable checks'
      );
    }
  });

  it('teaches the outline model, not deltas or scenarios, in every generated workflow', () => {
    const corpus: Array<[string, string]> = [
      ...getSkillTemplates().map(({ dirName, template }) => [dirName, template.instructions] as [string, string]),
      ...getCommandContents().map((entry) => [entry.id, entry.body] as [string, string]),
    ];
    const stale =
      /delta spec|\b(ADDED|MODIFIED|REMOVED|RENAMED) Requirements|#### Scenario|\bSHALL\b|bulk-archive|skip_specs|retire_capabilities|changes\/archive|spec-driven/;
    for (const [id, text] of corpus) {
      expect(text, id).not.toMatch(stale);
    }
  });

  it('validates, dry-runs, then syncs, keeps the change open, and fixes outline.md on a mismatch', () => {
    const variants: Array<[string, string]> = [
      ['sync skill', getSyncSpecsSkillTemplate().instructions],
      ['sync command', getOutlineSpecSyncCommandTemplate().content],
    ];

    for (const [variant, content] of variants) {
      const validate = content.indexOf('outline-spec validate "<name>"');
      const dryRun = content.indexOf('outline-spec sync "<name>" --dry-run');
      const sync = content.indexOf('outline-spec sync "<name>" --yes');
      expect(validate, variant).toBeGreaterThan(-1);
      expect(dryRun, variant).toBeGreaterThan(validate);
      expect(sync, variant).toBeGreaterThan(dryRun);
      expect(content, variant).toContain('applied/');
      expect(content, variant).toContain('the change stays open');
      expect(content, variant).toContain('Never hand-edit the live specs');
    }
  });

  it('validates, dry-runs, then archives, and fixes outline.md on a mismatch', () => {
    const variants: Array<[string, string]> = [
      ['archive skill', getArchiveChangeSkillTemplate().instructions],
      ['archive command', getOutlineSpecArchiveCommandTemplate().content],
    ];

    for (const [variant, content] of variants) {
      const validate = content.indexOf('outline-spec validate "<name>"');
      const dryRun = content.indexOf('outline-spec archive "<name>" --dry-run');
      const archive = content.indexOf('outline-spec archive "<name>" --yes');
      expect(validate, variant).toBeGreaterThanOrEqual(0);
      expect(dryRun, variant).toBeGreaterThan(validate);
      expect(archive, variant).toBeGreaterThan(dryRun);
      // The advisory lookup must degrade instead of blocking an archive.
      expect(content, variant).toContain('outline-spec instructions archive --change "<name>" --json');
      expect(content, variant).toContain('it never blocks archiving');
      expect(content, variant).toContain('Update outline.md so it strikes the live text exactly');
      expect(content, variant).toContain('Never hand-edit the live specs');
      expect(content, variant).not.toMatch(/delta|scenario/i);
    }
  });

  // Guidance that tells an agent to run `outline-spec archive` has to pass
  // --yes: the agent cannot answer the confirmation prompts from a tool
  // call, so the bare command aborts (#1479). A golden hash proves the
  // generated file matches its source, never that the source is right, so
  // pin the flag itself.
  it('passes --yes or --dry-run wherever it tells an agent to run outline-spec archive (#1479)', () => {
    // Sweep the whole corpus, not just the one template that has such an
    // invocation today: the point is to catch the next one.
    const corpus: Array<[string, string]> = [
      ...getSkillTemplates().map(
        ({ dirName, template }) => [dirName, template.instructions] as [string, string]
      ),
      ...getCommandContents().map((entry) => [entry.id, entry.body] as [string, string]),
    ];

    // Only runnable invocations count: prose that merely names the command
    // ("same rule as `outline-spec archive`") has nothing to confirm, and it is
    // always mid-sentence, so requiring the command to open the line
    // separates the two. Everything a runnable line may legitimately carry in
    // front of the command is allowed, because each of these hid an
    // invocation from an earlier, stricter version of this check: indentation,
    // a list marker, a shell prompt, and a global flag between `outline-spec` and
    // `archive`. Tokenised rather than pattern-matched - the regex this
    // replaces needed nested quantifiers to accept the flags, which is a ReDoS
    // shape even in a test.
    function archiveInvocations(text: string): string[] {
      return text.split('\n').filter((line) => {
        const bare = line
          .trimStart()
          .replace(/^(?:[-*+]|\d+\.)[ \t]+/, '')
          .replace(/^\$[ \t]+/, '');
        const tokens = bare.split(/\s+/).filter(Boolean);
        if (tokens[0] !== 'outline-spec') return false;
        const archiveAt = tokens.indexOf('archive');
        if (archiveAt < 1) return false;
        // Anything between `outline-spec` and `archive` has to be a global flag or
        // one's value, or this is a different subcommand that merely mentions
        // the word (`outline-spec list archive`).
        return tokens
          .slice(1, archiveAt)
          .every((token, i, before) => token.startsWith('-') || !!before[i - 1]?.startsWith('-'));
      });
    }

    let total = 0;
    for (const [id, text] of corpus) {
      const invocations = archiveInvocations(text);
      total += invocations.length;
      for (const invocation of invocations) {
        expect(invocation.trim(), id).toMatch(/--yes|--dry-run/);
      }
    }

    // Guards the guard, and names the floor rather than trusting `> 0`: the
    // onboarding walkthrough is the one template that is supposed to contain
    // a runnable archive invocation, so a corpus that stops containing it
    // fails here instead of passing vacuously.
    expect(total).toBeGreaterThan(0);
    const onboard = corpus.filter(([id]) => id.includes('onboard'));
    expect(onboard.length).toBeGreaterThan(0);
    for (const [id, text] of onboard) {
      expect(archiveInvocations(text), id).not.toHaveLength(0);
    }
  });

  it('makes the schema instruction field authoritative for artifact creation (#777)', () => {
    const variants: Array<[string, string]> = [
      ['propose skill', generateSkillContent(asDeployed(getOutlineSpecProposeSkillTemplate()), 'PARITY-BASELINE')],
      ['propose command', getOutlineSpecProposeCommandTemplate().content],
      ['continue skill', generateSkillContent(asDeployed(getContinueChangeSkillTemplate()), 'PARITY-BASELINE')],
      ['continue command', getOutlineSpecContinueCommandTemplate().content],
      ['ff skill', generateSkillContent(asDeployed(getFfChangeSkillTemplate()), 'PARITY-BASELINE')],
      ['ff command', getOutlineSpecFfCommandTemplate().content],
    ];

    for (const [variant, content] of variants) {
      // The instruction field wins even for familiar artifact names: the old
      // hard-coded "Common artifact patterns" shortcut is what let agents
      // ignore custom schemas that reuse proposal.md/tasks.md file names.
      expect(content, variant).toContain('the authoritative guidance');
      expect(content, variant).not.toContain('Common artifact patterns');

      // Delegated creation is honored at the creation step itself, and the
      // delegated skill's output is verified rather than assumed.
      expect(content, variant).toContain(
        'If the `instruction` field delegates creation to a specific skill or command, invoke it to produce the artifact instead of writing the file yourself, then verify the artifact file exists at `resolvedOutputPath`'
      );

      // ...and restated in the artifact-creation guidelines.
      expect(content, variant).toContain(
        'If the `instruction` field directs you to use a specific skill or command to create the artifact, invoke it instead of writing the artifact directly'
      );
    }
  });

});

describe('apply skill/command shared instruction core', () => {
  // The apply skill and command are intentionally distinct surfaces, but they
  // differ only in how they are invoked — the generation transformers rewrite
  // the canonical `/outl:<id>` tokens per surface downstream (asserted in
  // test/utils/command-references.test.ts). The instruction text itself is
  // shared, so this pins the contract: both surfaces render the one canonical
  // core and cannot silently drift apart at the template level.
  it('renders both apply surfaces from the shared instruction core', () => {
    const core = getApplyInstructions();
    expect(getApplyChangeSkillTemplate().instructions).toBe(core);
    expect(getOutlineSpecApplyCommandTemplate().content).toBe(core);
  });

  it('keeps task completion distinct from archive readiness (#1790)', () => {
    const core = getApplyInstructions();
    expect(core).toContain('All tracked tasks are complete');
    expect(core).toMatch(/Review or verify the change as appropriate\s+before archiving/);
    expect(core).not.toContain('All tasks complete! You can archive');
  });
});

describe('workflow guidance matches the packaged templates (#1138)', () => {
  // Onboard drafts each artifact in the conversation and then saves what it
  // drafted, so a preview missing the template's title writes an untitled file
  // no matter what the template says.
  it('shows every artifact title in the onboarding walkthrough', () => {
    const titles = outlineTitles();
    const surfaces: Array<[string, string]> = [
      ['onboard skill', getOnboardSkillTemplate().instructions],
      ['outline-spec onboard command', getOutlineSpecOnboardCommandTemplate().content],
    ];

    for (const [surface, text] of surfaces) {
      // Design is optional and onboard only describes it, so it has no inline draft.
      for (const artifactId of ['outline', 'tasks']) {
        expect(text, `${surface} / ${artifactId}`).toContain(`\n${titles[artifactId]}\n`);
      }
    }
  });

});
