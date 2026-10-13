import { describe, it, expect } from 'vitest';
import {
  getSkillReferenceTransformer,
  getTransformerForTool,
  transformCommandInvocations,
  transformToSkillReferences,
} from '../../src/utils/command-references.js';
import type { CommandInvocation } from '../../src/core/command-generation/invocation.js';
import { getApplyChangeSkillTemplate } from '../../src/core/templates/workflows/apply-change.js';
import { resolveOptionalWorkflows } from '../../src/core/templates/optional-workflow.js';
import { ALL_WORKFLOWS } from '../../src/core/profiles.js';

const FLAT_SLASH: CommandInvocation = { style: 'flat', prefix: '/' };
const FLAT_AT: CommandInvocation = { style: 'flat', prefix: '@' };
const NAMESPACED_SLASH: CommandInvocation = { style: 'namespaced', prefix: '/' };

/** The `/outl-<id>` case, which most flat tools use. */
const transformToHyphenCommands = (text: string): string =>
  transformCommandInvocations(text, FLAT_SLASH);

describe('transformCommandInvocations', () => {
  describe('basic transformations', () => {
    it('should transform single command reference', () => {
      expect(transformToHyphenCommands('/outl:new')).toBe('/outl-new');
    });

    it('should transform multiple command references', () => {
      const input = '/outl:new and /outl:apply';
      const expected = '/outl-new and /outl-apply';
      expect(transformToHyphenCommands(input)).toBe(expected);
    });

    it('should transform command reference in context', () => {
      const input = 'Use /outl:apply to implement tasks';
      const expected = 'Use /outl-apply to implement tasks';
      expect(transformToHyphenCommands(input)).toBe(expected);
    });

    it('should handle backtick-quoted commands', () => {
      const input = 'Run `/outl:continue` to proceed';
      const expected = 'Run `/outl-continue` to proceed';
      expect(transformToHyphenCommands(input)).toBe(expected);
    });
  });

  describe('edge cases', () => {
    it('should return unchanged text with no command references', () => {
      const input = 'This is plain text without commands';
      expect(transformToHyphenCommands(input)).toBe(input);
    });

    it('should return empty string unchanged', () => {
      expect(transformToHyphenCommands('')).toBe('');
    });

    it('should not transform similar but non-matching patterns', () => {
      const input = '/ops:new outline-spec: /other:command';
      expect(transformToHyphenCommands(input)).toBe(input);
    });

    it('should handle multiple occurrences on same line', () => {
      const input = '/outl:new /outl:continue /outl:apply';
      const expected = '/outl-new /outl-continue /outl-apply';
      expect(transformToHyphenCommands(input)).toBe(expected);
    });

    it('should leave unknown command references unchanged', () => {
      // Mirrors transformToSkillReferences: an invented id is left as written
      // rather than reshaped into a command that does not exist either.
      const input = 'Try /outl:unknown-command here';
      expect(transformToHyphenCommands(input)).toBe(input);
    });

    it('should rewrite only the known id on a mixed line', () => {
      expect(transformToHyphenCommands('/outl:apply and /outl:bogus')).toBe(
        '/outl-apply and /outl:bogus'
      );
    });
  });

  describe('multiline content', () => {
    it('should transform references across multiple lines', () => {
      const input = `Use /outl:new to start
Then /outl:continue to proceed
Finally /outl:apply to implement`;
      const expected = `Use /outl-new to start
Then /outl-continue to proceed
Finally /outl-apply to implement`;
      expect(transformToHyphenCommands(input)).toBe(expected);
    });
  });

  describe('all known commands', () => {
    const commands = [
      'new',
      'continue',
      'apply',
      'update',
      'ff',
      'archive',
      'verify',
      'explore',
      'onboard',
    ];

    for (const cmd of commands) {
      it(`should transform /outl:${cmd}`, () => {
        expect(transformToHyphenCommands(`/outl:${cmd}`)).toBe(`/outl-${cmd}`);
      });
    }
  });

  describe('non-slash prefixes', () => {
    it("spells Amazon Q's prompt library form, replacing the slash", () => {
      // The whole `/outl:` is consumed, so no stray slash survives: it is
      // `@outl-apply`, never `/@outl-apply` or `@/outl-apply`.
      expect(transformCommandInvocations('/outl:apply', FLAT_AT)).toBe('@outl-apply');
      expect(transformCommandInvocations('Run `/outl:archive` when done.', FLAT_AT)).toBe(
        'Run `@outl-archive` when done.'
      );
    });

    it('leaves unknown ids alone under a non-slash prefix too', () => {
      expect(transformCommandInvocations('/outl:apply and /outl:bogus', FLAT_AT)).toBe(
        '@outl-apply and /outl:bogus'
      );
    });

    it('is a no-op for the canonical namespaced slash form', () => {
      const input = 'Use /outl:new then /outl:apply';
      expect(transformCommandInvocations(input, NAMESPACED_SLASH)).toBe(input);
    });
  });
});

