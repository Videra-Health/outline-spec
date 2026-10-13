/**
 * Update Command
 *
 * Refreshes outline-spec skills and commands for configured tools.
 * Supports profile-aware updates, delivery changes, migration, and smart update detection.
 */

import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import { createRequire } from 'module';
import { FileSystemUtils } from '../utils/file-system.js';
import { getTransformerForTool } from '../utils/command-references.js';
import { AI_TOOLS, OUTLINE_SPEC_DIR_NAME } from './config.js';
import {
  generateCommands,
  CommandAdapterRegistry,
} from './command-generation/index.js';
import {
  getToolSkillStatus,
  getToolVersionStatus,
  getSkillTemplates,
  getCommandContents,
  generateSkillContent,
  getToolsWithSkillsDir,
  hasGlobalSkillTarget,
  resolveToolSkillsDir,
  toolSupportsSkills,
  type ToolVersionStatus,
  formatIdeRestart,
} from './shared/index.js';
import { isInteractive } from '../utils/interactive.js';
import { getGlobalConfig, type Delivery, type Profile } from './global-config.js';
import { getProfileWorkflows, ALL_WORKFLOWS, CORE_WORKFLOWS } from './profiles.js';
import { formatOptionalWorkflowsNote } from './onboarding-commands.js';
import { getAvailableTools } from './available-tools.js';
import {
  WORKFLOW_TO_SKILL_DIR,
  getConfiguredToolsForProfileSync,
  getToolsNeedingProfileSync,
} from './profile-sync-drift.js';
import {
  scanInstalledWorkflows as scanInstalledWorkflowsShared,
  migrateIfNeeded as migrateIfNeededShared,
  findLegacyToolMigrations,
  migrateLegacyToolDirs,
  describeLegacyMigration,
  legacyMigrationNotice,
  keptInPlaceNotice,
  hasMovableContent,
  type LegacyToolMigration,
} from './migration.js';
import {
  resolveCommandSurfaceCapability,
  resolveCommandInvocation,
  shouldGenerateCommandsForTool,
  shouldGenerateSkillsForTool,
  shouldReconcileCommandFilesForTool,
  shouldRemoveSkillsForTool,
} from './command-surface.js';
import {
  resolveSharedSkillWriters,
  writeSharedSkillTarget,
} from './shared-skill-target.js';
import { removeLegacyPrefixArtifacts } from './legacy-prefix.js';
import { includesGitHubCopilot, writeCopilotCloudFiles, removeCopilotCloudFiles, isCopilotCloudEnabled, readCopilotCloudOptIn, findUnmanagedCloudFiles } from './github-copilot/cloud-agent.js';

const require = createRequire(import.meta.url);
const { version: OUTLINE_SPEC_VERSION } = require('../../package.json');

type ToolFailure = { name: string; error: string };

function throwIfUpdateFailed(failedTools: readonly ToolFailure[]): void {
  if (failedTools.length > 0) {
    throw new Error(`outline-spec update failed for: ${failedTools.map((tool) => tool.name).join(', ')}`);
  }
}

/**
 * Checkout artifacts that are not real content drift: a UTF-8 BOM and the CRLF
 * line endings a Windows clone with `core.autocrlf` reintroduces on every
 * checkout of committed generated files.
 */
function normalizeGeneratedFile(content: string): string {
  return content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
}

/**
 * Options for the update command.
 */
export interface UpdateCommandOptions {
  /** Force update even when tools are up to date */
  force?: boolean;
}

/**
 * Scans installed workflow artifacts (skills and managed commands) across all configured tools.
 * Returns the union of detected workflow IDs that match ALL_WORKFLOWS.
 *
 * Wrapper around the shared migration module's scanInstalledWorkflows that accepts tool IDs.
 */
export function scanInstalledWorkflows(projectPath: string, toolIds: string[]): string[] {
  const tools = toolIds
    .map((id) => AI_TOOLS.find((t) => t.value === id))
    .filter((t): t is NonNullable<typeof t> => t != null);
  return scanInstalledWorkflowsShared(projectPath, tools);
}

export class UpdateCommand {
  private readonly force: boolean;

  constructor(options: UpdateCommandOptions = {}) {
    this.force = options.force ?? false;
  }

