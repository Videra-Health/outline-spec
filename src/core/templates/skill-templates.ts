/**
 * Agent Skill Templates
 *
 * Compatibility facade that re-exports split workflow template modules.
 */

export type { SkillTemplate, CommandTemplate } from './types.js';

export { getExploreSkillTemplate, getOutlineSpecExploreCommandTemplate } from './workflows/explore.js';
export { getNewChangeSkillTemplate, getOutlineSpecNewCommandTemplate } from './workflows/new-change.js';
export { getContinueChangeSkillTemplate, getOutlineSpecContinueCommandTemplate } from './workflows/continue-change.js';
export { getApplyInstructions, getApplyChangeSkillTemplate, getOutlineSpecApplyCommandTemplate } from './workflows/apply-change.js';
export { getUpdateChangeSkillTemplate, getOutlineSpecUpdateCommandTemplate } from './workflows/update-change.js';
export { getFfChangeSkillTemplate, getOutlineSpecFfCommandTemplate } from './workflows/ff-change.js';
export { getLandChangeSkillTemplate, getOutlineSpecLandCommandTemplate } from './workflows/land-change.js';
export { getArchiveChangeSkillTemplate, getOutlineSpecArchiveCommandTemplate } from './workflows/archive-change.js';
export { getVerifyChangeSkillTemplate, getOutlineSpecVerifyCommandTemplate } from './workflows/verify-change.js';
export { getOnboardSkillTemplate, getOutlineSpecOnboardCommandTemplate } from './workflows/onboard.js';
export { getOutlineSpecProposeSkillTemplate, getOutlineSpecProposeCommandTemplate } from './workflows/propose.js';
export { getFeedbackSkillTemplate } from './workflows/feedback.js';
