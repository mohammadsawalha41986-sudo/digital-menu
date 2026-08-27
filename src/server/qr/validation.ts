import { contrastRatio, relativeLuminance } from '@/design/brand';

/**
 * QR readability validation (master spec §13).
 *
 * A QR printed in a business's brand colours can look beautiful and scan
 * badly. These checks run *before* a download so staff are warned while it is
 * still cheap to fix, rather than after a thousand table cards are printed.
 *
 * Thresholds come from the physics of the symbol, not from taste:
 *  - Contrast: scanners threshold the image; ISO/IEC 18004 guidance and every
 *    practical reader wants a clear light/dark separation. 3:1 is the point
 *    below which cheap phone cameras start failing in poor light; 4.5:1 is the
 *    comfortable floor we recommend.
 *  - Quiet zone: four modules of clear margin on every side. Below that,
 *    finder-pattern detection degrades sharply.
 *  - Module size: a printed module below ~0.4mm is unreliable at normal
 *    scanning distance; at 25mm total for a typical version-3 symbol that is
 *    the practical minimum print size.
 */

export type QrIssueLevel = 'error' | 'warning';

export interface QrIssue {
  code: string;
  level: QrIssueLevel;
  /** Operator-facing English; the admin UI localises by code. */
  message: string;
}

export interface QrValidationInput {
  /** Colour of the dark modules. */
  foreground: string;
  /** Colour behind the symbol. */
  background: string;
  /** Quiet-zone width in modules. */
  quietZoneModules: number;
  /** Rendered symbol size in pixels (or the print size in px at 300dpi). */
  sizePx: number;
  /** True when a logo is composited over the centre. */
  hasLogo: boolean;
  /** Fraction of the symbol area the logo covers, 0–1. */
  logoCoverage?: number;
  /** Error-correction level the symbol was encoded at. */
  errorCorrection: 'L' | 'M' | 'Q' | 'H';
}

export interface QrValidationResult {
  ok: boolean;
  issues: QrIssue[];
  contrast: number;
}

export const MIN_CONTRAST_RATIO = 3;
export const RECOMMENDED_CONTRAST_RATIO = 4.5;
export const MIN_QUIET_ZONE_MODULES = 4;
export const MIN_SIZE_PX = 256;

/** Maximum fraction of the symbol a centre logo may cover, per EC level. */
const MAX_LOGO_COVERAGE: Record<QrValidationInput['errorCorrection'], number> = {
  L: 0.02,
  M: 0.05,
  Q: 0.1,
  H: 0.16,
};

export function validateQr(input: QrValidationInput): QrValidationResult {
  const issues: QrIssue[] = [];
  const contrast = contrastRatio(input.foreground, input.background);

  if (contrast < MIN_CONTRAST_RATIO) {
    issues.push({
      code: 'contrast_too_low',
      level: 'error',
      message: `Contrast ${contrast.toFixed(2)}:1 is below the ${MIN_CONTRAST_RATIO}:1 minimum; this code may not scan.`,
    });
  } else if (contrast < RECOMMENDED_CONTRAST_RATIO) {
    issues.push({
      code: 'contrast_low',
      level: 'warning',
      message: `Contrast ${contrast.toFixed(2)}:1 is below the recommended ${RECOMMENDED_CONTRAST_RATIO}:1; scanning may be unreliable in low light.`,
    });
  }

  // Inverted symbols (light modules on a dark ground) defeat many readers even
  // at high contrast, because finder-pattern detection assumes dark-on-light.
  if (relativeLuminance(input.foreground) > relativeLuminance(input.background)) {
    issues.push({
      code: 'inverted',
      level: 'error',
      message: 'The code is lighter than its background; many scanners require dark modules on a light ground.',
    });
  }

  if (input.quietZoneModules < MIN_QUIET_ZONE_MODULES) {
    issues.push({
      code: 'quiet_zone_too_small',
      level: 'error',
      message: `Quiet zone of ${input.quietZoneModules} modules is below the required ${MIN_QUIET_ZONE_MODULES}.`,
    });
  }

  if (input.sizePx < MIN_SIZE_PX) {
    issues.push({
      code: 'size_too_small',
      level: 'warning',
      message: `Rendered size ${input.sizePx}px is below ${MIN_SIZE_PX}px; print quality will suffer.`,
    });
  }

  if (input.hasLogo) {
    const coverage = input.logoCoverage ?? 0;
    const maximum = MAX_LOGO_COVERAGE[input.errorCorrection];

    if (coverage > maximum) {
      issues.push({
        code: 'logo_too_large',
        level: 'error',
        message: `A logo covering ${(coverage * 100).toFixed(0)}% exceeds what error-correction level ${input.errorCorrection} can recover (${(maximum * 100).toFixed(0)}%).`,
      });
    }

    if (input.errorCorrection === 'L' || input.errorCorrection === 'M') {
      issues.push({
        code: 'logo_needs_higher_ec',
        level: 'warning',
        message: 'Codes with a centre logo should be encoded at error-correction level Q or H.',
      });
    }
  }

  return {
    ok: issues.every((issue) => issue.level !== 'error'),
    issues,
    contrast,
  };
}
