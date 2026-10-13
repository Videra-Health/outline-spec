import { describe, expect, it } from 'vitest';

import {
  getContinueChangeSkillTemplate,
  getExploreSkillTemplate,
  getOutlineSpecContinueCommandTemplate,
  getOutlineSpecExploreCommandTemplate,
  getOutlineSpecUpdateCommandTemplate,
  getUpdateChangeSkillTemplate,
} from '../../../src/core/templates/skill-templates.js';

describe('workflow list --json field usage', () => {
  it('does not invent schema labels in update and continue pickers', () => {
    const bodies = [
      getUpdateChangeSkillTemplate().instructions,
      getOutlineSpecUpdateCommandTemplate().content,
      getContinueChangeSkillTemplate().instructions,
      getOutlineSpecContinueCommandTemplate().content,
    ];

    for (const body of bodies) {
      const picker = body.slice(body.indexOf('1. **Select the change**'), body.indexOf('2. **'));
      expect(picker).toContain('outline-spec list --json');
      expect(picker).toContain('- Change name');
      expect(picker).toContain('- Status');
      expect(picker).toContain('`lastModified`');
      expect(picker).not.toMatch(/schema/i);
      expect(picker).not.toContain('outline-spec status');

      const status = body.slice(body.indexOf('2. **'), body.indexOf('3. **'));
      expect(status).toContain('outline-spec status --change "<name>" --json');
      expect(status).toContain('`schemaName`');
    }
  });

  it('does not claim explore receives schemas from list output', () => {
    const bodies = [
      getExploreSkillTemplate().instructions,
      getOutlineSpecExploreCommandTemplate().content,
    ];

    for (const body of bodies) {
      expect(body).toContain('Their names and task status');
      expect(body).not.toContain('Their names, schemas, and status');
    }
  });
});
