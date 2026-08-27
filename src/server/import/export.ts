import ExcelJS from 'exceljs';
import { formatMinorAsDecimal } from '@/lib/money';
import { prisma } from '@/server/db/client';
import { recordAudit } from '@/server/audit/log';
import {
  requireTenantContext,
  tenantScope,
  type AuthenticatedUser,
} from '@/server/tenancy/context';
import { IMPORT_COLUMNS } from './columns';

/**
 * Export (master spec §66, §78, §79).
 *
 * The exported file is deliberately import-shaped: the same columns, in the
 * same order, with `item_id` populated. That is the whole "export → edit →
 * re-import" loop the spec is built around, and it only works because the code
 * exported is the code the importer matches on.
 *
 * Two audiences (§79):
 *  - **admin** exports include `item_id`, so edits update in place.
 *  - **client** exports omit it, so a business sees clean menu data without
 *    internal identifiers.
 */

export type ExportAudience = 'admin' | 'client';
export type ExportFormat = 'xlsx' | 'csv';

export interface ExportOptions {
  audience: ExportAudience;
  format: ExportFormat;
  /** Limit to one menu; omitted exports every menu. */
  menuKey?: string | null;
}

export interface ExportResult {
  bytes: Uint8Array;
  fileName: string;
  contentType: string;
}

