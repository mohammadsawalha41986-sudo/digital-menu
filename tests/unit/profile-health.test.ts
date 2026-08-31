import { describe, expect, it } from 'vitest';
import {
  evaluateHealth,
  isFoodBusiness,
  scoreHealth,
  type HealthInput,
} from '@/server/quality/checks';

/** A profile with nothing wrong with it, which each test then breaks. */
function healthy(overrides: Partial<HealthInput> = {}): HealthInput {
  return {
    businessId: 'biz-1',
    publicId: 'ABC123',
    status: 'ACTIVE',
    type: 'RESTAURANT',
    nameAr: 'مطعم',
    nameEn: 'Restaurant',
    descriptionAr: 'وصف',
    descriptionEn: 'Description',
    hasLogo: true,
    hasOgImage: true,
    brandContrast: { text: 12, muted: 5 },
    phone: '+966500000000',
    whatsapp: '+966500000000',
    email: 'hello@example.test',
    googleMapsUrl: 'https://maps.example/1',
    addressAr: 'الرياض',
    socialCount: 2,
    hasWorkingHours: true,
    indexProfile: true,
    metaTitleAr: 'عنوان',
    metaDescriptionAr: 'وصف',
    branchCount: 1,
    branchesMissingAddress: 0,
    menus: [
      {
        key: 'main',
        id: 'menu-1',
        isPublished: true,
        hasUnpublishedChanges: false,
        categoryCount: 2,
        emptyCategories: [],
      },
    ],
    items: [
      {
        itemCode: 'A',
        nameAr: 'صنف',
        nameEn: 'Item',
        priceMinor: 4200,
        calories: 680,
        hasImage: true,
        hasImageAlt: true,
        descriptionAr: 'وصف',
        availability: 'AVAILABLE',
        isFeatured: true,
      },
    ],
    duplicateItemNames: [],
    externalLinks: [],
    publicFileCount: 1,
    ...overrides,
  };
}

const codes = (input: HealthInput) => evaluateHealth(input).map((finding) => finding.code);

describe('profile health — a complete profile', () => {
  it('finds nothing wrong with a complete profile', () => {
    expect(evaluateHealth(healthy())).toEqual([]);
  });

  it('scores a complete profile at 100 and does not block it', () => {
    const report = scoreHealth(evaluateHealth(healthy()));

    expect(report.score).toBe(100);
    expect(report.blocked).toBe(false);
    expect(report.byArea.every((area) => area.status === 'PASS')).toBe(true);
  });
});

describe('profile health — severities', () => {
  it('treats a missing price as an error, because a menu must be priced', () => {
    const findings = evaluateHealth(
      healthy({ items: [{ ...healthy().items[0]!, priceMinor: null }] }),
    );

    expect(findings.find((f) => f.code === 'menu.price_missing')?.severity).toBe('ERROR');
  });

  it('does not demand a price for a hidden item', () => {
    expect(
      codes(
        healthy({
          items: [{ ...healthy().items[0]!, priceMinor: null, availability: 'HIDDEN' }],
        }),
      ),
    ).not.toContain('menu.price_missing');
  });

  it('treats a missing photograph as information, not a failure', () => {
    const findings = evaluateHealth(
      healthy({ items: [{ ...healthy().items[0]!, hasImage: true, hasImageAlt: true }, { ...healthy().items[0]!, itemCode: 'B', hasImage: false }] }),
    );

    expect(findings.find((f) => f.code === 'images.item_missing')?.severity).toBe('INFO');
  });

  it('raises the severity when *no* item has a photograph', () => {
    const findings = evaluateHealth(
      healthy({ items: [{ ...healthy().items[0]!, hasImage: false }] }),
    );

    expect(findings.find((f) => f.code === 'images.item_missing')?.severity).toBe('WARNING');
  });

  it('never treats an Arabic-only business as broken', () => {
    // A business trading only in Arabic is a real business, not a mistake.
    const findings = evaluateHealth(
      healthy({ nameEn: null, descriptionEn: null }),
    );

    expect(findings.every((f) => f.severity !== 'ERROR')).toBe(true);
    expect(findings.map((f) => f.code)).toContain('content.english_absent');
  });

  it('flags items missing English only when the business is bilingual', () => {
    const bilingual = codes(
      healthy({ items: [{ ...healthy().items[0]!, nameEn: null }] }),
    );
    expect(bilingual).toContain('content.item_english_missing');

    const arabicOnly = codes(
      healthy({ nameEn: null, items: [{ ...healthy().items[0]!, nameEn: null }] }),
    );
    expect(arabicOnly).not.toContain('content.item_english_missing');
  });
});

