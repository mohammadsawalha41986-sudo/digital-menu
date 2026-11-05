import { describe, expect, it } from 'vitest';
import { matchesSearch, normalizeSearchText } from '@/lib/search-text';

describe('normalizeSearchText', () => {
  it('unifies the hamza forms of alef', () => {
    expect(normalizeSearchText('أحمد')).toBe(normalizeSearchText('احمد'));
    expect(normalizeSearchText('إآٱ')).toBe('ااا');
  });
  it('treats ة as ه, ى as ي, ؤ as و and ئ as ي', () => {
    expect(normalizeSearchText('وجبة')).toBe(normalizeSearchText('وجبه'));
    expect(normalizeSearchText('مستشفى')).toBe('مستشفي');
    expect(normalizeSearchText('مؤن')).toBe('مون');
    expect(normalizeSearchText('جبنة رومي شائع')).toBe('جبنه رومي شايع');
  });
  it('strips tashkeel and tatweel', () => {
    expect(normalizeSearchText('مَشوي')).toBe('مشوي');
    expect(normalizeSearchText('شـاورمـا')).toBe('شاورما');
  });
  it('turns Arabic-Indic digits into Latin ones', () => {
    expect(normalizeSearchText('٣')).toBe('3');
    expect(normalizeSearchText('وجبة ١٢')).toBe('وجبه 12');
    expect(normalizeSearchText('۴')).toBe('4');
  });
  it('folds case and collapses spaces', () => {
    expect(normalizeSearchText('  Chicken   SHAWARMA ')).toBe('chicken shawarma');
  });
});

describe('matchesSearch', () => {
  it('finds a dish whichever field and spelling matches', () => {
    expect(matchesSearch('وجبه', ['وجبة شاورما', 'Shawarma meal'])).toBe(true);
    expect(matchesSearch('shawarma', ['وجبة شاورما', 'Shawarma meal'])).toBe(true);
    expect(matchesSearch('برجر', ['وجبة شاورما', null, undefined])).toBe(false);
  });
  it('matches everything for an empty query', () => {
    expect(matchesSearch('   ', ['x'])).toBe(true);
  });
});
