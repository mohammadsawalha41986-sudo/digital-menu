import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { getPublicProfile } from '@/server/profile/repository';
import { renderQr } from '@/server/qr/service';
import { resetEnvCache } from '@/lib/env';
import { parseSpreadsheet } from '@/server/import/parse';
import { validateRows } from '@/server/import/validate';
import { executeImport, rollbackImport } from '@/server/import/execute';
import { buildImportTemplate, exportMenu } from '@/server/import/export';
import { TenantAccessError, type AuthenticatedUser } from '@/server/tenancy/context';

/**
 * THE BULK-EDIT ROUND TRIP (master spec §67, §66, §76).
 *
 *   export → edit a price in the file → re-import → the item is updated,
 *   not duplicated → price history records both values → rollback restores
 *   the original → and the QR never moves.
 *
 * This is the workflow the spec is built around, exercised through the real
 * spreadsheet writer and reader rather than a fixture object.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });

const databaseReachable = await prisma
  .$queryRaw`SELECT 1`
  .then(() => true)
  .catch(() => false);

const PUBLIC_ID = 'SHT001';
let businessId = '';
let user: AuthenticatedUser = { id: '', role: 'STAFF' };
let outsider: AuthenticatedUser = { id: '', role: 'STAFF' };

const OWNER_EMAIL = 'xls-owner@example.test';
const OTHER_EMAIL = 'xls-other@example.test';

beforeAll(async () => {
  process.env.PUBLIC_URL = 'https://menu.example.com';
  resetEnvCache();

  if (!databaseReachable) return;
  await cleanup();

  const business = await prisma.business.create({
    data: {
      publicId: PUBLIC_ID,
      slug: 'xls-fixture',
      type: 'RESTAURANT',
      status: 'ACTIVE',
      currency: 'SAR',
      nameAr: 'مطعم الجداول',
      nameEn: 'Spreadsheet Fixture',
    },
  });

  businessId = business.id;

  const menu = await prisma.menu.create({
    data: {
      businessId,
      key: 'main',
      status: 'ACTIVE',
      titleAr: 'المنيو',
      categories: {
        create: {
          businessId,
          key: 'burgers',
          nameAr: 'برجر',
          nameEn: 'Burgers',
          items: {
            create: [
              {
                businessId,
                itemCode: 'BG-001',
                nameAr: 'برجر دجاج',
                nameEn: 'Chicken Burger',
                priceMinor: 3800,
                calories: 680,
              },
              {
                businessId,
                itemCode: 'BG-002',
                nameAr: 'برجر لحم',
                nameEn: 'Beef Burger',
                priceMinor: 4500,
              },
            ],
          },
        },
      },
    },
  });

  const version = await prisma.menuVersion.create({
    data: { menuId: menu.id, version: 1, publishedAt: new Date() },
  });
  await prisma.menu.update({ where: { id: menu.id }, data: { currentVersionId: version.id } });

  const [owner, other] = await Promise.all([
    prisma.user.create({ data: { email: OWNER_EMAIL, name: 'Owner', role: 'STAFF' } }),
    prisma.user.create({ data: { email: OTHER_EMAIL, name: 'Other', role: 'STAFF' } }),
  ]);

  user = { id: owner.id, role: 'STAFF' };
  outsider = { id: other.id, role: 'STAFF' };

  await prisma.businessMembership.create({
    data: { userId: owner.id, businessId, role: 'OWNER' },
  });
});

afterAll(async () => {
  if (databaseReachable) await cleanup();
  await prisma.$disconnect();
});

async function cleanup() {
  await prisma.business.deleteMany({ where: { publicId: PUBLIC_ID } });
  await prisma.user.deleteMany({ where: { email: { in: [OWNER_EMAIL, OTHER_EMAIL] } } });
}

async function priceOf(itemCode: string) {
  const item = await prisma.menuItem.findUnique({
    where: { businessId_itemCode: { businessId, itemCode } },
    select: { priceMinor: true },
  });
  return item?.priceMinor ?? null;
}

/** Runs a spreadsheet through the whole pipeline, as the admin wizard does. */
async function importFile(bytes: Uint8Array, fileName: string, edit?: (row: string[]) => void) {
  const parsed = await parseSpreadsheet(bytes, fileName);

  if (edit) parsed.rows.forEach(edit);

  const validation = validateRows({
    currency: 'SAR',
    mapping: parsed.suggestedMapping,
    rows: parsed.rows,
    rowNumbers: parsed.rowNumbers,
  });

  const result = await executeImport(user, businessId, {
    fileName,
    defaultMenuKey: 'main',
    mapping: parsed.suggestedMapping,
    duplicateStrategy: 'update',
    rows: validation.rows,
  });

  return { parsed, validation, result };
}