describe('transformToSkillReferences', () => {
  describe('all known commands', () => {
    const mappings: Array<[string, string]> = [
      ['explore', '/outl-explore'],
      ['new', '/outl-new-change'],
      ['continue', '/outl-continue-change'],
      ['apply', '/outl-apply-change'],
      ['update', '/outl-update-change'],
      ['ff', '/outl-ff-change'],
      ['archive', '/outl-archive-change'],
      ['archive', '/outl-archive-change'],
      ['verify', '/outl-verify-change'],
      ['onboard', '/outl-onboard'],
      ['propose', '/outl-propose'],
    ];

    for (const [cmd, skillRef] of mappings) {
      it(`should transform /outl:${cmd} to ${skillRef}`, () => {
        expect(transformToSkillReferences(`/outl:${cmd}`)).toBe(skillRef);
      });
    }
  });

  describe('basic transformations', () => {
    it('should transform command reference in context', () => {
      const input = 'Use /outl:apply to implement tasks';
      const expected = 'Use /outl-apply-change to implement tasks';
      expect(transformToSkillReferences(input)).toBe(expected);
    });

    it('should transform multiple command references', () => {
      const input = 'Run /outl:apply then /outl:archive';
      const expected = 'Run /outl-apply-change then /outl-archive-change';
      expect(transformToSkillReferences(input)).toBe(expected);
    });

    it('should handle backtick-quoted commands', () => {
      const input = 'Run `/outl:continue` to proceed';
      const expected = 'Run `/outl-continue-change` to proceed';
      expect(transformToSkillReferences(input)).toBe(expected);
    });

    it('should transform references across multiple lines', () => {
      const input = `Use /outl:new to start
Then /outl:apply to implement`;
      const expected = `Use /outl-new-change to start
Then /outl-apply-change to implement`;
      expect(transformToSkillReferences(input)).toBe(expected);
    });
  });

  describe('edge cases', () => {
    it('should return unchanged text with no command references', () => {
      const input = 'This is plain text without commands';
      expect(transformToSkillReferences(input)).toBe(input);
    });

    it('should return empty string unchanged', () => {
      expect(transformToSkillReferences('')).toBe('');
    });

    it('should leave unknown command references unchanged', () => {
      const input = 'Try /outl:unknown-command here';
      expect(transformToSkillReferences(input)).toBe(input);
    });

    it('should not transform similar but non-matching patterns', () => {
      const input = '/ops:new outline-spec: /other:command';
      expect(transformToSkillReferences(input)).toBe(input);
    });

    it('should leave retired commands untransformed', () => {
      const input = '/outl:bulk-archive and /outl:archive';
      const expected = '/outl:bulk-archive and /outl-archive-change';
      expect(transformToSkillReferences(input)).toBe(expected);
    });
  });
});

describe('getSkillReferenceTransformer', () => {
  it('uses the default /<name> form for tools without a custom prefix', () => {
    expect(getSkillReferenceTransformer('vibe')).toBe(transformToSkillReferences);
    expect(getSkillReferenceTransformer('hermes')('/outl:apply')).toBe('/outl-apply-change');
    // dsh supports the user-facing /<name> gesture, so it keeps the default.
    expect(getSkillReferenceTransformer('dsh')('/outl:apply')).toBe('/outl-apply-change');
  });

  it('uses /skill:<name> for Kimi Code, per its documented invocation syntax', () => {
    const transformer = getSkillReferenceTransformer('kimi');
    expect(transformer('/outl:propose')).toBe('/skill:outl-propose');
    expect(transformer('Run `/outl:apply` then /outl:archive')).toBe(
      'Run `/skill:outl-apply-change` then /skill:outl-archive-change'
    );
    expect(transformer('/outl:unknown-command')).toBe('/outl:unknown-command');
  });

  it('uses $<name> for direct Codex invocation hints', () => {
    const transformer = getSkillReferenceTransformer('codex');
    expect(transformer('/outl:propose')).toBe('$outl-propose');
    expect(transformer('/outl:unknown-command')).toBe('/outl:unknown-command');
  });

  it.each(['gsd', 'rovodev', 'codeassistant'])('uses natural-language skill references for %s', (toolId) => {
    const transformer = getSkillReferenceTransformer(toolId);
    expect(transformer('/outl:propose')).toBe('the outl-propose skill');
    expect(transformer('Run `/outl:apply` then /outl:archive')).toBe(
      'Run `the outl-apply-change skill` then the outl-archive-change skill'
    );
    // No `/outl-*` or other slash-command form is ever emitted.
    expect(transformer('/outl:propose')).not.toMatch(/\/outl-/);
    expect(transformer('/outl:unknown-command')).toBe('/outl:unknown-command');
  });
});

