import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  type SkillTemplate,
  getApplyInstructions,
  getApplyChangeSkillTemplate,
  getArchiveChangeSkillTemplate,
  getLandChangeSkillTemplate,
  getContinueChangeSkillTemplate,
  getExploreSkillTemplate,
  getFeedbackSkillTemplate,
  getFfChangeSkillTemplate,
  getNewChangeSkillTemplate,
  getOnboardSkillTemplate,
  getOpsxApplyCommandTemplate,
  getOpsxArchiveCommandTemplate,
  getOpsxLandCommandTemplate,
  getOpsxContinueCommandTemplate,
  getOpsxExploreCommandTemplate,
  getOpsxFfCommandTemplate,
  getOpsxNewCommandTemplate,
  getOpsxOnboardCommandTemplate,
  getOpsxProposeCommandTemplate,
  getOpsxProposeSkillTemplate,
  getOpsxUpdateCommandTemplate,
  getOpsxVerifyCommandTemplate,
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
  getExploreSkillTemplate: '219398f4480000fcc634840d5ffaa13bb0799ce9a514608c1d37bdb182c32785',
  getNewChangeSkillTemplate: '3652e991ffc4e0fbcd44e50ed7e71e7978a8ed7dcef65313a98a3302c363a0a9',
  getContinueChangeSkillTemplate: '6e7853fce983dc5af66dbf6d0910e30a156b8b0d415511056e1bb4c4ed658669',
  getApplyChangeSkillTemplate: 'f3803f28c221cf58b098386fabddc5b1960564a3c5c1f1a725d32dbff0871e2e',
  getFfChangeSkillTemplate: 'cdddd5e5daa15ec96e71a2467af0d6ff5b54bbba6b2e24de3418b2a03e09a64f',
  getLandChangeSkillTemplate: 'ca6b9f06d8886e37b2f250ad6b2359902aa7e02cf37eaf2797671e55ea52556b',
  getOnboardSkillTemplate: '19faa012d5fd4f82b2b095344fedac50c7effb9ec9b3849870ad5bb54e1095f5',
  getOpsxExploreCommandTemplate: 'b189e0ca58a1e1290b08e409f754d2038a064b543bd5cf82e6fa90b8b16e2c41',
  getOpsxNewCommandTemplate: '7363ff49266f9a0da111aa193ebdf074b60153f095bd7054f9e867b1ceb5d504',
  getOpsxContinueCommandTemplate: 'b433744bbdf0e5766aba7e2ad5935ab35640c82482d14f47204a58fabcd5e10f',
  getOpsxApplyCommandTemplate: '8de0cf950053f9526956f217ffc0d9b7cb5e048442aab5876884405560fa8312',
  getOpsxFfCommandTemplate: '223e0d834d875d6f0ca81986d7421b7b7cbc348a76d0d43d81d48eaa0a20728b',
  getArchiveChangeSkillTemplate: '414b56319705db8e7197c447f5125a1adc9fa275cffd3cf97022f293810adea6',
  getOpsxLandCommandTemplate: '440ef5b3e9b975fc34fe99eb83fa945488210850d2064a3d9f141fa7adbbbf73',
  getVerifyChangeSkillTemplate: 'a0a39340342af21b157b810a75775ce63384d32a4c8dba54c084df0a5f9617e9',
  getOpsxArchiveCommandTemplate: '69c1ec34f944709883114c8f2d9d334ef3a76cd470f29d8e3f082f58faa56524',
  getOpsxOnboardCommandTemplate: 'ef31de5d00989b8d0125d3205e85a2469b2a0bb4400c1bb86849bbbc5a9d5d58',
  getOpsxVerifyCommandTemplate: '3041e1976d3f97b39d33a70ae1c0ff08f4bc040687086771992e78c71ff7e8d4',
  getOpsxProposeSkillTemplate: 'e07c3e4c3ac53a6d1d8f3b9ba14249faf2c5a3a3e573d7648042762b1fdab618',
  getOpsxProposeCommandTemplate: 'af2ac564d757783c839a5c309b7800e5be0225ac214e5776940ad0db5d7a8eab',
  getFeedbackSkillTemplate: '690a0c9d57225b1d431fb1e635895752cb5cf0de91c9711dadafa163868d3142',
  getUpdateChangeSkillTemplate: 'e94cc8de40ce9a7dca390032b6a25fd826a49cf32f1ceb4acbd771bdac4a5a69',
  getOpsxUpdateCommandTemplate: '46d6d9b20b4ba5c3e01a1989bc5cee46d1ef8a8afa2ef26e9b5df2fd5c0e9a43',
};

