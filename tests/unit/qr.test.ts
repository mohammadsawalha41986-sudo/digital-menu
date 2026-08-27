import { beforeEach, describe, expect, it } from 'vitest';
import {
  QrDestinationError,
  assertPermanentDestination,
  buildQrDestination,
  isValidBranchKey,
} from '@/server/qr/destination';
import { validateQr } from '@/server/qr/validation';
import { renderQr } from '@/server/qr/service';
import { resetEnvCache } from '@/lib/env';

beforeEach(() => {
  process.env.PUBLIC_URL = 'https://menu.example.com';
  process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/db';
  resetEnvCache();
});

describe('QR destinations', () => {
  it('encodes the permanent profile path and nothing else', () => {
    expect(buildQrDestination({ publicId: '7XK92A' })).toBe(
      'https://menu.example.com/m/7XK92A',
    );
    expect(buildQrDestination({ publicId: '7XK92A', branchKey: 'olaya' })).toBe(
      'https://menu.example.com/m/7XK92A/b/olaya',
    );
  });

  it('refuses to encode an invalid identifier', () => {
    expect(() => buildQrDestination({ publicId: '18473' })).toThrow(QrDestinationError);
    expect(() => buildQrDestination({ publicId: '7XK92A', branchKey: '../etc' })).toThrow(
      QrDestinationError,
    );
  });

  it('validates branch keys as stable path segments', () => {
    expect(isValidBranchKey('olaya')).toBe(true);
    expect(isValidBranchKey('kf-01')).toBe(true);
    expect(isValidBranchKey('-leading')).toBe(false);
    expect(isValidBranchKey('Upper')).toBe(false);
    expect(isValidBranchKey('with space')).toBe(false);
  });
});

describe('permanence invariant', () => {
  it('accepts the two permanent shapes', () => {
    expect(() => assertPermanentDestination('https://menu.example.com/m/7XK92A')).not.toThrow();
    expect(() =>
      assertPermanentDestination('https://menu.example.com/m/7XK92A/b/olaya'),
    ).not.toThrow();
  });

  it('rejects a destination that points straight at a file (master spec §10)', () => {
    for (const bad of [
      'https://menu.example.com/menu.pdf',
      'https://cdn.example.com/uploads/menu-2026.pdf',
      'https://menu.example.com/m/7XK92A.png',
    ]) {
      expect(() => assertPermanentDestination(bad), bad).toThrow(QrDestinationError);
    }
  });

  it('rejects mortal state in the payload', () => {
    // A locale, campaign or version baked into the code would break the moment
    // it changed — exactly what the permanent-QR rule forbids (GOALS I2).
    for (const bad of [
      'https://menu.example.com/m/7XK92A?lang=en',
      'https://menu.example.com/m/7XK92A?v=3',
      'https://menu.example.com/m/7XK92A#offers',
      'https://menu.example.com/ar/m/7XK92A',
      'https://menu.example.com/m/7XK92A/template/editorial',
    ]) {
      expect(() => assertPermanentDestination(bad), bad).toThrow(QrDestinationError);
    }
  });

  it('requires HTTPS outside local development', () => {
    expect(() => assertPermanentDestination('http://menu.example.com/m/7XK92A')).toThrow(
      QrDestinationError,
    );
    expect(() => assertPermanentDestination('http://localhost:3000/m/7XK92A')).not.toThrow();
  });
});

describe('QR readability validation (master spec §13)', () => {
  const base = {
    foreground: '#111111',
    background: '#FFFFFF',
    quietZoneModules: 4,
    sizePx: 512,
    hasLogo: false,
    errorCorrection: 'M' as const,
  };

  it('passes a well-formed symbol', () => {
    const result = validateQr(base);
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('fails a low-contrast brand palette', () => {
    const result = validateQr({ ...base, foreground: '#C9A227', background: '#E6DDD1' });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('contrast_too_low');
  });

  it('warns on marginal contrast without blocking', () => {
    const result = validateQr({ ...base, foreground: '#8A8A8A', background: '#FFFFFF' });
    expect(result.ok).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toContain('contrast_low');
  });

  it('rejects an inverted symbol even at high contrast', () => {
    const result = validateQr({ ...base, foreground: '#FFFFFF', background: '#111111' });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('inverted');
  });

  it('enforces the quiet zone', () => {
    const result = validateQr({ ...base, quietZoneModules: 2 });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('quiet_zone_too_small');
  });

  it('warns below the practical print size', () => {
    const result = validateQr({ ...base, sizePx: 120 });
    expect(result.issues.map((issue) => issue.code)).toContain('size_too_small');
  });

  it('limits logo coverage to what the error-correction level can recover', () => {
    const tooBig = validateQr({
      ...base,
      hasLogo: true,
      logoCoverage: 0.3,
      errorCorrection: 'H',
    });
    expect(tooBig.ok).toBe(false);

    const acceptable = validateQr({
      ...base,
      hasLogo: true,
      logoCoverage: 0.05,
      errorCorrection: 'H',
    });
    expect(acceptable.ok).toBe(true);
  });
});

describe('QR rendering', () => {
  it('produces an SVG for the permanent destination', async () => {
    const result = await renderQr({ publicId: '7XK92A' });

    expect(result.destination).toBe('https://menu.example.com/m/7XK92A');
    expect(result.svg).toContain('<svg');
    expect(result.validation.ok).toBe(true);
  });

  it('encodes the identical payload for every artwork style', async () => {
    const styles = ['plain', 'with-logo', 'with-name', 'with-prompt'] as const;

    const destinations = await Promise.all(
      styles.map(async (artwork) => {
        const result = await renderQr({
          publicId: '7XK92A',
          artwork,
          captionPrimary: 'مطعم النموذج',
          captionSecondary: 'امسح لعرض المنيو',
          direction: 'rtl',
        });
        return result.destination;
      }),
    );

    // Artwork is presentation; the payload is the contract (GOALS I2).
    expect(new Set(destinations).size).toBe(1);
  });

  it('escapes business-authored caption text', async () => {
    const result = await renderQr({
      publicId: '7XK92A',
      artwork: 'with-name',
      captionPrimary: '<script>alert(1)</script>',
    });

    expect(result.svg).not.toContain('<script>');
    expect(result.svg).toContain('&lt;script&gt;');
  });

  it('raises the error-correction level automatically for a logo', async () => {
    const result = await renderQr({
      publicId: '7XK92A',
      artwork: 'with-logo',
      logoDataUri: 'data:image/png;base64,iVBORw0KGgo=',
    });

    expect(result.validation.ok).toBe(true);
    expect(result.svg).toContain('<image');
  });

  it('reports a brand palette that would not scan, rather than silently fixing it', async () => {
    const result = await renderQr({
      publicId: '7XK92A',
      foreground: '#C9A227',
      background: '#E6DDD1',
    });

    expect(result.validation.ok).toBe(false);
    // It still renders: staff see the preview and the warning together.
    expect(result.svg).toContain('<svg');
  });

  it('refuses to render for an invalid identifier', async () => {
    await expect(renderQr({ publicId: '18473' })).rejects.toThrow(QrDestinationError);
  });
});