describe.skipIf(!databaseReachable)('the template', () => {
  it('is itself a valid import file', async () => {
    const template = await buildImportTemplate();
    const parsed = await parseSpreadsheet(template.bytes, template.fileName);

    // Every column in the template maps back to a known field — a template
    // whose own headers do not auto-map would be a trap.
    expect(Object.keys(parsed.suggestedMapping)).toHaveLength(parsed.headers.length);
    expect(Object.values(parsed.suggestedMapping)).toContain('price');
    expect(parsed.rows).toHaveLength(1);
  });
});

describe.skipIf(!databaseReachable)('export → edit → import', () => {
  it('exports an import-shaped file carrying the item codes', async () => {
    const exported = await exportMenu(user, businessId, { audience: 'admin', format: 'xlsx' });
    const parsed = await parseSpreadsheet(exported.bytes, exported.fileName);

    expect(Object.values(parsed.suggestedMapping)).toContain('item_id');
    expect(parsed.rows).toHaveLength(2);

    const codeColumn = Number(
      Object.entries(parsed.suggestedMapping).find(([, key]) => key === 'item_id')?.[0],
    );
    expect(parsed.rows.map((row) => row[codeColumn])).toEqual(['BG-001', 'BG-002']);
  });

  it('updates rather than duplicating when the edited file is re-imported (§67)', async () => {
    expect(await priceOf('BG-001')).toBe(3800);

    const exported = await exportMenu(user, businessId, { audience: 'admin', format: 'xlsx' });
    const parsed = await parseSpreadsheet(exported.bytes, exported.fileName);

    const priceColumn = Number(
      Object.entries(parsed.suggestedMapping).find(([, key]) => key === 'price')?.[0],
    );
    const codeColumn = Number(
      Object.entries(parsed.suggestedMapping).find(([, key]) => key === 'item_id')?.[0],
    );

    const { result } = await importFile(exported.bytes, exported.fileName, (row) => {
      // The spec's own worked example: 38 → 42.
      if (row[codeColumn] === 'BG-001') row[priceColumn] = '42';
    });

    expect(result.updated).toBe(2);
    expect(result.created).toBe(0);
    expect(await priceOf('BG-001')).toBe(4200);

    // No duplicate rows were created.
    const count = await prisma.menuItem.count({ where: { businessId } });
    expect(count).toBe(2);
  });

  it('records both prices in history (§124)', async () => {
    const history = await prisma.priceHistory.findMany({
      where: { businessId, itemCode: 'BG-001' },
      orderBy: { createdAt: 'desc' },
    });

    expect(history[0]?.oldPriceMinor).toBe(3800);
    expect(history[0]?.newPriceMinor).toBe(4200);
    expect(history[0]?.currency).toBe('SAR');
  });

  it('serves the new price behind the unchanged QR', async () => {
    const qr = await renderQr({ publicId: PUBLIC_ID });
    expect(qr.destination).toBe(`https://menu.example.com/m/${PUBLIC_ID}`);

    const profile = await getPublicProfile(PUBLIC_ID);
    const item = profile?.menus[0]?.categories
      .flatMap((category) => category.items)
      .find((entry) => entry.code === 'BG-001');

    expect(item?.priceMinor).toBe(4200);
  });

  it('exports CSV as well as XLSX', async () => {
    const csv = await exportMenu(user, businessId, { audience: 'admin', format: 'csv' });
    expect(csv.contentType).toContain('text/csv');

    const parsed = await parseSpreadsheet(csv.bytes, csv.fileName);
    expect(parsed.rows).toHaveLength(2);
  });

  it('omits internal item codes from a client export (§79)', async () => {
    const client = await exportMenu(user, businessId, { audience: 'client', format: 'xlsx' });
    const parsed = await parseSpreadsheet(client.bytes, client.fileName);

    expect(parsed.headers).not.toContain('item_id');
  });
});

