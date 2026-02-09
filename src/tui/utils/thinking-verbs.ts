export const THINKING_VERBS = [
  'analyzing', 'checking', 'cross-referencing', 'digging in',
  'examining', 'inspecting', 'investigating', 'looking up',
  'mulling', 'pondering', 'reasoning', 'reviewing',
  'scanning', 'searching', 'sifting', 'thinking',
  'validating', 'verifying', 'working',
] as const;

export function getRandomThinkingVerb(): string {
  return THINKING_VERBS[Math.floor(Math.random() * THINKING_VERBS.length)];
}
