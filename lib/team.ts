export const TEAM_MEMBERS = [
  "Alice Chen",
  "Bob Martinez",
  "Carol Davis",
  "David Wong",
  "Sarah Kim",
  "James Patel",
  "Tom Harris",
  "Mike Johnson",
  "Lisa Park",
];

export function resolveToFullName(partialName: string): string | null {
  const lower = partialName.toLowerCase().trim();
  const match = TEAM_MEMBERS.find(
    (member) =>
      member.toLowerCase() === lower ||
      member.toLowerCase().includes(lower) ||
      lower.includes(member.split(" ")[0].toLowerCase())
  );
  return match ?? null;
}

export function isResolved(name: string): boolean {
  return TEAM_MEMBERS.includes(name);
}

/** @mention autocomplete: match team members the same way as the submit / paste textareas. */
export function filterMembersForAtMention(partialToken: string): string[] {
  const lowered = partialToken.toLowerCase();
  return TEAM_MEMBERS.filter(
    (member) =>
      member.toLowerCase().includes(lowered) ||
      member.split(" ")[0].toLowerCase().startsWith(lowered)
  );
}