const EXPECTED_GENERATED_SKILL_CONTENT_HASHES: Record<string, string> = {
  'openspec-explore': '7d30d2b6811766f44a06d434a58c18d847dcaaf39e1736c09ac25dea160547b1',
  'openspec-new-change': '64ea88fa6fa6b52426e8349fad338aa1c9e614c92f0d98a9e222ab752e7866c1',
  'openspec-continue-change': 'c6ecc8e5004c19a3075707cb1beb4bf3a8e0ca4029b785d2bd3b04bf81a4b5ad',
  'openspec-apply-change': '9a8a36a79a5c813f181cb79883b32e171b6911cc6e11cb63794ef294ecdffbed',
  'openspec-ff-change': '4db59b61e321fe42dd4211ebde322ee6c5c61db81ec5867ab60c43410d55630e',
  'openspec-land-change': 'c77a15d132c14eda97b7c14da51e07e9fcac97ea3aaab545cd7ba9643f3b6cde',
  'openspec-archive-change': '2a9299790f92b933fcfd922f8c791f05ac385d50f03e87487a4bd77aa462c587',
  'openspec-verify-change': '0ecdec4ceb7e1d0bfb1682a225181e328897a4038a4b0183b8b8fc19435191a7',
  'openspec-onboard': '3fd572147865c5648ce24477a21fe07c844b54408f6a4bb2fbbdfbab15050130',
  'openspec-propose': '75c3ed5bb1e3aafdfb3db1fa7d656d7c22d7958887fa4a35437229c8ef130a7d',
  'openspec-update-change': '5fd999c0fa78427a43afb2a0e9aedac90f89661ef99f2a6d1530b17e1a7512b8',
};