describe('getTransformerForTool', () => {
  it('selects skill references for skills-only delivery for every tool', () => {
    expect(getTransformerForTool('claude', 'skills', 'adapter-backed', NAMESPACED_SLASH)).toBe(
      transformToSkillReferences
    );
    // hyphen-command tools must not fall back to hyphen commands when no commands are generated
    expect(getTransformerForTool('opencode', 'skills', 'adapter-backed', FLAT_SLASH)).toBe(transformToSkillReferences);
    expect(getTransformerForTool('pi', 'skills', 'adapter-backed', FLAT_SLASH)).toBe(transformToSkillReferences);
    expect(getTransformerForTool('oh-my-pi', 'skills', 'adapter-backed', FLAT_SLASH)).toBe(transformToSkillReferences);
  });

  it('selects skill references for tools without a command surface, regardless of delivery', () => {
    // Tools like Kimi Code or Mistral Vibe have no command adapter, so their
    // skills must never reference /outl:* commands that were not generated.
    expect(getTransformerForTool('vibe', 'both', 'none', undefined)).toBe(transformToSkillReferences);
    expect(getTransformerForTool('hermes', 'both', 'none', undefined)).toBe(transformToSkillReferences);
    // Kimi Code documents /skill:<name> invocations (docs/skills.md)
    for (const delivery of ['both', 'commands', 'skills'] as const) {
      const transformer = getTransformerForTool('kimi', delivery, 'none', undefined);
      expect(transformer?.('/outl:propose')).toBe('/skill:outl-propose');
    }
  });

  it('selects hyphen commands for every flat-invocation tool when commands are generated', () => {
    // These tools invoke commands by filename (/outl-<id>), so skills must
    // reference the hyphen form their command files actually answer to.
    for (const toolId of ['bob', 'cursor', 'github-copilot', 'oh-my-pi', 'opencode', 'pi', 'qwen'] as const) {
      for (const delivery of ['both', 'commands'] as const) {
        const transformer = getTransformerForTool(toolId, delivery, 'adapter-backed', FLAT_SLASH);
        expect(transformer?.('/outl:apply'), `${toolId} ${delivery}`).toBe('/outl-apply');
      }
      // ...but must not fall back to hyphen commands when no commands are generated
      expect(getTransformerForTool(toolId, 'skills', 'adapter-backed', FLAT_SLASH)).toBe(transformToSkillReferences);
    }
  });

  it('selects skill references for devin whenever skills are generated', () => {
    // The Devin Local agent has no workflows, so Devin skill bodies and the
    // getting-started hint must name `/outl-*` skills, which both Devin
    // agents accept. Workflow bodies get the hyphen form from the generator,
    // like every other flat-invocation tool.
    expect(getTransformerForTool('devin', 'both', 'adapter-backed', FLAT_SLASH)).toBe(
      transformToSkillReferences
    );
    expect(getTransformerForTool('devin', 'skills', 'adapter-backed', FLAT_SLASH)).toBe(
      transformToSkillReferences
    );
    // Under commands-only delivery no Devin skills exist to point at, so the
    // hint falls back to the workflow name Devin registers.
    const commandsOnly = getTransformerForTool('devin', 'commands', 'adapter-backed', FLAT_SLASH);
    expect(commandsOnly?.('/outl:propose')).toBe('/outl-propose');
  });

  it("selects Amazon Q's @-prefixed prompt form when commands are generated", () => {
    // Amazon Q loads .amazonq/prompts/outl-<id>.md into its prompt library,
    // which is invoked with @ — it registers no slash command at all.
    for (const delivery of ['both', 'commands'] as const) {
      const transformer = getTransformerForTool('amazon-q', delivery, 'adapter-backed', FLAT_AT);
      expect(transformer?.('/outl:apply'), delivery).toBe('@outl-apply');
      expect(transformer?.('Run /outl:archive next'), delivery).toBe('Run @outl-archive next');
    }
    // Skills-only delivery generates no prompt files, so point at the skill.
    expect(getTransformerForTool('amazon-q', 'skills', 'adapter-backed', FLAT_AT)).toBe(
      transformToSkillReferences
    );
  });

  it('selects no transformer for namespaced tools when commands are generated', () => {
    expect(getTransformerForTool('claude', 'both', 'adapter-backed', NAMESPACED_SLASH)).toBeUndefined();
    expect(getTransformerForTool('claude', 'commands', 'adapter-backed', NAMESPACED_SLASH)).toBeUndefined();
  });

  it('selects shared-tree-safe Codex skill references in every delivery mode', () => {
    // Codex needs $<name>, while generic consumers of the same canonical
    // .agents tree need /<name>. Keep both explicit so neither target breaks.
    for (const delivery of ['both', 'commands', 'skills'] as const) {
      const transformer = getTransformerForTool('codex', delivery, 'skills-invocable', undefined);
      expect(transformer?.('/outl:propose')).toBe(
        '$outl-propose (Codex) or /outl-propose (other agents)'
      );
      expect(transformer?.('Run /outl:apply next')).toBe(
        'Run $outl-apply-change (Codex) or /outl-apply-change (other agents) next'
      );
    }
  });
});

