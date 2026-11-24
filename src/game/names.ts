// Names are yours to choose. No word filter for family/local play; we only drop
// characters that could break the page (they end up inside HTML).
// If online PvP or leaderboards arrive, add an inappropriate-name check here.
export const NAME_MAX = 18;
export function cleanName(raw: string, max = NAME_MAX): string {
  return raw.replace(/[<>&"`\\]/g, '').replace(/\s+/g, ' ').slice(0, max);
}
