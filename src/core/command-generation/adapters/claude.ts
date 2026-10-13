/**
 * Claude Code Command Adapter
 *
 * Formats commands for Claude Code following its frontmatter specification.
 */

import path from 'path';
import type { CommandContent, ToolCommandAdapter } from '../types.js';
import { escapeYamlValue, formatTagsArray } from '../yaml.js';
import { OUTLINE_SPEC_CLI_ALLOWED_TOOLS } from '../../shared/allowed-tools.js';

/**
 * Claude Code adapter for command generation.
 * File path: .claude/commands/outl/<id>.md
 * Frontmatter: name, description, allowed-tools, category, tags
 */
export const claudeAdapter: ToolCommandAdapter = {
  toolId: 'claude',

  getFilePath(commandId: string): string {
    return path.join('.claude', 'commands', 'outl', `${commandId}.md`);
  },

  formatFile(content: CommandContent): string {
    return `---
name: ${escapeYamlValue(content.name)}
description: ${escapeYamlValue(content.description)}
allowed-tools: ${OUTLINE_SPEC_CLI_ALLOWED_TOOLS}
category: ${escapeYamlValue(content.category)}
tags: ${formatTagsArray(content.tags)}
---

${content.body}
`;
  },
};
