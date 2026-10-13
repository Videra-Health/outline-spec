# outline-spec-onboard-skill
Define `/outl:onboard` behavior for guiding users through an end-to-end outline-spec workflow on their real codebase.

1. outline-spec Onboard Skill: The system SHALL provide an `/outl:onboard` skill that guides users through their first complete outline-spec workflow cycle with narration and real codebase work.
  a. Skill invocation: WHEN user invokes `/outl:onboard` THEN agent checks if outline-spec is initialized AND if not initialized, prompts user to run `outline-spec init` first AND if initialized, proceeds with onboarding flow
  b. Welcome and expectations: WHEN onboarding begins THEN agent displays welcome message explaining what will happen AND sets expectation of ~15 minute duration AND explains the workflow phases: explore → new → artifacts → apply → archive
2. Codebase Analysis for Task Suggestions: The skill SHALL analyze the user's codebase to suggest appropriately-scoped starter tasks.
  a. Codebase scanning: WHEN onboarding reaches task selection phase THEN agent scans codebase for small improvement opportunities AND looks for: TODO/FIXME comments, missing error handling, functions without tests, outdated dependencies, type: any in TypeScript, console.log in production code, missing input validation AND checks recent git commits for context on current work
  b. Task suggestion presentation: WHEN agent has analyzed codebase THEN agent presents 3-4 specific task suggestions with scope estimates AND each suggestion includes: task description, estimated scope (files/lines), why it's a good starter AND offers option for user to specify their own task
  c. Scope guardrail: WHEN user selects or describes a task that is too large THEN agent gently redirects toward smaller scope AND suggests breaking down or deferring the large task AND offers appropriately-sized alternatives
3. Explore Phase Demo: The skill SHALL briefly demonstrate explore mode before creating a change.
  a. Brief explore demonstration: WHEN task is selected THEN agent briefly demonstrates `/outl:explore` by investigating relevant code AND explains explore mode is for thinking before doing AND keeps this phase short (not a full exploration session) AND transitions to change creation
4. Guided Artifact Creation: The skill SHALL guide users through each artifact with narration explaining the purpose.
  a. Change creation with narration: WHEN creating the change directory THEN agent runs `outline-spec new change "<name>"` with derived kebab-case name AND explains what a "change" is (container for thinking and planning) AND shows the folder structure that was created AND pauses for user acknowledgment before proceeding
  b. Proposal creation with narration: WHEN creating proposal.md THEN agent explains proposals capture WHY we're making this change AND drafts proposal based on selected task AND shows draft to user for approval before saving AND explains the sections (Why, What Changes, Capabilities, Impact)
  c. Specs creation with narration: WHEN creating spec files THEN agent explains specs define WHAT we're building in detail AND explains the requirement/scenario format AND creates spec file(s) based on proposal capabilities AND notes that specs become documentation that stays in sync
  e. Tasks creation with narration: WHEN creating tasks.md THEN agent explains tasks break work into checkboxes AND explains these drive the apply phase AND generates task list from specs AND shows tasks and asks if ready to implement
5. Guided Implementation: The skill SHALL implement tasks with narration connecting back to artifacts.
  a. Implementation with narration: WHEN implementing tasks THEN agent announces each task before working on it AND implements the change in the codebase AND occasionally references how specs informed decisions AND marks each task complete as it finishes AND keeps narration light (not over-explaining)
  b. Implementation completion: WHEN all tasks are complete THEN agent announces completion AND summarizes what was done AND transitions to archive phase
6. Archive with Explanation: The skill SHALL archive the completed change and explain what happened.
  a. Archive with narration: WHEN archiving the change THEN agent explains archive moves change to dated folder AND runs archive process AND shows where archived change lives AND explains the long-term value (finding decisions later)
7. Recap and Next Steps: The skill SHALL conclude with a recap and command reference.
  a. Final recap: WHEN onboarding is complete THEN agent summarizes the workflow phases completed AND emphasizes this rhythm works for any size change AND provides command reference table (/outl:explore, /outl:new, /outl:ff, /outl:continue, /outl:apply, /outl:verify, /outl:archive) AND suggests next actions (try /outl:new or /outl:ff on something)
8. Graceful Exit Handling: The skill SHALL handle users who want to stop mid-way.
  a. User wants to stop: WHEN user indicates they want to stop during onboarding THEN agent acknowledges gracefully AND notes that the in-progress change is saved AND explains how to continue later with `/outl:continue <name>` AND exits without pressure
  b. User wants quick reference only: WHEN user says they just want to see the commands THEN agent provides command cheat sheet AND exits gracefully with encouragement to try `/outl:new`
