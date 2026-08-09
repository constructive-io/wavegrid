import type { UserAccount, UserRole } from '@/types/ipc';

/**
 * Why a user can't be removed, or null when they can — the same rule the store
 * enforces, so the button is only ever disabled for a removal that would
 * actually be refused.
 *
 * Losing the only admin *while other users remain* locks administration out of
 * the project. Removing the very last account is fine: it leaves nobody to sign
 * in, which is recoverable by adding a user, not a lock-out.
 */
export function userRemovalBlock(users: UserAccount[], target: UserAccount): string | null {
  if (target.role !== 'admin') return null;
  if (users.length <= 1) return null;
  const admins = users.filter((u) => u.role === 'admin').length;
  return admins <= 1 ? 'The last admin cannot be removed while other users exist.' : null;
}

/** Why a user's role can't be changed, or null when it can. */
export function roleChangeBlock(
  users: UserAccount[],
  target: UserAccount,
  next: UserRole
): string | null {
  if (target.role !== 'admin' || next === 'admin') return null;
  const admins = users.filter((u) => u.role === 'admin').length;
  return admins <= 1 ? 'The last admin cannot be demoted.' : null;
}