describe('profile health — nutrition is reported, never invented', () => {
  it('reports missing calories for a food business as missing data', () => {
    const findings = evaluateHealth(
      healthy({ items: [{ ...healthy().items[0]!, calories: null }] }),
    );

    const finding = findings.find((f) => f.code === 'nutrition.calories_missing');

    expect(finding?.severity).toBe('WARNING');
    expect(finding?.message).toMatch(/never estimates/);
  });

  it('never claims compliance', () => {
    const findings = evaluateHealth(healthy({ items: [{ ...healthy().items[0]!, calories: null }] }));
    for (const finding of findings) {
      expect(finding.message).not.toMatch(/compliant/i);
      expect(finding.message).not.toMatch(/SFDA/i);
    }
  });

  it('asks nothing about calories from a salon', () => {
    expect(isFoodBusiness('SALON')).toBe(false);
    expect(
      codes(healthy({ type: 'SALON', items: [{ ...healthy().items[0]!, calories: null }] })),
    ).not.toContain('nutrition.calories_missing');
  });
});

describe('profile health — publishing', () => {
  it('treats a never-published menu as an error', () => {
    const findings = evaluateHealth(
      healthy({ menus: [{ ...healthy().menus[0]!, isPublished: false }] }),
    );

    expect(findings.find((f) => f.code === 'publishing.never_published')?.severity).toBe('ERROR');
  });

  it('flags edits that are not live, and links to the comparison screen', () => {
    const finding = evaluateHealth(
      healthy({ menus: [{ ...healthy().menus[0]!, hasUnpublishedChanges: true }] }),
    ).find((f) => f.code === 'publishing.unpublished_changes');

    expect(finding?.severity).toBe('WARNING');
    expect(finding?.fixPath).toBe('/admin/businesses/biz-1/menus/menu-1/versions');
  });

  it('says plainly that a draft business is invisible', () => {
    const finding = evaluateHealth(healthy({ status: 'DRAFT' })).find(
      (f) => f.code === 'publishing.business_not_active',
    );

    expect(finding?.severity).toBe('ERROR');
    expect(finding?.message).toMatch(/not found/);
  });
});

describe('profile health — every finding is actionable', () => {
  it('gives every finding a route to the screen that fixes it', () => {
    const broken = healthy({
      hasLogo: false,
      phone: null,
      whatsapp: null,
      hasWorkingHours: false,
      status: 'DRAFT',
      indexProfile: true,
      metaDescriptionAr: null,
      publicFileCount: 0,
      socialCount: 0,
      googleMapsUrl: null,
      addressAr: null,
      branchesMissingAddress: 2,
      duplicateItemNames: ['Chicken Burger'],
      externalLinks: [{ label: 'Delivery', url: 'https://x.test', status: 'broken' }],
      menus: [{ ...healthy().menus[0]!, isPublished: false, emptyCategories: ['drinks'] }],
      items: [
        {
          itemCode: 'A',
          nameAr: 'صنف',
          nameEn: null,
          priceMinor: null,
          calories: null,
          hasImage: false,
          hasImageAlt: false,
          descriptionAr: null,
          availability: 'UNAVAILABLE',
          isFeatured: true,
        },
      ],
    });

    const findings = evaluateHealth(broken);

    expect(findings.length).toBeGreaterThan(10);
    for (const finding of findings) {
      expect(finding.fixPath, finding.code).toBeTruthy();
      expect(finding.message.length, finding.code).toBeGreaterThan(10);
      // Messages are for operators, not for developers.
      expect(finding.message, finding.code).not.toMatch(/null|undefined|\bid\b/);
    }
  });

  it('every finding names a known area', () => {
    const findings = evaluateHealth(healthy({ hasLogo: false, hasWorkingHours: false }));
    const report = scoreHealth(findings);

    for (const finding of findings) {
      expect(report.byArea.map((a) => a.area)).toContain(finding.area);
    }
  });
});

