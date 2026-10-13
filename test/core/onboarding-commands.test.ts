import { describe, expect, it } from 'vitest';
import {
  DESCRIPTION_BUDGET,
  formatOptionalWorkflowsNote,
  getOnboardingCommands,
} from '../../src/core/onboarding-commands.js';
import { ALL_WORKFLOWS, CORE_WORKFLOWS } from '../../src/core/profiles.js';

describe('getOnboardingCommands', () => {
  it('omits commands the profile does not install', () => {
    const commands = getOnboardingCommands(CORE_WORKFLOWS).map((c) => c.command);

    expect(commands).toEqual(['/outl:propose', '/outl:apply']);
    expect(commands).not.toContain('/outl:new');
    expect(commands).not.toContain('/outl:continue');
  });

  it('includes expanded commands when a custom profile installs them', () => {
    const commands = getOnboardingCommands(['new', 'continue', 'apply']).map((c) => c.command);

    expect(commands).toEqual(['/outl:new', '/outl:continue', '/outl:apply']);
  });

  it('returns lifecycle order regardless of the order workflows are given', () => {
    const commands = getOnboardingCommands(['apply', 'continue', 'propose']).map((c) => c.command);

    expect(commands).toEqual(['/outl:propose', '/outl:continue', '/outl:apply']);
  });

  it('returns nothing when no onboarding workflow is installed', () => {
    expect(getOnboardingCommands(['archive'])).toEqual([]);
    expect(getOnboardingCommands([])).toEqual([]);
  });

  it('keeps descriptions within the welcome screen width budget', () => {
    // A longer description wraps the welcome screen at 60 columns, which desyncs
    // its animation. See the width test in test/ui/welcome-screen.test.ts.
    for (const { command, description } of getOnboardingCommands(ALL_WORKFLOWS)) {
      expect(description.length, `${command} description is too long`).toBeLessThanOrEqual(
        DESCRIPTION_BUDGET
      );
    }
  });
});

describe('formatOptionalWorkflowsNote', () => {
  it('names every workflow the core profile leaves out', () => {
    const note = formatOptionalWorkflowsNote(CORE_WORKFLOWS);

    expect(note).not.toBeNull();
    expect(note?.[0]).toBe(
      'Note: 5 more workflows are available (new, continue, ff, verify, onboard).'
    );
    expect(note?.[1]).toBe(
      'Add them with `outline-spec config profile`.'
    );
  });

  it('lists the missing workflows in declaration order, not the order given', () => {
    const installed = ALL_WORKFLOWS.filter(
      (workflow) => workflow !== 'new' && workflow !== 'verify'
    );

    const note = formatOptionalWorkflowsNote([...installed].reverse());

    expect(note?.[0]).toBe('Note: 2 more workflows are available (new, verify).');
  });

  it('reads as a singular sentence when exactly one workflow is missing', () => {
    const note = formatOptionalWorkflowsNote(
      ALL_WORKFLOWS.filter((workflow) => workflow !== 'onboard')
    );

    expect(note?.[0]).toBe('Note: 1 more workflow is available (onboard).');
    expect(note?.[1]).toBe(
      'Add it with `outline-spec config profile`.'
    );
  });

  it('returns null when every workflow is installed', () => {
    expect(formatOptionalWorkflowsNote(ALL_WORKFLOWS)).toBeNull();
  });

  it('ignores workflow names that are not part of the system', () => {
    expect(formatOptionalWorkflowsNote([...ALL_WORKFLOWS, 'not-a-workflow'])).toBeNull();
  });
});