// Regression for #1153/#1514: the apply skill template must author its
// continue/apply/archive references as canonical /outl:* tokens so the
// generator can rewrite them per target. Bare "outl-continue-change"
// prose is invisible to the transformers, which left skills.sh, Codex, and
// Kimi with dead text and no archive/input invocation after a naive revert.
describe('apply skill template generates valid per-target invocations', () => {
  const skill = getApplyChangeSkillTemplate().instructions;

  it('authors invocation references as transformable /outl:* tokens', () => {
    expect(skill).toContain('/outl:apply add-auth');
    expect(skill).toContain('suggest using `/outl:continue`');
    expect(skill).toContain('archive this change with `/outl:archive`');
    // No bare, non-transformable skill-name prose remains.
    expect(skill).not.toContain('suggest using outl-continue-change');
  });

  // The blocked-state answer for an installation without `continue` (#1734).
  // The conditional's fallback has to stand on its own: the agent gets no
  // workflow to hand off to, so it needs the whole CLI recovery, not a
  // shortened version of the installed branch.
  it('gives the full CLI recovery when continue is not installed', () => {
    const withoutContinue = resolveOptionalWorkflows(
      skill,
      new Set(ALL_WORKFLOWS.filter((id) => id !== 'continue'))
    );
    const blocked = withoutContinue.slice(
      withoutContinue.indexOf('If `state: "blocked"`'),
      withoutContinue.indexOf('If `state: "all_done"`')
    );

    expect(blocked).not.toContain('/outl:continue');
    expect(blocked).toContain('pause implementation');
    expect(blocked).toContain('If `missingArtifacts` is non-empty');
    expect(blocked).toContain('outline-spec status --change "<name>" --json');
    expect(blocked).toContain('next `ready` artifact (not `skipped` or `blocked`)');
    expect(blocked).toContain('outline-spec instructions "<artifact-id>" --change "<name>" --json');
    expect(blocked).toContain('Keep the selected `--store <id>` on both commands');
    expect(blocked).toContain(
      'Otherwise, follow the CLI instruction to create or repair the schema-configured tracking file'
    );
    expect(blocked).toContain(
      'Do not assume another artifact is ready or start implementation while blocked'
    );
  });

  const cases = [
    { tool: 'default (skills.sh)', transform: transformToSkillReferences, cont: '/outl-continue-change', arch: '/outl-archive-change', apply: '/outl-apply-change' },
    { tool: 'codex', transform: getSkillReferenceTransformer('codex'), cont: '$outl-continue-change', arch: '$outl-archive-change', apply: '$outl-apply-change' },
    { tool: 'kimi', transform: getSkillReferenceTransformer('kimi'), cont: '/skill:outl-continue-change', arch: '/skill:outl-archive-change', apply: '/skill:outl-apply-change' },
  ];

  for (const { tool, transform, cont, arch, apply } of cases) {
    it(`emits ${tool} skill invocations for continue, apply, and archive`, () => {
      const out = transform(skill);
      expect(out).toContain(cont);
      expect(out).toContain(arch);
      expect(out).toContain(`${apply} add-auth`);
      // No canonical token survives the rewrite.
      expect(out).not.toMatch(/\/outl:(continue|apply|archive)/);
    });
  }
});