export async function exportMenu(
  user: AuthenticatedUser,
  businessId: string,
  options: ExportOptions,
): Promise<ExportResult> {
  const context = await requireTenantContext(user, businessId, 'VIEWER');

  const business = await prisma.business.findUniqueOrThrow({
    where: { id: context.businessId },
    select: { slug: true, currency: true, publicId: true },
  });

  const menus = await prisma.menu.findMany({
    where: {
      ...tenantScope(context),
      ...(options.menuKey ? { key: options.menuKey } : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
    select: {
      key: true,
      categories: {
        orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
        select: {
          nameAr: true,
          nameEn: true,
          parent: { select: { nameAr: true, nameEn: true } },
          items: {
            orderBy: [{ sortOrder: 'asc' }, { itemCode: 'asc' }],
            select: {
              itemCode: true,
              nameAr: true,
              nameEn: true,
              descriptionAr: true,
              descriptionEn: true,
              priceMinor: true,
              costMinor: true,
              currency: true,
              calories: true,
              servingSizeAr: true,
              ingredientsAr: true,
              ingredientsEn: true,
              allergens: true,
              tags: true,
              availability: true,
              isFeatured: true,
              sortOrder: true,
            },
          },
        },
      },
    },
  });

  const columns = exportColumns(options.audience);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Digital Profile OS';
  const sheet = workbook.addWorksheet('Menu');

  sheet.addRow(columns.map((column) => column.key));
  sheet.getRow(1).font = { bold: true };

  for (const menu of menus) {
    for (const category of menu.categories) {
      for (const item of category.items) {
        const values: Record<string, string> = {
          item_id: item.itemCode,
          menu: menu.key,
          category_ar: (category.parent ?? category).nameAr,
          category_en: (category.parent ?? category).nameEn ?? '',
          // A child category exports as its parent plus a subcategory, which
          // is the shape the importer reads back (§26 round trip).
          subcategory_ar: category.parent ? category.nameAr : '',
          subcategory_en: category.parent ? (category.nameEn ?? '') : '',
          item_name_ar: item.nameAr,
          item_name_en: item.nameEn ?? '',
          description_ar: item.descriptionAr ?? '',
          description_en: item.descriptionEn ?? '',
          price:
            item.priceMinor === null ? '' : formatMinorAsDecimal(item.priceMinor, item.currency),
          // Blank where no cost is known: exporting a zero would turn absence
          // into a claim the business never made (§39).
          cost: item.costMinor === null ? '' : formatMinorAsDecimal(item.costMinor, item.currency),
          currency: item.currency,
          // An empty cell means the business has not measured it; exporting a
          // zero here would turn absence into a claim (§37; GOALS I9).
          calories: item.calories === null ? '' : String(item.calories),
          serving_size: item.servingSizeAr ?? '',
          ingredients_ar: item.ingredientsAr ?? '',
          ingredients_en: item.ingredientsEn ?? '',
          allergens: item.allergens.join(', '),
          tags: item.tags.join(', '),
          image_url: '',
          featured: item.isFeatured ? 'TRUE' : 'FALSE',
          available: item.availability === 'AVAILABLE' ? 'TRUE' : 'FALSE',
          sort_order: String(item.sortOrder),
          branch: '',
        };

        sheet.addRow(columns.map((column) => values[column.key] ?? ''));
      }
    }
  }

  sheet.columns.forEach((column, index) => {
    column.width = Math.max(12, (columns[index]?.key.length ?? 10) + 4);
  });

  await recordAudit({
    action: 'export.executed',
    entity: 'business',
    entityId: context.businessId,
    businessId: context.businessId,
    userId: user.id,
    metadata: { audience: options.audience, format: options.format, menuKey: options.menuKey },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `${business.slug}-menu-${stamp}.${options.format}`;

  if (options.format === 'csv') {
    const buffer = await workbook.csv.writeBuffer();
    return {
      bytes: new Uint8Array(buffer as ArrayBuffer),
      fileName,
      contentType: 'text/csv; charset=utf-8',
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    bytes: new Uint8Array(buffer as ArrayBuffer),
    fileName,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

/**
 * The downloadable blank template (master spec §59).
 *
 * Carries a documentation sheet alongside the headers, because the questions
 * staff ask about a template — which columns are required, what a boolean
 * looks like, whether calories may be blank — are answerable in the file
 * itself.
 */
export async function buildImportTemplate(): Promise<ExportResult> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Digital Profile OS';

  const sheet = workbook.addWorksheet('Menu');
  sheet.addRow(IMPORT_COLUMNS.map((column) => column.key));
  sheet.getRow(1).font = { bold: true };

  // One example row so the expected shape is visible rather than described.
  sheet.addRow([
    '',
    'المقبلات',
    'Starters',
    'حمص',
    'Hummus',
    'حمص بالطحينة',
    'Hummus with tahini',
    '18',
    'SAR',
    '320',
    '150g',
    'حمص، طحينة',
    'Chickpeas, tahini',
    'soy',
    'vegetarian',
    '',
    'FALSE',
    'TRUE',
    '0',
    'main',
    '',
  ]);

  sheet.columns.forEach((column, index) => {
    column.width = Math.max(14, (IMPORT_COLUMNS[index]?.key.length ?? 10) + 4);
  });

  const guide = workbook.addWorksheet('Columns');
  guide.addRow(['Column', 'العنوان', 'Required', 'Notes']);
  guide.getRow(1).font = { bold: true };

  for (const column of IMPORT_COLUMNS) {
    guide.addRow([column.key, column.labelAr, column.required ? 'Yes' : 'No', column.description]);
  }

  guide.columns.forEach((column, index) => {
    column.width = index === 3 ? 70 : 22;
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return {
    bytes: new Uint8Array(buffer as ArrayBuffer),
    fileName: 'digital-profile-os-menu-template.xlsx',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

function exportColumns(audience: ExportAudience) {
  return audience === 'admin'
    ? IMPORT_COLUMNS
    : IMPORT_COLUMNS.filter((column) => column.key !== 'item_id');
}

/**
 * Error report for a completed batch (master spec §63).
 *
 * Row, column, value, problem, suggested fix — the four things needed to
 * repair a spreadsheet, in a file that can be opened next to the original.
 */
export async function buildErrorReport(
  user: AuthenticatedUser,
  businessId: string,
  batchId: string,
): Promise<ExportResult> {
  const context = await requireTenantContext(user, businessId, 'VIEWER');

  const batch = await prisma.importBatch.findFirst({
    where: { id: batchId, ...tenantScope(context) },
    include: { rows: { where: { outcome: 'ERROR' }, orderBy: { rowNumber: 'asc' } } },
  });

  if (!batch) throw new Error('Import batch not found');

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Errors');

  sheet.addRow(['Row', 'Column', 'Value', 'Problem', 'Item code']);
  sheet.getRow(1).font = { bold: true };

  for (const row of batch.rows) {
    sheet.addRow([
      row.rowNumber,
      row.errorColumn ?? '',
      row.errorValue ?? '',
      row.errorMessage ?? '',
      row.itemCode ?? '',
    ]);
  }

  sheet.columns.forEach((column, index) => {
    column.width = index === 3 ? 60 : 18;
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return {
    bytes: new Uint8Array(buffer as ArrayBuffer),
    fileName: `import-${batch.id}-errors.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}
