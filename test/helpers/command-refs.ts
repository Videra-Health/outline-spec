// Skill references share the outl- prefix with hyphenated commands, so skill names are excluded.
const NOT_SKILL = '(?!(?:apply-change|archive-change|continue-change|explore|ff-change|new-change|onboard|propose|update-change|verify-change)\\b)';

export const HYPHEN_COMMAND_REF = new RegExp(`/outl-${NOT_SKILL}`);
export const COMMAND_REF = new RegExp(`/outl(?::|-${NOT_SKILL})`);
