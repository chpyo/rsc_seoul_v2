/**
 * Administrator account configuration.
 * Designated administrators have full edit and delete permissions across all
 * sessions, projects, and literatures in the application.
 */

export const ADMIN_EMAILS: readonly string[] = [
  "chpyo25@gmail.com",
  "vyckdghks@gmail.com",
];

export function isUserAdmin(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return ADMIN_EMAILS.some((admin) => admin.toLowerCase() === normalized);
}
