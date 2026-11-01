import { describe, expect, it } from 'vitest';
import { STATUS_MESSAGE, STAFF_STATUSES, isStaffChangeable, isStaffStatus } from '@/server/staff/rules';

describe('staff link rules', () => {
  it('lets staff set exactly three states: available, out right now, hidden', () => {
    expect([...STAFF_STATUSES]).toEqual(['AVAILABLE', 'UNAVAILABLE', 'HIDDEN']);
    for (const status of STAFF_STATUSES) expect(isStaffStatus(status)).toBe(true);
  });

  it('refuses anything else that is posted, including the owner-only seasonal state', () => {
    for (const value of ['SEASONAL', 'DELETE', 'available', '', ' AVAILABLE', 'AVAILABLE; DROP']) {
      expect(isStaffStatus(value)).toBe(false);
    }
  });

  it('leaves a seasonal dish alone, and changes any other', () => {
    expect(isStaffChangeable('SEASONAL')).toBe(false);
    expect(isStaffChangeable('AVAILABLE')).toBe(true);
    expect(isStaffChangeable('UNAVAILABLE')).toBe(true);
    expect(isStaffChangeable('HIDDEN')).toBe(true);
  });

  it('says what happened in one short line for each state', () => {
    expect(STATUS_MESSAGE.AVAILABLE).toMatch(/available/i);
    expect(STATUS_MESSAGE.UNAVAILABLE).toMatch(/out/i);
    expect(STATUS_MESSAGE.HIDDEN).toMatch(/hidden/i);
  });
});