  /**
   * Refreshes outline-spec skills and commands for all configured tools,
   * regenerating artifacts according to the effective profile and delivery mode.
   *
   * @param projectPath - Path to the project root containing the outline-spec directory
   */
  async execute(projectPath: string): Promise<void> {
    const resolvedProjectPath = path.resolve(projectPath);
    const outlineSpecPath = path.join(resolvedProjectPath, OUTLINE_SPEC_DIR_NAME);

    // 1. Check outline-spec directory exists
    if (!await FileSystemUtils.directoryExists(outlineSpecPath)) {
      throw new Error(`No outline-spec directory found. Run 'outline-spec init' first.`);
    }

    // 2. Migrate outline-spec-managed skills left in renamed tool directories
    // (e.g. .kimi -> .kimi-code) so they stay detected and get refreshed,
    // then perform the one-time profile migration if needed before any
    // legacy upgrade generation.
    for (const migration of migrateLegacyToolDirs(resolvedProjectPath)) {
      if (hasMovableContent(migration)) {
        console.log(chalk.dim(`Migrated ${describeLegacyMigration(migration)}: ${migration.from} → ${migration.to}`));
      }
      this.reportKeptInPlace(migration);
    }
    const declinedMigrations = await this.offerConsentedLegacyMigrations(resolvedProjectPath);

    // Use detected tool directories to preserve existing outline-spec skills/commands.
    const detectedTools = getAvailableTools(resolvedProjectPath);
    migrateIfNeededShared(resolvedProjectPath, detectedTools);

    // 3. Read global config for profile/delivery
    const globalConfig = getGlobalConfig();
    const profile = globalConfig.profile ?? 'core';
    const delivery: Delivery = globalConfig.delivery ?? 'both';
    const profileWorkflows = getProfileWorkflows(profile, globalConfig.workflows);
    const desiredWorkflows = profileWorkflows.filter((workflow): workflow is (typeof ALL_WORKFLOWS)[number] =>
      (ALL_WORKFLOWS as readonly string[]).includes(workflow)
    );

    // 4. Find configured tools
    const configuredTools = getConfiguredToolsForProfileSync(resolvedProjectPath);

    if (configuredTools.length === 0) {
      if (declinedMigrations.length > 0) {
        // Not an unconfigured project — a configured one the user chose to
        // leave in its former directory. Saying "run init" would be wrong.
        for (const migration of declinedMigrations) {
          console.log(
            chalk.yellow(
              `Nothing to update: this project's outline-spec files are still in ${migration.from}/, ` +
                `which outline-spec no longer writes.`
            )
          );
          console.log(
            chalk.dim(`Re-run "outline-spec update" and accept the move to ${migration.to}/ to resume updates.`)
          );
        }
        return;
      }
      await this.syncCopilotCloudFiles(resolvedProjectPath, configuredTools);
      console.log(chalk.yellow('No configured tools found.'));
      console.log(chalk.dim('Run "outline-spec init" to set up tools.'));
      return;
    }

    // 6. Check version status for all configured tools, against the same workflow set
    //    the generation loop below writes.
    const toolStatuses = configuredTools.map((toolId) =>
      getToolVersionStatus(resolvedProjectPath, toolId, OUTLINE_SPEC_VERSION, {
        workflows: desiredWorkflows,
      })
    );
    const statusByTool = new Map(toolStatuses.map((status) => [status.toolId, status] as const));

    // 7. Smart update detection
    const toolsNeedingVersionUpdate = toolStatuses
      .filter((s) => {
        if (!s.needsUpdate || delivery !== 'commands') {
          return s.needsUpdate;
        }

        const tool = AI_TOOLS.find((candidate) => candidate.value === s.toolId);
        return !tool || !hasGlobalSkillTarget(tool);
      })
      .map((s) => s.toolId);
    const toolsNeedingConfigSync = getToolsNeedingProfileSync(
      resolvedProjectPath,
      desiredWorkflows,
      delivery,
      configuredTools
    );
    const toolsWithDriftedSkills = this.findToolsWithDriftedSkills(
      resolvedProjectPath,
      configuredTools,
      delivery,
      (toolId) => desiredWorkflows
    );
    const toolsToUpdateSet = new Set<string>([
      ...toolsNeedingVersionUpdate,
      ...toolsNeedingConfigSync,
      ...toolsWithDriftedSkills,
    ]);
    const toolsUpToDate = toolStatuses.filter((s) => !toolsToUpdateSet.has(s.toolId));

    if (!this.force && toolsToUpdateSet.size === 0) {
      // All tools are up to date
      this.displayUpToDateMessage(toolStatuses);
      await this.syncCopilotCloudFiles(resolvedProjectPath, configuredTools);

      // Still check for new tool directories and extra workflows
      this.detectNewTools(resolvedProjectPath, configuredTools);
      this.displayProfileNotes(resolvedProjectPath, configuredTools, desiredWorkflows, profile, delivery);
      this.displaySetupNotes(configuredTools);
      return;
    }

    // 8. Display update plan
    if (this.force) {
      console.log(`Force updating ${configuredTools.length} tool(s): ${configuredTools.join(', ')}`);
    } else {
      this.displayUpdatePlan(
        [...toolsToUpdateSet],
        statusByTool,
        toolsUpToDate,
        new Set(toolsWithDriftedSkills)
      );
    }
    console.log();

    // 9. Determine what to generate based on delivery
    const deliveryIncludesCommands = delivery !== 'skills';
    // 10. Update tools (all if force, otherwise only those needing update)
    const toolsToUpdate = this.force ? configuredTools : [...toolsToUpdateSet];
    const sharedSkillWriters = resolveSharedSkillWriters(
      resolvedProjectPath,
      configuredTools
        .map((toolId) => AI_TOOLS.find((tool) => tool.value === toolId))
        .filter((tool): tool is NonNullable<typeof tool> => tool !== undefined)
    );
    const updatedTools: string[] = [];
    const updatedToolIds: string[] = [];
    const failedTools: ToolFailure[] = [];
    const skillsInvocableCommandSkips: string[] = [];
    const zeroArtifactTools: string[] = [];
    let removedCommandCount = 0;
    let removedSkillCount = 0;
    let removedDeselectedCommandCount = 0;
    let removedDeselectedSkillCount = 0;
    let removedLegacyPrefixCount = 0;

    for (const toolId of toolsToUpdate) {
      const tool = AI_TOOLS.find((t) => t.value === toolId);
      if (!tool || !toolSupportsSkills(tool)) continue;

      const spinner = ora(`Updating ${tool.name}...`).start();

      try {
        const skillsDir = resolveToolSkillsDir(resolvedProjectPath, tool);
        const skillsRoot = hasGlobalSkillTarget(tool) ? skillsDir : resolvedProjectPath;
        const shouldGenerateSkills = shouldGenerateSkillsForTool(tool.value, delivery);
        const shouldGenerateCommands = shouldGenerateCommandsForTool(tool.value, delivery);
        const writesSkills = !tool.skillsDir || sharedSkillWriters.has(tool.value);
        const toolWorkflows = desiredWorkflows;
        const skillTemplates = getSkillTemplates(toolWorkflows);
        const commandContents = getCommandContents(toolWorkflows);

        // Generate skill files if delivery includes skills
        if (shouldGenerateSkills && writesSkills) {
          for (const { template, dirName } of skillTemplates) {
            const skillDir = path.join(skillsDir, dirName);
            const skillFile = path.join(skillDir, 'SKILL.md');

            const transformer = getTransformerForTool(
              tool.value,
              delivery,
              resolveCommandSurfaceCapability(tool.value),
              resolveCommandInvocation(tool.value)
            );
            const skillContent = generateSkillContent(template, OUTLINE_SPEC_VERSION, transformer);
            FileSystemUtils.assertPathWithin(skillsRoot, skillFile);
            await FileSystemUtils.writeFile(skillFile, skillContent);
          }
          writeSharedSkillTarget(resolvedProjectPath, tool.value);

          removedDeselectedSkillCount += await this.removeUnselectedSkillDirs(
            skillsRoot,
            skillsDir,
            toolWorkflows
          );
        }

        // Delete skill directories if delivery is commands-only
        if (
          shouldRemoveSkillsForTool(tool.value, delivery) &&
          writesSkills &&
          !hasGlobalSkillTarget(tool)
        ) {
          removedSkillCount += await this.removeSkillDirs(skillsRoot, skillsDir);
          // Persist the selected owner even when commands-only delivery leaves
          // this target with no generated skills.
          writeSharedSkillTarget(resolvedProjectPath, tool.value);
          // A tool with no command adapter now has zero outline-spec artifacts;
          // say so like init does, rather than deleting its skills silently
          // and letting tool detection re-suggest an init that would also
          // generate nothing under this delivery setting.
          if (!shouldGenerateCommandsForTool(tool.value, delivery)) {
            zeroArtifactTools.push(tool.name);
          }
        }

        // Generate commands if delivery includes commands
        if (shouldGenerateCommands) {
          const adapter = CommandAdapterRegistry.get(tool.value);
          if (adapter) {
            const generatedCommands = generateCommands(commandContents, adapter);

            for (const cmd of generatedCommands) {
              const commandFile = FileSystemUtils.resolveProjectArtifactPath(
                resolvedProjectPath,
                cmd.path
              );
              await FileSystemUtils.writeFile(commandFile, cmd.fileContent);
            }

            removedDeselectedCommandCount += await this.removeUnselectedCommandFiles(
              resolvedProjectPath,
              toolId,
              toolWorkflows
            );
          }
        } else if (deliveryIncludesCommands && resolveCommandSurfaceCapability(tool.value) === 'skills-invocable') {
          skillsInvocableCommandSkips.push(tool.value);
        }

        // Delete command files if delivery is skills-only
        if (shouldReconcileCommandFilesForTool(tool.value, delivery)) {
          removedCommandCount += await this.removeCommandFiles(resolvedProjectPath, toolId);
        }

        removedLegacyPrefixCount += await removeLegacyPrefixArtifacts(resolvedProjectPath, tool.value);

        spinner.succeed(`Updated ${tool.name}`);
        updatedTools.push(tool.name);
        updatedToolIds.push(tool.value);
        for (const migration of migrateLegacyToolDirs(
          resolvedProjectPath,
          [tool.value],
          'after-generation'
        )) {
          if (hasMovableContent(migration)) {
            console.log(chalk.dim(`Migrated ${describeLegacyMigration(migration)}: ${migration.from} → ${migration.to}`));
          }
          this.reportKeptInPlace(migration);
        }
      } catch (error) {
        spinner.fail(`Failed to update ${tool.name}`);
        failedTools.push({
          name: tool.name,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // 11. Summary
    console.log();
    if (updatedTools.length > 0) {
      console.log(chalk.green(`✓ Updated: ${updatedTools.join(', ')} (v${OUTLINE_SPEC_VERSION})`));
    }
    if (failedTools.length > 0) {
      console.log(chalk.red(`✗ Failed: ${failedTools.map(f => `${f.name} (${f.error})`).join(', ')}`));
    }
    if (skillsInvocableCommandSkips.length > 0) {
      console.log(chalk.dim(`Commands skipped for: ${skillsInvocableCommandSkips.join(', ')} (uses skills)`));
    }
    if (removedCommandCount > 0) {
      console.log(chalk.dim(`Removed: ${removedCommandCount} command files (delivery: skills)`));
    }
    if (removedSkillCount > 0) {
      console.log(chalk.dim(`Removed: ${removedSkillCount} skill directories (delivery: commands)`));
    }
    if (zeroArtifactTools.length > 0) {
      const names = zeroArtifactTools.join(', ');
      console.log(
        chalk.yellow(
          `No skills or commands remain for ${names}: delivery is set to 'commands' but ` +
            `${zeroArtifactTools.length === 1 ? 'it supports' : 'they support'} only skills. ` +
            `Run 'outline-spec config set delivery both' to generate skills.`
        )
      );
    }
    if (removedDeselectedCommandCount > 0) {
      console.log(chalk.dim(`Removed: ${removedDeselectedCommandCount} command files (deselected workflows)`));
    }
    if (removedDeselectedSkillCount > 0) {
      console.log(chalk.dim(`Removed: ${removedDeselectedSkillCount} skill directories (deselected workflows)`));
    }
    if (removedLegacyPrefixCount > 0) {
      console.log(chalk.dim(`Removed: ${removedLegacyPrefixCount} skills and commands with the old outline-spec prefix`));
    }

    await this.syncCopilotCloudFiles(resolvedProjectPath, configuredTools);

    // 13. Detect new tool directories not currently configured
    this.detectNewTools(resolvedProjectPath, configuredTools);

    // 14. Display the profile notes
    this.displayProfileNotes(resolvedProjectPath, configuredTools, desiredWorkflows, profile, delivery);
    this.displaySetupNotes(configuredTools);

    // 15. List affected tools
    if (updatedTools.length > 0) {
      const toolDisplayNames = updatedTools;
      console.log(chalk.dim(`Tools: ${toolDisplayNames.join(', ')}`));
    }

    console.log();
    const affectedToolIds = updatedToolIds;
    const restartHint = formatIdeRestart(affectedToolIds, delivery);
    if (restartHint) {
      console.log(chalk.dim(restartHint));
    }
    throwIfUpdateFailed(failedTools);
  }

  private async syncCopilotCloudFiles(projectPath: string, configuredTools: string[]): Promise<void> {
    try {
      if (includesGitHubCopilot(configuredTools)) {
        // Cloud files are opt-in (see cloud-agent.ts). `update` never prompts,
        // so it only refreshes files the user has already opted into (via
        // `outline-spec init` or a `githubCopilot.cloudAgent: true` config), or that
        // a pre-opt-in project already has. Opting in is a deliberate init/config
        // step, never a silent side effect of running update.
        if (await isCopilotCloudEnabled(projectPath)) {
          await writeCopilotCloudFiles(projectPath);
          const collisions = await findUnmanagedCloudFiles(projectPath);
          if (collisions.length > 0) {
            console.log(
              chalk.dim(
                `Left your existing ${collisions.join(' and ')} untouched — add the outline-spec ` +
                  `install step by hand so the Copilot cloud agent can run outline-spec.`
              )
            );
          }
          return;
        }

        // Explicit opt-out (githubCopilot.cloudAgent: false) means "not here":
        // remove any managed files a prior opt-in left behind (customized files
        // are preserved). If the user simply never decided, stay quiet unless
        // we're at an interactive terminal, where a one-line hint aids discovery.
        if (readCopilotCloudOptIn(projectPath) === false) {
          const removed = await removeCopilotCloudFiles(projectPath);
          if (removed > 0) {
            console.log(
              chalk.dim(`Removed: ${removed} Copilot cloud agent file(s) (opted out of cloud files)`)
            );
          }
        } else if (isInteractive()) {
          console.log(
            chalk.dim(
              "GitHub Copilot cloud coding-agent files are available (opt-in). Enable with 'outline-spec init --copilot-cloud'."
            )
          );
        }
        return;
      }

      const removed = await removeCopilotCloudFiles(projectPath);
      if (removed > 0) {
        console.log(chalk.dim(`Removed: ${removed} Copilot cloud agent file(s) (github-copilot not configured)`));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Warning: failed to sync Copilot cloud agent files: ${message}`);
    }
  }

  /**
   * Tools whose SKILL.md bodies no longer match what this CLI generates.
   *
   * Skill freshness was decided solely by the `generatedBy:` line, so a body
   * edited after generation — a "helpful" PR touching `.claude/skills/**`, a
   * dotfile sync, another agent — left `update` reporting the install healthy.
   * Command files never had that gap: `areCommandFilesUpToDate` content-
   * compares them, and the same comparison belongs on the higher-authority
   * surface. A missing skill file is left to the profile-sync check, which
   * already knows what a partial install means.
   */
  private findToolsWithDriftedSkills(
    projectPath: string,
    toolIds: string[],
    delivery: Delivery,
    workflowsForTool: (toolId: string) => readonly (typeof ALL_WORKFLOWS)[number][]
  ): string[] {
    return toolIds.filter((toolId) => {
      const tool = AI_TOOLS.find((t) => t.value === toolId);
      if (!tool || !toolSupportsSkills(tool)) return false;
      if (!shouldGenerateSkillsForTool(tool.value, delivery)) return false;
      // A shared skills root is generated with its owner's transformer, so
      // only the owner may compare it. getToolSkillStatus settles ownership.
      if (!getToolSkillStatus(projectPath, tool.value).configured) return false;

      const skillsDir = resolveToolSkillsDir(projectPath, tool);
      const transformer = getTransformerForTool(
        tool.value,
        delivery,
        resolveCommandSurfaceCapability(tool.value),
        resolveCommandInvocation(tool.value)
      );

      return getSkillTemplates(workflowsForTool(toolId)).some(({ template, dirName }) => {
        const skillFile = path.join(skillsDir, dirName, 'SKILL.md');
        if (!fs.existsSync(skillFile)) return false;
        try {
          const existing = fs.readFileSync(skillFile, 'utf-8');
          const generated = generateSkillContent(template, OUTLINE_SPEC_VERSION, transformer);
          return normalizeGeneratedFile(existing) !== normalizeGeneratedFile(generated);
        } catch {
          return true;
        }
      });
    });
  }

  /**
   * Display message when all tools are up to date.
   */
  private displayUpToDateMessage(toolStatuses: ToolVersionStatus[]): void {
    const toolNames = toolStatuses.map((s) => s.toolId);
    console.log(chalk.green(`✓ All ${toolStatuses.length} tool(s) up to date (v${OUTLINE_SPEC_VERSION})`));
    console.log(chalk.dim(`  Tools: ${toolNames.join(', ')}`));
    console.log();
    console.log(chalk.dim('Use --force to refresh files anyway.'));
  }

  /**
   * Display the update plan showing which tools need updating.
   */
  private displayUpdatePlan(
    toolsToUpdate: string[],
    statusByTool: Map<string, ToolVersionStatus>,
    upToDate: ToolVersionStatus[],
    driftedSkills: ReadonlySet<string> = new Set()
  ): void {
    const updates = toolsToUpdate.map((toolId) => {
      const status = statusByTool.get(toolId);
      if (status?.needsUpdate) {
        const fromVersion = status.generatedByVersion ?? 'unknown';
        return `${status.toolId} (${fromVersion} → ${OUTLINE_SPEC_VERSION})`;
      }
      // Say why: a user who edited a SKILL.md on purpose is owed the reason
      // their edit is about to be overwritten.
      if (driftedSkills.has(toolId)) {
        return `${toolId} (skill files differ from the generated content)`;
      }
      return `${toolId} (config sync)`;
    });

    console.log(`Updating ${toolsToUpdate.length} tool(s): ${updates.join(', ')}`);

    if (upToDate.length > 0) {
      const upToDateNames = upToDate.map((s) => s.toolId);
      console.log(chalk.dim(`Already up to date: ${upToDateNames.join(', ')}`));
    }
  }

  /**
   * Shows manual setup notes for configured tools that need extra
   * configuration before they pick up generated files.
   */
  private displaySetupNotes(toolIds: string[]): void {
    for (const toolId of toolIds) {
      const tool = AI_TOOLS.find((t) => t.value === toolId);
      if (tool?.setupNote) {
        console.log(chalk.yellow(`Setup required for ${tool.name}: ${tool.setupNote}`));
      }
    }
  }

  /**
   * Detects new tool directories that aren't currently configured and displays a hint.
   */
  private detectNewTools(projectPath: string, configuredTools: string[]): void {
    const availableTools = getAvailableTools(projectPath);
    const configuredSet = new Set(configuredTools);

    const newTools = availableTools.filter((t) => !configuredSet.has(t.value));

    if (newTools.length > 0) {
      const newToolNames = newTools.map((tool) => tool.name);
      const isSingleTool = newToolNames.length === 1;
      const toolNoun = isSingleTool ? 'tool' : 'tools';
      const pronoun = isSingleTool ? 'it' : 'them';
      console.log();
      console.log(
        chalk.yellow(
          `Detected new ${toolNoun}: ${newToolNames.join(', ')}. Run 'outline-spec init' to add ${pronoun}.`
        )
      );
    }
  }

  /**
   * Prints the profile notes, in order, with one pointer at
   * `outline-spec config profile` rather than three.
   *
   * Every note is evaluated: reading them as one short-circuited `||` chain
   * would swallow whichever ran second.
   */
  private displayProfileNotes(
    projectPath: string,
    configuredTools: string[],
    desiredWorkflows: readonly string[] | undefined,
    profile: Profile,
    delivery: Delivery
  ): void {
    const printedExtraNote = this.displayExtraWorkflowsNote(
      projectPath,
      configuredTools,
      desiredWorkflows ?? []
    );
    const printedMissingCoreNote = this.displayMissingCoreWorkflowsNote(profile, desiredWorkflows);
    this.displayOptionalWorkflowsNote(
      configuredTools,
      desiredWorkflows,
      delivery,
      printedExtraNote || printedMissingCoreNote
    );
  }

  /**
   * Displays a note about extra workflows installed that aren't in the current profile.
   */
  private displayExtraWorkflowsNote(
    projectPath: string,
    configuredTools: string[],
    profileWorkflows: readonly string[]
  ): boolean {
    const installedWorkflows = scanInstalledWorkflows(projectPath, configuredTools);
    const profileSet = new Set(profileWorkflows);
    const extraWorkflows = installedWorkflows.filter((w) => !profileSet.has(w));

    if (extraWorkflows.length > 0) {
      console.log(chalk.dim(`Note: ${extraWorkflows.length} extra workflows not in profile (use \`outline-spec config profile\` to manage)`));
      return true;
    }
    return false;
  }

  /**
   * Point out core workflows a custom profile is missing, so releases that
   * grow CORE_WORKFLOWS stay discoverable. Keep custom profiles user-owned;
   * do not mutate them.
   */
  private displayMissingCoreWorkflowsNote(profile: Profile, workflows?: readonly string[]): boolean {
    if (profile !== 'custom' || !workflows) {
      return false;
    }

    const workflowSet = new Set(workflows);
    const missing = CORE_WORKFLOWS.filter((workflow) => !workflowSet.has(workflow));

    if (missing.length === 0) {
      return false;
    }

    const label = missing.length === 1 ? 'workflow' : 'workflows';
    const pronoun = missing.length === 1 ? 'it' : 'them';
    console.log(chalk.dim(`Note: Your custom profile is missing ${missing.length} core ${label}: ${missing.join(', ')}`));
    console.log(chalk.dim(`Run \`outline-spec config profile\` to add ${pronoun}, or \`outline-spec config profile core\` to use the core set.`));
    return true;
  }

  /**
   * Fallback pointer to the workflows the profile leaves out.
   *
   * `update` already points at `outline-spec config profile` when files drift from
   * the profile, and when a custom profile is missing core workflows. Neither
   * fires for the default `core` profile, so the user `update` is most likely
   * to be helping — the one who ran it because a command they read about never
   * appeared — learns nothing (#1076). This covers that gap.
   *
   * Silent when another note already pointed at the same command, and when no
   * configured tool can receive a workflow surface under the active delivery:
   * adding workflows would write nothing there.
   */
  private displayOptionalWorkflowsNote(
    configuredTools: string[],
    workflows: readonly string[] | undefined,
    delivery: Delivery,
    alreadyPointedAtProfileConfig: boolean
  ): void {
    if (alreadyPointedAtProfileConfig || !workflows) {
      return;
    }

    const anyToolHasASurface = configuredTools.some(
      (toolId) =>
        shouldGenerateSkillsForTool(toolId, delivery) ||
        shouldGenerateCommandsForTool(toolId, delivery)
    );
    if (!anyToolHasASurface) {
      return;
    }

    const note = formatOptionalWorkflowsNote(workflows);
    if (!note) {
      return;
    }
    for (const line of note) {
      console.log(chalk.dim(line));
    }
  }

  /**
   * Removes skill directories for workflows when delivery changed to commands-only.
   * Returns the number of directories removed.
   */
  private async removeSkillDirs(skillsRoot: string, skillsDir: string): Promise<number> {
    let removed = 0;

    for (const workflow of ALL_WORKFLOWS) {
      const dirName = WORKFLOW_TO_SKILL_DIR[workflow];
      if (!dirName) continue;

      const skillDir = path.join(skillsDir, dirName);
      if (!fs.existsSync(skillDir)) continue;
      FileSystemUtils.assertPathWithin(skillsRoot, skillDir);
      try {
        await fs.promises.rm(skillDir, { recursive: true, force: true });
        removed++;
      } catch {
        // Ignore errors
      }
    }

    return removed;
  }

  /**
   * Removes skill directories for workflows that are no longer selected in the active profile.
   * Returns the number of directories removed.
   */
  private async removeUnselectedSkillDirs(
    skillsRoot: string,
    skillsDir: string,
    desiredWorkflows: readonly (typeof ALL_WORKFLOWS)[number][]
  ): Promise<number> {
    const desiredSet = new Set(desiredWorkflows);
    let removed = 0;

    for (const workflow of ALL_WORKFLOWS) {
      if (desiredSet.has(workflow)) continue;
      const dirName = WORKFLOW_TO_SKILL_DIR[workflow];
      if (!dirName) continue;

      const skillDir = path.join(skillsDir, dirName);
      if (!fs.existsSync(skillDir)) continue;
      FileSystemUtils.assertPathWithin(skillsRoot, skillDir);
      try {
        await fs.promises.rm(skillDir, { recursive: true, force: true });
        removed++;
      } catch {
        // Ignore errors
      }
    }

    return removed;
  }

  /**
   * Removes command files for workflows when delivery changed to skills-only.
   * Returns the number of files removed.
   */
  private async removeCommandFiles(
    projectPath: string,
    toolId: string,
  ): Promise<number> {
    let removed = 0;

    const adapter = CommandAdapterRegistry.get(toolId);
    if (!adapter) return 0;

    for (const workflow of ALL_WORKFLOWS) {
      const cmdPath = adapter.getFilePath(workflow);
      const fullPath = FileSystemUtils.resolveProjectArtifactPath(projectPath, cmdPath);

      try {
        if (fs.existsSync(fullPath)) {
          await fs.promises.unlink(fullPath);
          removed++;
        }
      } catch {
        // Ignore errors
      }
    }

    return removed;
  }

  /**
   * Removes command files for workflows that are no longer selected in the active profile.
   * Returns the number of files removed.
   */
  private async removeUnselectedCommandFiles(
    projectPath: string,
    toolId: string,
    desiredWorkflows: readonly (typeof ALL_WORKFLOWS)[number][]
  ): Promise<number> {
    let removed = 0;

    const adapter = CommandAdapterRegistry.get(toolId);
    if (!adapter) return 0;

    const desiredSet = new Set(desiredWorkflows);

    for (const workflow of ALL_WORKFLOWS) {
      if (desiredSet.has(workflow)) continue;
      const cmdPath = adapter.getFilePath(workflow);
      const fullPath = FileSystemUtils.resolveProjectArtifactPath(projectPath, cmdPath);

      try {
        if (fs.existsSync(fullPath)) {
          await fs.promises.unlink(fullPath);
          removed++;
        }
      } catch {
        // Ignore errors
      }
    }

    return removed;
  }

  /**
   * Offers to move outline-spec content out of a renamed tool's former directory
   * when the old location might still be the live one — today, Windsurf's
   * `.windsurf/` after the Devin Desktop rebrand.
   *
   * Interactive runs are asked, because nothing on disk distinguishes a user
   * who took the rebrand from one still on a pre-rebrand Windsurf build that
   * reads only `.windsurf/`. `--force` and non-interactive runs migrate, which
   * is what an unattended upgrade wants.
   */
  /** Surfaces files the move left behind rather than overwriting. */
  private reportKeptInPlace(migration: LegacyToolMigration): void {
    const notice = keptInPlaceNotice(migration);
    if (notice) console.log(chalk.dim(notice));
  }

  private async offerConsentedLegacyMigrations(
    projectPath: string
  ): Promise<LegacyToolMigration[]> {
    const pending = findLegacyToolMigrations(projectPath).filter((m) => m.needsConsent);
    const declined: LegacyToolMigration[] = [];
    if (pending.length === 0) return declined;

    for (const migration of pending) {
      // Nothing movable: every legacy file differs from its counterpart, so
      // there is no move to offer. Still say so — silence would leave two
      // divergent copies the user never hears about.
      if (!hasMovableContent(migration)) {
        this.reportKeptInPlace(migration);
        console.log();
        continue;
      }

      console.log(chalk.yellow(legacyMigrationNotice(migration)));

      if (!this.force && isInteractive()) {
        const { confirm } = await import('@inquirer/prompts');
        let shouldMigrate: boolean;
        try {
          shouldMigrate = await confirm({
            message: `Move ${describeLegacyMigration(migration)} from ${migration.from}/ to ${migration.to}/?`,
            default: true,
          });
        } catch {
          // Closed stdin is not consent, and it must not abort the update.
          shouldMigrate = false;
        }
        if (!shouldMigrate) {
          // Say what declining costs. outline-spec writes the current root now, so
          // the files keep working where they are, but outline-spec stops managing
          // them — it no longer looks in the former directory.
          console.log(
            chalk.dim(
              `Left in place. outline-spec writes ${migration.to}/ now and will not manage ` +
                `${migration.from}/, so those files stay as they are until you move them. ` +
                `You will be asked again next run.`
            )
          );
          console.log();
          declined.push(migration);
          continue;
        }
      }

      for (const applied of migrateLegacyToolDirs(projectPath, [migration.toolId])) {
        if (hasMovableContent(applied)) {
          console.log(chalk.dim(`Migrated ${describeLegacyMigration(applied)}: ${applied.from} → ${applied.to}`));
        }
        this.reportKeptInPlace(applied);
      }
      console.log();
    }

    return declined;
  }
}
