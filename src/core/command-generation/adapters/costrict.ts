/**
 * CoStrict Command Adapter
 *
 * Formats commands for CoStrict following its frontmatter specification.
 */

import path from 'path';
import type { CommandContent, ToolCommandAdapter } from '../types.js';
import { escapeYamlValue } from '../yaml.js';

/**
 * CoStrict adapter for command generation.
 * File path: .cospec/outline-spec/commands/outline-spec-<id>.md
 * Frontmatter: description, argument-hint
 */
export const costrictAdapter: ToolCommandAdapter = {
  toolId: 'costrict',

  getFilePath(commandId: string): string {
    return path.join('.cospec', 'outline-spec', 'commands', `outline-spec-${commandId}.md`);
  },

  formatFile(content: CommandContent): string {
    return `---
description: ${escapeYamlValue(content.description)}
argument-hint: command arguments
---

${content.body}
`;
  },
};
