import { describe, expect, it } from 'vitest';
import { matchPhoto, normaliseName } from '@/lib/photo-match';

const dishes = [
  { code: 'BK-010', names: ['كرواسون زبدة', 'Butter croissant'] },
  { code: 'BK-011', names: ['بان أو شوكولا', 'Pain au chocolat'] },
  { code: 'SHW-001', names: ['شاورما عربي', 'Arabic shawarma'] },
  { code: 'SHW-002', names: ['شاورما تركي', 'Turkish shawarma'] },
  { code: 'JU-1', names: ['عصير برتقال طازج', 'Fresh orange juice'] },
];

describe('photo matching', () => {
  it('folds Arabic letter variants, marks and separators', () => {
    expect(normaliseName('عَصِيرُ_برتقالة-طازجة.JPG')).toBe('عصير برتقاله طازجه');
    expect(normaliseName('إفطار  آخر.png')).toBe('افطار اخر');
  });

  it('matches by dish code anywhere in the name', () => {
    expect(matchPhoto('BK-010.jpg', dishes)).toBe('BK-010');
    expect(matchPhoto('bk-011 final.webp', dishes)).toBe('BK-011');
    // A code inside a longer code is not that code.
    expect(matchPhoto('XBK-0100.jpg', dishes)).toBeNull();
  });

  it('matches by the Arabic or English dish name', () => {
    expect(matchPhoto('كرواسون زبده.jpeg', dishes)).toBe('BK-010');
    expect(matchPhoto('Pain-au-chocolat.PNG', dishes)).toBe('BK-011');
    expect(matchPhoto('بان او شوكولا.jpg', dishes)).toBe('BK-011');
  });

  it('accepts a name that contains exactly one dish', () => {
    expect(matchPhoto('صورة عصير برتقال طازج 2.jpg', dishes)).toBe('JU-1');
  });

  it('leaves an ambiguous or unknown name for the owner to pick', () => {
    expect(matchPhoto('شاورما.jpg', dishes)).toBeNull();
    expect(matchPhoto('IMG_4032.jpg', dishes)).toBeNull();
    expect(matchPhoto('.jpg', dishes)).toBeNull();
  });
});
