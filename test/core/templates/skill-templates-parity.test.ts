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
  getExploreSkillTemplate: '23ae0f56d5d6671c6df3f72243931991f834ba6a46ae43c3cc0738f7a828f278',
  getNewChangeSkillTemplate: '5247c0230cb4ba6d8d5d64ba755a342d423daf8ce5cdabf27a7b79d9ff85e0df',
  getContinueChangeSkillTemplate: '13713675c2dce3e8197beb64d0c57aa7db3f3a10d091846dfb6412c60e3aed90',
  getApplyChangeSkillTemplate: '1f3cf5dfa94aeb0bf4826c099ab9b6e080124c8d0a6a0ae1df26f4c684492b2e',
  getFfChangeSkillTemplate: '854551c9af4abab4277f6ac7672435e96bb13798ad667956b7baefbb06bb17ea',
  getOnboardSkillTemplate: 'b2ec3e5c857d72159d4a07cc4ce4b7f56914dbaf403ea15c68a9d1e75ace2e74',
  getOutlineSpecExploreCommandTemplate: '7c08a082df7703e53b9f4bb489120c53aae737542ddafdd7c492a2a4e5da7ea8',
  getOutlineSpecNewCommandTemplate: '8859250f69439bc49d05a63737301982d449f651cfc0fbf01342aef455357b52',
  getOutlineSpecContinueCommandTemplate: '4d7b9e9f3d3f46215d09bbcf5ad731f0a01e21d2817bfc086fbc6680206c3e7d',
  getOutlineSpecApplyCommandTemplate: '2b379c6ba52ee19d08b6390912e03cf88f34ce62e2baccad0ebdc6119af28581',
  getOutlineSpecFfCommandTemplate: '63739a9d8c561056b88c3f4c17bd0341de9af9be893210fb712ad91d311bd8c6',
  getSyncSpecsSkillTemplate: '59c51eff083380c8dfded52d76945dd3efeea16d415a5bcba37f47909b11b791',
  getOutlineSpecSyncCommandTemplate: '53b7a53e423f723e137f91ca5558d742396d2f16694f5b0c90aee921fbb8e1e5',
  getArchiveChangeSkillTemplate: 'b4fdcdb4ec2dd8082ca2b8aff5b0123466f478c28812bb4fe7b627bc1bb224ab',
  getVerifyChangeSkillTemplate: '77f880700320b500891ae441820d1eed07cb9f6ef5b3fc57be0bd367fd82c8d8',
  getOutlineSpecArchiveCommandTemplate: 'ff76b608fb5abcca51c93dbc2ee4e542ee6a6ad3c9423afc07d94a31b734da85',
  getOutlineSpecOnboardCommandTemplate: 'c2e3a03a0f0653c00c04943fb5538d6b0bef8c321b07ae741d987b1547caf139',
  getOutlineSpecVerifyCommandTemplate: '7aeb9d6d8ee2ec87e4b3d1119bb44d05d869859c739a3835c1d8d633400f8901',
  getOutlineSpecProposeSkillTemplate: '879f33719802b62323411070e927e6a120d17af1213b9e1ee5878c728ddf6804',
  getOutlineSpecProposeCommandTemplate: 'bab9c2ef473a939e7edcbf27331854adc46dd2d020c648bcf27176d55f918dd0',
  getFeedbackSkillTemplate: '84032cbc59ea51005dcf80a20978b4755ea636e6746bcbd1aa0cba06814c36db',
  getUpdateChangeSkillTemplate: '1c19da92489be5f1b09f729aad6332ead835474e365db9f5afca58e63c927a5c',
  getOutlineSpecUpdateCommandTemplate: 'd6440f73ac6121c60a6c8fe87e15dccb4fa04ff5a358a405849b1a169df2dc86',
};

const EXPECTED_GENERATED_SKILL_CONTENT_HASHES: Record<string, string> = {
  'outl-explore': '1d9ef9179499680fcdc4007b240dec1b0213a8815b6d46635960aaa1d4396cc6',
  'outl-new-change': 'b187c6c76568b7de699f7b7bb7023bf18a3fded7f2fae47dc9bc1a92a5e0060b',
  'outl-continue-change': 'a1b1696bb9ba7cd3dec08a13a423b369cc3ba40d26f1be0da7ab2a3c37b522d6',
  'outl-apply-change': 'b2cd2eaab2a322adad9a91d0667705efbca2ef362291bcd46f17a8b6aaf6d1f1',
  'outl-ff-change': '4becdf134892190f2eaf3b20a0f35a10cd106764b9efde5132d50601455bc475',
  'outl-sync-specs': '4abe4bb81e1e3f01f51b16a2c9a6383a13e8d7b50d7c33d6209cd57246cb0d95',
  'outl-archive-change': '8a37c42557ddf630e863d0d36f069af9561fdc0a8df37baca40b5b822167da04',
  'outl-verify-change': 'c9bc1590e7e38bab78b4e275c618e553a1e83358b7afc44f5848bae6f7c7dbac',
  'outl-onboard': 'd8aa8f2485ce12115b96a5519bd075973b4feb0afb29d09a2208bf5ebd8102ac',
  'outl-propose': '042561a06d2844373f51b738058d4ea9c1e75d40f1c1dddb7972df1ec45e8196',
  'outl-update-change': '502a26e1808496806b7a7b29cae6967bbb77f412b6a0dd9db9a195e98ba87843',
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