describe.skipIf(!databaseReachable)('rollback (§76, §126)', () => {
  it('restores the previous prices and removes rows the batch created', async () => {
    const before = await priceOf('BG-001');

    const exported = await exportMenu(user, businessId, { audience: 'admin', format: 'xlsx' });
    const parsed = await parseSpreadsheet(exported.bytes, exported.fileName);

    const priceColumn = Number(
      Object.entries(parsed.suggestedMapping).find(([, key]) => key === 'price')?.[0],
    );
    const codeColumn = Number(
      Object.entries(parsed.suggestedMapping).find(([, key]) => key === 'item_id')?.[0],
    );
    const categoryColumn = Number(
      Object.entries(parsed.suggestedMapping).find(([, key]) => key === 'category_ar')?.[0],
    );
    const nameColumn = Number(
      Object.entries(parsed.suggestedMapping).find(([, key]) => key === 'item_name_ar')?.[0],
    );

    // A bulk raise plus one brand-new item.
    const rows = parsed.rows.map((row) => {
      const copy = [...row];
      copy[priceColumn] = '99';
      return copy;
    });

    const newRow = new Array(parsed.headers.length).fill('');
    newRow[codeColumn] = 'BG-NEW';
    newRow[categoryColumn] = 'برجر';
    newRow[nameColumn] = 'برجر جديد';
    newRow[priceColumn] = '55';
    rows.push(newRow);

    const validation = validateRows({
      currency: 'SAR',
      mapping: parsed.suggestedMapping,
      rows,
      rowNumbers: rows.map((_, index) => index + 2),
    });

    const result = await executeImport(user, businessId, {
      fileName: 'bulk.xlsx',
      defaultMenuKey: 'main',
      mapping: parsed.suggestedMapping,
      duplicateStrategy: 'update',
      rows: validation.rows,
    });

    expect(result.updated).toBe(2);
    expect(result.created).toBe(1);
    expect(await priceOf('BG-001')).toBe(9900);
    expect(await priceOf('BG-NEW')).toBe(5500);

    const undo = await rollbackImport(user, businessId, result.batchId);

    expect(undo.restored).toBe(2);
    expect(undo.removed).toBe(1);
    expect(await priceOf('BG-001')).toBe(before);
    expect(await priceOf('BG-NEW')).toBeNull();
  });

  it('refuses to roll the same batch back twice', async () => {
    const batch = await prisma.importBatch.findFirstOrThrow({
      where: { businessId, status: 'ROLLED_BACK' },
      select: { id: true },
    });

    await expect(rollbackImport(user, businessId, batch.id)).rejects.toThrow(
      /already been rolled back/,
    );
  });
});

describe.skipIf(!databaseReachable)('partial import (§64)', () => {
  it('imports the good rows and reports the bad ones', async () => {
    const parsed = await parseSpreadsheet(
      (await exportMenu(user, businessId, { audience: 'admin', format: 'xlsx' })).bytes,
      'partial.xlsx',
    );

    const priceColumn = Number(
      Object.entries(parsed.suggestedMapping).find(([, key]) => key === 'price')?.[0],
    );

    const rows = parsed.rows.map((row) => [...row]);
    const broken = rows[0];
    if (broken) broken[priceColumn] = 'ask the manager';

    const validation = validateRows({
      currency: 'SAR',
      mapping: parsed.suggestedMapping,
      rows,
      rowNumbers: rows.map((_, index) => index + 2),
    });

    const result = await executeImport(user, businessId, {
      fileName: 'partial.xlsx',
      defaultMenuKey: 'main',
      mapping: parsed.suggestedMapping,
      duplicateStrategy: 'update',
      rows: validation.rows,
    });

    expect(result.errors).toBe(1);
    expect(result.updated).toBe(1);

    // The failing row is recorded with what was wrong (§63).
    const errorRow = await prisma.importRow.findFirstOrThrow({
      where: { batchId: result.batchId, outcome: 'ERROR' },
    });
    expect(errorRow.errorColumn).toBe('price');
    expect(errorRow.errorValue).toBe('ask the manager');
  });
});

describe.skipIf(!databaseReachable)('tenant boundaries', () => {
  it('refuses an import from a user with no grant', async () => {
    await expect(
      executeImport(outsider, businessId, {
        fileName: 'x.xlsx',
        defaultMenuKey: 'main',
        mapping: {},
        duplicateStrategy: 'update',
        rows: [],
      }),
    ).rejects.toBeInstanceOf(TenantAccessError);
  });

  it('refuses an export from a user with no grant', async () => {
    await expect(
      exportMenu(outsider, businessId, { audience: 'admin', format: 'xlsx' }),
    ).rejects.toBeInstanceOf(TenantAccessError);
  });
});