describe('profile health — scoring', () => {
  it('makes one missing price cost more than many missing photographs', () => {
    const noPrice = scoreHealth(
      evaluateHealth(healthy({ items: [{ ...healthy().items[0]!, priceMinor: null }] })),
    );

    const noPhotos = scoreHealth(
      evaluateHealth(
        healthy({
          items: Array.from({ length: 12 }, (_, index) => ({
            ...healthy().items[0]!,
            itemCode: `I${index}`,
            hasImage: false,
            hasImageAlt: false,
          })),
        }),
      ),
    );

    expect(noPrice.score).toBeLessThan(noPhotos.score);
  });

  it('never falls below zero, however many findings there are', () => {
    // Enough errors to overshoot the penalty budget several times over.
    const findings = Array.from({ length: 40 }, (_, index) => ({
      code: `synthetic.${index}`,
      severity: 'ERROR' as const,
      area: 'menu' as const,
      message: 'Synthetic finding used to exercise the clamp.',
    }));

    expect(scoreHealth(findings).score).toBe(0);
  });

  it('scores a badly broken profile low without going negative', () => {
    const report = scoreHealth(
      evaluateHealth(
        healthy({
          hasLogo: false,
          status: 'DRAFT',
          phone: null,
          whatsapp: null,
          menus: [],
          items: [],
          brandContrast: { text: 1.2, muted: 1.1 },
        }),
      ),
    );

    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThan(50);
    expect(report.blocked).toBe(true);
  });

  it('blocks on errors and only on errors', () => {
    expect(scoreHealth(evaluateHealth(healthy({ hasWorkingHours: false }))).blocked).toBe(false);
    expect(scoreHealth(evaluateHealth(healthy({ hasLogo: false }))).blocked).toBe(true);
  });

  it('sorts the most severe finding first', () => {
    const report = scoreHealth(
      evaluateHealth(healthy({ hasLogo: false, socialCount: 0, hasWorkingHours: false })),
    );

    expect(report.findings[0]?.severity).toBe('ERROR');
    expect(report.findings.at(-1)?.severity).toBe('INFO');
  });

  it('marks an area with an error as ERROR and an untouched one as PASS', () => {
    const report = scoreHealth(evaluateHealth(healthy({ hasLogo: false })));

    expect(report.byArea.find((a) => a.area === 'brand')?.status).toBe('ERROR');
    expect(report.byArea.find((a) => a.area === 'menu')?.status).toBe('PASS');
  });
});

describe('profile health — data quality', () => {
  it('reports possible duplicates for review rather than merging them', () => {
    const finding = evaluateHealth(healthy({ duplicateItemNames: ['Chicken Burger'] })).find(
      (f) => f.code === 'menu.duplicate_names',
    );

    expect(finding?.message).toMatch(/Review rather than merge/);
  });

  it('flags a featured item nobody can order', () => {
    expect(
      codes(healthy({ items: [{ ...healthy().items[0]!, availability: 'UNAVAILABLE' }] })),
    ).toContain('menu.featured_unavailable');
  });

  it('treats a broken external link as an error and an unchecked one as information', () => {
    const findings = evaluateHealth(
      healthy({
        externalLinks: [
          { label: 'Delivery', url: 'https://a.test', status: 'broken' },
          { label: 'Booking', url: 'https://b.test', status: 'unchecked' },
        ],
      }),
    );

    expect(findings.find((f) => f.code === 'links.broken')?.severity).toBe('ERROR');
    expect(findings.find((f) => f.code === 'links.unchecked')?.severity).toBe('INFO');
  });
});
