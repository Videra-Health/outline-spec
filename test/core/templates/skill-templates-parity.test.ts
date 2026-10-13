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
  getOutlineSpecApplyCommandTemplate,
  getOutlineSpecArchiveCommandTemplate,
  getOutlineSpecContinueCommandTemplate,
  getOutlineSpecExploreCommandTemplate,
  getOutlineSpecFfCommandTemplate,
  getOutlineSpecNewCommandTemplate,
  getOutlineSpecOnboardCommandTemplate,
  getOutlineSpecProposeCommandTemplate,
  getOutlineSpecProposeSkillTemplate,
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
  getExploreSkillTemplate: 'f9696e2e2107829e30bf45a04044de729ab52008330b86f2d3b0e469fe163ddc',
  getNewChangeSkillTemplate: '070802e152e69c8ff0129cb40856c7b5649c13a1dcad0d96f36dfd792577c4d1',
  getContinueChangeSkillTemplate: '5df176f125c0c9c1e5bb8c6f18f0740b9984a427a98e50b4633b3323b6b97325',
  getApplyChangeSkillTemplate: '9b0e1b801af0742725a24f5cbc57b8686899d1ec8e93197b8ddfaffea2a5df88',
  getFfChangeSkillTemplate: '5c88191a0147be9b41b5b28a96173982ae4cb432e76fb1eb3a7130e409870783',
  getOnboardSkillTemplate: '0514b7dbd29729aff42d22dd721dc957e93affe490afc43de6b68ed620056008',
  getOutlineSpecExploreCommandTemplate: '0bbccd71d402f97d8e01dae1c8f48198d0d8793648f6caf9630d3e133fc57f2a',
  getOutlineSpecNewCommandTemplate: 'c2c8406e0feb2ba0f74c80a85d55402480d1904a2a9ea114cb121cdb99534843',
  getOutlineSpecContinueCommandTemplate: 'f5f090dc5af976a91d2c2c793cfbea9c46d0a434e1de5eda91efb401b9de84f2',
  getOutlineSpecApplyCommandTemplate: '8c105ae8263699b75f512c12a70596b054c07e45f4a98cd9fea850a73c4562d1',
  getOutlineSpecFfCommandTemplate: '09fcb8c053ea76b21f470bbd1f5e02000d5eaf77e7e4df9ff44372c5fc710bc3',
  getArchiveChangeSkillTemplate: 'ea61fb25e5efdeb946ec64206fc982c2f979aff3d219712024b2d50fc6a607f8',
  getVerifyChangeSkillTemplate: '073d2a777c5c82e711dc678884c75eeab3b23fed337392054f3567d155f3ebcc',
  getOutlineSpecArchiveCommandTemplate: 'fe6b4b948e5a3f42a0468c3d4be67b2d017124ee65b3e685a05ad93885462653',
  getOutlineSpecOnboardCommandTemplate: '4553d6f2570ca7824a5b823988cba9ad74ac2a70cfb5448b1aeb3c14fcb16160',
  getOutlineSpecVerifyCommandTemplate: '37b1fbf93ebbb0ed2b7a6e645e00f4c2419eb4066aab1c105a8ef1de3c7acd9f',
  getOutlineSpecProposeSkillTemplate: '624c600faea79ec3adebe1e5e85fabc4ed270c589d8725b536d1d4bca631c377',
  getOutlineSpecProposeCommandTemplate: 'e586e18473cf97f36404d127e9c7e3df8bd52a151350a127504c867f66b4c23a',
  getFeedbackSkillTemplate: '84032cbc59ea51005dcf80a20978b4755ea636e6746bcbd1aa0cba06814c36db',
  getUpdateChangeSkillTemplate: '886638e8827015eba62f4c7d5e3a8d221405ee0bb083ba3a6ecf099da8157675',
  getOutlineSpecUpdateCommandTemplate: 'a483acbebc98190f61f19d056f6874b4c8285c3735b5ef849c7c6bf20402fad7',
};

const EXPECTED_GENERATED_SKILL_CONTENT_HASHES: Record<string, string> = {
  'outline-spec-explore': 'ff199bd58c2f5c07738ba0db9bbaf210801c5253e08c7bf5b703888d59b3c423',
  'outline-spec-new-change': '8a837a8c602c6a7fd61cea41a062ee3fb39d8c3263bed3c2f642cbb3f4d0a373',
  'outline-spec-continue-change': '22b031edafb2c84d603e533f1df0227b6e2943c9cbff53d369f28a221fb4cafd',
  'outline-spec-apply-change': '15fd42c3c8394d124fdcb3b6a0a25c527d2d01632b414b4167b4fab14f69334f',
  'outline-spec-ff-change': '5bc2908ec3c0dd1de3ececa39dce223f50ade095d1b9988cec2466eeaae4cfa5',
  'outline-spec-archive-change': '8bdbe7012359cec61eb63eb938a1582ed2464aec4e30f952aedf4ee63794b15b',
  'outline-spec-verify-change': '9869cd762cc67bf4e69569d18ecd4c41de5220bff942c7b1c32cf5739774cb79',
  'outline-spec-onboard': '9717ab081d352ba8426d362e8c6d8384d638d434fa7012763a82495ab6ea2a54',
  'outline-spec-propose': '70b579a61f934b33b1943eada44568729992f6494cf0e21f22fef3eb402cac6c',
  'outline-spec-update-change': '63da7bcfd5bf761be56e483403c778c3e101dfe10f892728a11a40aaa16b05ad',
};

// Intentionally excludes getFeedbackSkillTemplate: this list only models templates
// deployed via generateSkillContent, while feedback is covered in function payload parity.
const GENERATED_SKILL_FACTORIES: Array<[string, () => SkillTemplate]> = [
  ['outline-spec-explore', getExploreSkillTemplate],
  ['outline-spec-new-change', getNewChangeSkillTemplate],
  ['outline-spec-continue-change', getContinueChangeSkillTemplate],
  ['outline-spec-apply-change', getApplyChangeSkillTemplate],
  ['outline-spec-ff-change', getFfChangeSkillTemplate],
  ['outline-spec-archive-change', getArchiveChangeSkillTemplate],
  ['outline-spec-verify-change', getVerifyChangeSkillTemplate],
  ['outline-spec-onboard', getOnboardSkillTemplate],
  ['outline-spec-propose', getOutlineSpecProposeSkillTemplate],
  ['outline-spec-update-change', getUpdateChangeSkillTemplate],
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
      ['outline-spec-apply-change', getApplyChangeSkillTemplate],
      ['outline-spec-archive-change', getArchiveChangeSkillTemplate],
          ['outline-spec-verify-change', getVerifyChangeSkillTemplate],
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

  it('teaches the outline model, not deltas, scenarios, or sync, in every generated workflow', () => {
    const corpus: Array<[string, string]> = [
      ...getSkillTemplates().map(({ dirName, template }) => [dirName, template.instructions] as [string, string]),
      ...getCommandContents().map((entry) => [entry.id, entry.body] as [string, string]),
    ];
    const stale =
      /delta spec|\b(ADDED|MODIFIED|REMOVED|RENAMED) Requirements|#### Scenario|\bSHALL\b|\/outline-spec:sync|outline-spec-sync-specs|bulk-archive|skip_specs|retire_capabilities|changes\/archive|spec-driven/;
    for (const [id, text] of corpus) {
      expect(text, id).not.toMatch(stale);
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
  // the canonical `/outline-spec:<id>` tokens per surface downstream (asserted in
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
