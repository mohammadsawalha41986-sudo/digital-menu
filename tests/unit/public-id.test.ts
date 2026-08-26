import { describe, expect, it } from 'vitest';
import {
  PUBLIC_ID_LENGTH,
  generatePublicId,
  isValidPublicId,
  normalizePublicId,
  parsePublicId,
} from '@/lib/public-id';

describe('public identifiers', () => {
  it('generates ids of the configured length from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i += 1) {
      const id = generatePublicId();
      expect(id).toHaveLength(PUBLIC_ID_LENGTH);
      expect(isValidPublicId(id)).toBe(true);
      // I, L, O and U are excluded so printed codes cannot be misread.
      expect(id).not.toMatch(/[ILOU]/);
    }
  });

  it('produces distinct ids', () => {
    const ids = new Set(Array.from({ length: 500 }, () => generatePublicId()));
    expect(ids.size).toBeGreaterThan(495);
  });

  it('rejects sequential database ids, the thing public ids exist to prevent', () => {
    // master spec §122: `/m/18473` must never be a valid public identifier.
    expect(parsePublicId('18473')).toBeNull();
    expect(parsePublicId('1')).toBeNull();
    expect(parsePublicId('cuid_abc123')).toBeNull();
  });

  it('repairs confusable characters a human might type', () => {
    expect(normalizePublicId('7xk92a')).toBe('7XK92A');
    expect(normalizePublicId('0O1I')).toBe('0011');
    expect(normalizePublicId(' 7xk92a ')).toBe('7XK92A');
  });

  it('rejects malformed input before it can reach the database', () => {
    for (const input of ['', '7XK9', '7XK92AB', "7XK92A'--", '../../etc/passwd', '7XK 92A']) {
      expect(parsePublicId(input)).toBeNull();
    }
  });

  it('accepts a well-formed identifier', () => {
    expect(parsePublicId('7XK92A')).toBe('7XK92A');
    expect(parsePublicId('demo01')).toBe('DEM001');
  });
});
