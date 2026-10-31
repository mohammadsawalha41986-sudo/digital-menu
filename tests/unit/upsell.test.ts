import { describe, expect, it } from 'vitest';
import { effectiveRole, inferRole, suggestionsFor, type SuggestionCandidate } from '@/lib/upsell';

describe('reading a section’s role from its names', () => {
  it.each([
    ['beverages', 'المشروبات والإضافات', 'Beverages & Extras', 'DRINK'],
    ['juices', 'العصائر الطبيعية', 'Fresh Juices', 'DRINK'],
    ['appetizers', 'المقبلات والسلطات', 'Appetizers & Salads', 'SIDE'],
    ['potatoes', 'البطاطس والمقالي', 'Potatoes & Sides', 'SIDE'],
    ['shawarma', 'الشاورما', 'Shawarma', 'MAIN'],
    ['grills', 'المشويات على الفحم', 'Charcoal BBQ Grills', 'MAIN'],
    ['combos', 'عروض الكومبو والتوفير', 'Combos & Special Deals', 'MAIN'],
    ['sweets', 'الحلويات', 'Desserts', 'DESSERT'],
    ['misc', 'متفرقات', 'Misc', 'OTHER'],
  ])('%s reads as %s', (key, ar, en, role) => {
    expect(inferRole(key, ar, en)).toBe(role);
  });

  it('a section the restaurant set by hand overrides the names', () => {
    expect(effectiveRole('SIDE', 'المشروبات', 'Beverages')).toBe('SIDE');
    expect(effectiveRole(null, 'المشروبات', 'Beverages')).toBe('DRINK');
    expect(effectiveRole('NOT_A_ROLE', 'الشاورما')).toBe('MAIN');
  });
});

const dish = (id: string, role: SuggestionCandidate['role'], extra: Partial<SuggestionCandidate> = {}): SuggestionCandidate => ({
  id,
  role,
  featured: false,
  order: 0,
  orderable: true,
  ...extra,
});

describe('suggestions for a dish', () => {
  const menu = [
    dish('SHW-001', 'MAIN', { order: 0 }),
    dish('BEV-001', 'DRINK', { order: 0 }),
    dish('BEV-002', 'DRINK', { order: 1, featured: true }),
    dish('APP-001', 'SIDE', { order: 0 }),
    dish('DES-001', 'DESSERT', { order: 0 }),
  ];

  it('a main suggests one drink, one side and one dessert, the featured drink first', () => {
    expect(suggestionsFor(menu[0]!, menu)).toEqual(['BEV-002', 'APP-001', 'DES-001']);
  });

  it('a dish is never suggested with itself, and an unavailable dish is never suggested', () => {
    const pool = [dish('SHW-001', 'MAIN'), dish('BEV-001', 'DRINK', { orderable: false }), dish('APP-001', 'SIDE')];
    expect(suggestionsFor(pool[0]!, pool)).toEqual(['APP-001']);
  });

  it('gives the same answer every time, whatever order the menu is read in', () => {
    const forward = suggestionsFor(menu[0]!, menu);
    const backward = suggestionsFor(menu[0]!, [...menu].reverse());
    expect(backward).toEqual(forward);
  });

  it('a dish with nothing of the right role to offer gets fewer suggestions, never a wrong one', () => {
    const onlyMains = [dish('SHW-001', 'MAIN'), dish('SHW-002', 'MAIN')];
    expect(suggestionsFor(onlyMains[0]!, onlyMains)).toEqual([]);
  });

  it('a dessert suggests only a drink', () => {
    expect(suggestionsFor(menu[4]!, menu)).toEqual(['BEV-002']);
  });

  it('an OTHER dish suggests a drink only, not a guess at a side', () => {
    const pool = [dish('X-1', 'OTHER'), dish('APP-001', 'SIDE'), dish('BEV-001', 'DRINK')];
    expect(suggestionsFor(pool[0]!, pool)).toEqual(['BEV-001']);
  });

  it('caps the suggestions', () => {
    expect(suggestionsFor(menu[0]!, menu, 2)).toHaveLength(2);
  });
});
