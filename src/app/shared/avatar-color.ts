// Shared by every initials avatar in the app (the header's own account
// button, the Admin Employees grid) so the same identity always renders the
// same color everywhere it shows up.
export const AVATAR_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#ec4899',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
  '#64748b',
];

// `NaN`/non-finite (e.g. an empId that isn't actually numeric) falls back to
// the first color rather than producing `undefined`.
export function avatarColorForId(id: number): string {
  const index = Number.isFinite(id) ? Math.abs(id) % AVATAR_COLORS.length : 0;
  return AVATAR_COLORS[index];
}
