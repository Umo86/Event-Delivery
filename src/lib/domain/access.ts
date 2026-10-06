import type { Tone } from './labels';
import type { Role } from './types';

/** How long a temporary password (from an invite or a reset) works for. */
export const TEMP_PASSWORD_DAYS = 7;

export const ACCESS_LEVELS: { key: Role; label: string; summary: string; email: string }[] = [
  {
    key: 'super_admin',
    label: 'Super Admin',
    summary: 'Full control of everything, including people, access levels and platform settings.',
    email: 'You have full control of everything, including inviting people and changing settings',
  },
  {
    key: 'manager',
    label: 'Manager',
    summary: 'Adds, edits and deletes signage, changes status, creates events, manages sponsors, suppliers and sign-off setup, and signs off their stages.',
    email: 'You can add, edit and remove signage, change status, create events and sign off the stages you look after',
  },
  {
    key: 'user',
    label: 'User',
    summary: 'Sees everything and can comment, but can’t change anything.',
    email: 'You can see everything and add comments, but not change anything',
  },
];

export function accessLevel(role: Role) {
  return ACCESS_LEVELS.find((a) => a.key === role) ?? ACCESS_LEVELS[1];
}

/** What each access level can do, for the table on the admin page. */
export const ABILITIES: { label: string; super_admin: string; manager: string; user: string }[] = [
  { label: 'See schedules, proofs and the dashboard', super_admin: 'Yes', manager: 'Yes', user: 'Yes' },
  { label: 'Comment on lines', super_admin: 'Yes', manager: 'Yes', user: 'Yes' },
  { label: 'Add, edit and delete lines, upload artwork', super_admin: 'Yes', manager: 'Yes', user: 'No' },
  { label: 'Change production status', super_admin: 'Yes', manager: 'Yes', user: 'No' },
  { label: 'Sign off', super_admin: 'Any stage', manager: 'Their stages', user: 'No' },
  { label: 'Create and manage events', super_admin: 'Yes', manager: 'Yes', user: 'No' },
  { label: 'Sponsors, suppliers, sign-off setup, dropdown lists', super_admin: 'Yes', manager: 'Yes', user: 'No' },
  { label: 'People, access levels, platform settings', super_admin: 'Yes', manager: 'No', user: 'No' },
];

export type PersonStatus = 'active' | 'invited' | 'invite_expired' | 'temp_password' | 'temp_expired' | 'deactivated';

export interface PersonLike {
  active: boolean;
  must_change_password: boolean;
  last_login_at: Date | string | null;
  temp_password_expires_at: Date | string | null;
}

/**
 * - invited: has never signed in; their temporary password still works
 * - invite_expired: has never signed in and the temporary password has run out
 * - temp_password / temp_expired: has signed in before, but an admin reset their password
 * - deactivated: can't sign in
 */
export function personStatus(u: PersonLike, now: Date = new Date()): PersonStatus {
  if (!u.active) return 'deactivated';
  if (!u.must_change_password) return 'active';
  const expired = !!u.temp_password_expires_at && new Date(u.temp_password_expires_at) < now;
  if (!u.last_login_at) return expired ? 'invite_expired' : 'invited';
  return expired ? 'temp_expired' : 'temp_password';
}

export const STATUS_INFO: Record<PersonStatus, { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'teal' },
  invited: { label: 'Invited', tone: 'blue' },
  invite_expired: { label: 'Invite expired', tone: 'red' },
  temp_password: { label: 'Temporary password', tone: 'amber' },
  temp_expired: { label: 'Temporary password expired', tone: 'red' },
  deactivated: { label: 'Deactivated', tone: 'grey' },
};

/** Never signed in, so the invite can be cancelled (the account is removed). */
export function canCancelInvite(u: PersonLike): boolean {
  return !u.last_login_at;
}
