/**
 * The rules of a staff link, kept free of any database or framework import so
 * they can be tested on their own.
 *
 * What a staff link may set on a dish: three states, because the three things
 * a busy floor needs to say are "it is on", "it is out right now", and "it is
 * not on the menu at all". SEASONAL is the restaurant's own decision and is not
 * offered to staff.
 */
export const STAFF_STATUSES = ['AVAILABLE', 'UNAVAILABLE', 'HIDDEN'] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];

export function isStaffStatus(value: string): value is StaffStatus {
  return (STAFF_STATUSES as readonly string[]).includes(value);
}

/** A seasonal dish is the restaurant's own decision: staff leave it alone. */
export function isStaffChangeable(current: string): boolean {
  return current !== 'SEASONAL';
}

export const STATUS_MESSAGE: Record<StaffStatus, string> = {
  AVAILABLE: 'Marked available',
  UNAVAILABLE: 'Marked out right now',
  HIDDEN: 'Hidden from the menu',
};