// Intentionally excludes getFeedbackSkillTemplate: this list only models templates
// deployed via generateSkillContent, while feedback is covered in function payload parity.
const GENERATED_SKILL_FACTORIES: Array<[string, () => SkillTemplate]> = [
  ['openspec-explore', getExploreSkillTemplate],
  ['openspec-new-change', getNewChangeSkillTemplate],
  ['openspec-continue-change', getContinueChangeSkillTemplate],
  ['openspec-apply-change', getApplyChangeSkillTemplate],
  ['openspec-ff-change', getFfChangeSkillTemplate],
  ['openspec-land-change', getLandChangeSkillTemplate],
  ['openspec-archive-change', getArchiveChangeSkillTemplate],
  ['openspec-verify-change', getVerifyChangeSkillTemplate],
  ['openspec-onboard', getOnboardSkillTemplate],
  ['openspec-propose', getOpsxProposeSkillTemplate],
  ['openspec-update-change', getUpdateChangeSkillTemplate],
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
      ['ff command', getOpsxFfCommandTemplate().content],
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
      ['onboard command', getOpsxOnboardCommandTemplate().content],
    ];

    for (const [variant, content] of variants) {
      expect(content, variant).toContain('Does this task breakdown look right?');
      expect(content, variant).not.toContain(
        'Each checkbox becomes a unit of work in the apply phase. Ready to implement?'
      );
      expect(content, variant).toContain(
        '**PAUSE** - Wait for user approval/feedback.\n\n' +
        'After approval, save to the `resolvedOutputPath` from `openspec instructions tasks --change "<name>" --json`.'
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
      getLandChangeSkillTemplate,
      getOnboardSkillTemplate,
      getOpsxExploreCommandTemplate,
      getOpsxNewCommandTemplate,
      getOpsxContinueCommandTemplate,
      getOpsxApplyCommandTemplate,
      getOpsxFfCommandTemplate,
      getArchiveChangeSkillTemplate,
      getVerifyChangeSkillTemplate,
      getOpsxArchiveCommandTemplate,
      getOpsxOnboardCommandTemplate,
      getOpsxLandCommandTemplate,
      getOpsxVerifyCommandTemplate,
      getOpsxProposeSkillTemplate,
      getOpsxProposeCommandTemplate,
      getFeedbackSkillTemplate,
      getUpdateChangeSkillTemplate,
      getOpsxUpdateCommandTemplate,
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

  // Auto-approve the OpenSpec CLI: every generated skill carries
  // `allowed-tools: Bash(openspec:*)` so agents that honor it stop prompting
  // on each `openspec` call. Iterating the registry covers new skills too.
  it('pre-approves the openspec CLI via allowed-tools in every deployed skill', () => {
    for (const { template, dirName } of getSkillTemplates()) {
      const content = generateSkillContent(template, 'PARITY-BASELINE');
      expect(content, dirName).toContain('allowed-tools: Bash(openspec:*)');
    }
  });

  it('teaches store selection in every deployed opsx command template', () => {
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
      'openspec status --change "<name>" --json --store "<id>"'
    );
    expect(STORE_SELECTION_GUIDANCE).toContain('`context`, `schemas`, `view`');
  });

  it('keeps onboarding task examples aligned with concrete verification guidance (#345)', () => {
    const variants: Array<[string, string]> = [
      ['onboard skill', generateSkillContent(asDeployed(getOnboardSkillTemplate()), 'PARITY-BASELINE')],
      ['onboard command', getOpsxOnboardCommandTemplate().content],
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
            ) || / Verify .+ with \[.+\]$/.test(line) || line.includes('`openspec land <name>`')
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
      ['onboard command', getOpsxOnboardCommandTemplate().content],
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
      ['openspec-apply-change', getApplyChangeSkillTemplate],
      ['openspec-land-change', getLandChangeSkillTemplate],
      ['openspec-archive-change', getArchiveChangeSkillTemplate],
          ['openspec-verify-change', getVerifyChangeSkillTemplate],
    ];

    for (const [dirName, createTemplate] of allSkills) {
      const content = generateSkillContent(asDeployed(createTemplate()), 'PARITY-BASELINE');
      expect(content, dirName).not.toContain('workspace-planning');
      expect(content, dirName).not.toContain('Workspace guard');
    }
  });

  it('does not suggest landing when only planning is complete', () => {
    const variants: Array<[string, string]> = [
      [
        'skill',
        generateSkillContent(asDeployed(getContinueChangeSkillTemplate()), 'PARITY-BASELINE'),
      ],
      ['opsx command', getOpsxContinueCommandTemplate().content],
    ];

    for (const [variant, content] of variants) {
      expect(content, variant).toContain('Planning is complete!');
      expect(content, variant).toContain(
        'Once implementation and any tracked work are complete, land it'
      );
      expect(content, variant).not.toContain('All artifacts created!');
      expect(content, variant).not.toContain('or land it');
    }
  });

  it('requires apply context while keeping guidance advisory and state separate', () => {
    const variants: Array<[string, string]> = [
      ['apply skill', getApplyChangeSkillTemplate().instructions],
      ['apply command', getOpsxApplyCommandTemplate().content],
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

  it('teaches the outline model, not deltas, scenarios, or sync, in every generated workflow', () => {
    const corpus: Array<[string, string]> = [
      ...getSkillTemplates().map(({ dirName, template }) => [dirName, template.instructions] as [string, string]),
      ...getCommandContents().map((entry) => [entry.id, entry.body] as [string, string]),
    ];
    const stale =
      /delta spec|\b(ADDED|MODIFIED|REMOVED|RENAMED) Requirements|#### Scenario|\bSHALL\b|\/opsx:sync|openspec-sync-specs|bulk-archive|skip_specs|retire_capabilities|changes\/archive|spec-driven/;
    for (const [id, text] of corpus) {
      expect(text, id).not.toMatch(stale);
    }
  });

  it('generates land and archive skills that both run openspec land', () => {
    const byDir = new Map(getSkillTemplates().map(({ dirName, template }) => [dirName, template.instructions]));
    const byId = new Map(getCommandContents().map((entry) => [entry.id, entry.body]));
    for (const text of [byDir.get('openspec-land-change'), byDir.get('openspec-archive-change'), byId.get('land'), byId.get('archive')]) {
      expect(text).toContain('openspec land "<name>" --yes');
    }
  });

  it('validates, dry-runs, then lands, and fixes outline.md on a mismatch', () => {
    const variants: Array<[string, string]> = [
      ['land skill', getLandChangeSkillTemplate().instructions],
      ['land command', getOpsxLandCommandTemplate().content],
      ['archive skill', getArchiveChangeSkillTemplate().instructions],
      ['archive command', getOpsxArchiveCommandTemplate().content],
    ];

    for (const [variant, content] of variants) {
      const validate = content.indexOf('openspec validate "<name>"');
      const dryRun = content.indexOf('openspec land "<name>" --dry-run');
      const land = content.indexOf('openspec land "<name>" --yes');
      expect(validate, variant).toBeGreaterThanOrEqual(0);
      expect(dryRun, variant).toBeGreaterThan(validate);
      expect(land, variant).toBeGreaterThan(dryRun);
      // The advisory lookup must degrade instead of blocking a land.
      expect(content, variant).toContain('openspec instructions land --change "<name>" --json');
      expect(content, variant).toContain('it never blocks landing');
      expect(content, variant).toContain('Update outline.md so it strikes the live text exactly');
      expect(content, variant).toContain('Never hand-edit the live specs');
      expect(content, variant).not.toMatch(/delta|scenario/i);
    }
  });

  // Guidance that tells an agent to run `openspec archive` has to pass
  // --yes: the agent cannot answer the confirmation prompts from a tool
  // call, so the bare command aborts (#1479). A golden hash proves the
  // generated file matches its source, never that the source is right, so
  // pin the flag itself.
  it('passes --yes or --dry-run wherever it tells an agent to run openspec land (#1479)', () => {
    // Sweep the whole corpus, not just the one template that has such an
    // invocation today: the point is to catch the next one.
    const corpus: Array<[string, string]> = [
      ...getSkillTemplates().map(
        ({ dirName, template }) => [dirName, template.instructions] as [string, string]
      ),
      ...getCommandContents().map((entry) => [entry.id, entry.body] as [string, string]),
    ];

    // Only runnable invocations count: prose that merely names the command
    // ("same rule as `openspec archive`") has nothing to confirm, and it is
    // always mid-sentence, so requiring the command to open the line
    // separates the two. Everything a runnable line may legitimately carry in
    // front of the command is allowed, because each of these hid an
    // invocation from an earlier, stricter version of this check: indentation,
    // a list marker, a shell prompt, and a global flag between `openspec` and
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
        if (tokens[0] !== 'openspec') return false;
        const archiveAt = tokens.indexOf('land');
        if (archiveAt < 1) return false;
        // Anything between `openspec` and `archive` has to be a global flag or
        // one's value, or this is a different subcommand that merely mentions
        // the word (`openspec list archive`).
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
      ['propose skill', generateSkillContent(asDeployed(getOpsxProposeSkillTemplate()), 'PARITY-BASELINE')],
      ['propose command', getOpsxProposeCommandTemplate().content],
      ['continue skill', generateSkillContent(asDeployed(getContinueChangeSkillTemplate()), 'PARITY-BASELINE')],
      ['continue command', getOpsxContinueCommandTemplate().content],
      ['ff skill', generateSkillContent(asDeployed(getFfChangeSkillTemplate()), 'PARITY-BASELINE')],
      ['ff command', getOpsxFfCommandTemplate().content],
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
  // the canonical `/opsx:<id>` tokens per surface downstream (asserted in
  // test/utils/command-references.test.ts). The instruction text itself is
  // shared, so this pins the contract: both surfaces render the one canonical
  // core and cannot silently drift apart at the template level.
  it('renders both apply surfaces from the shared instruction core', () => {
    const core = getApplyInstructions();
    expect(getApplyChangeSkillTemplate().instructions).toBe(core);
    expect(getOpsxApplyCommandTemplate().content).toBe(core);
  });

  it('keeps task completion distinct from land readiness (#1790)', () => {
    const core = getApplyInstructions();
    expect(core).toContain('All tracked tasks are complete');
    expect(core).toMatch(/Review or verify the change as appropriate\s+before landing/);
    expect(core).not.toContain('All tasks complete! You can land');
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
      ['opsx onboard command', getOpsxOnboardCommandTemplate().content],
    ];

    for (const [surface, text] of surfaces) {
      // Design is optional and onboard only describes it, so it has no inline draft.
      for (const artifactId of ['outline', 'tasks']) {
        expect(text, `${surface} / ${artifactId}`).toContain(`\n${titles[artifactId]}\n`);
      }
    }
  });

});
