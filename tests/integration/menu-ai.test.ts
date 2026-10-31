import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { createBusiness } from '@/server/admin/business-service';
import { TenantAccessError } from '@/server/tenancy/context';
import { resetEnvCache } from '@/lib/env';
import { resolveDatabase } from '../database';

/**
 * The AI assistant's server side, with the model replaced by a stub: what is
 * sent (only the dish's own facts, under rules that forbid inventing any),
 * what comes back, the missing-key path, the daily limit and usage logging.
 */

const parse = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    beta = { messages: { parse } };
  },
}));

const { AiLimitError, AiUnavailableError, DAILY_LIMIT, describeDish, estimateCalories, translateDish } = await import(
  '@/server/ai/menu-ai'
);

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });
const databaseReachable = await resolveDatabase(() => prisma.$queryRaw`SELECT 1`);

const SLUG = 'ai-fixture';
const EMAIL = 'ai-fixture@example.test';
const OTHER_EMAIL = 'ai-other@example.test';
let businessId = '';
let user = { id: '', role: 'SUPER_ADMIN' as const };
let outsider = { id: '', role: 'STAFF' as const };

const answer = (parsed: unknown) => ({
  model: 'claude-opus-5-5',
  stop_reason: 'end_turn',
  usage: { input_tokens: 120, output_tokens: 60 },
  parsed_output: parsed,
});

beforeAll(async () => {
  process.env.PUBLIC_URL = 'https://menu.example.com';
  resetEnvCache();
  if (!databaseReachable) return;
  await prisma.business.deleteMany({ where: { slug: SLUG } });
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL, OTHER_EMAIL] } } });
  user = { id: (await prisma.user.create({ data: { email: EMAIL, name: 'AI', role: 'SUPER_ADMIN' } })).id, role: 'SUPER_ADMIN' };
  outsider = { id: (await prisma.user.create({ data: { email: OTHER_EMAIL, name: 'O', role: 'STAFF' } })).id, role: 'STAFF' };
  businessId = (
    await createBusiness(user, {
      slug: SLUG,
      type: 'RESTAURANT',
      status: 'ACTIVE',
      defaultLocale: 'ar',
      currency: 'SAR',
      nameAr: 'مطعم',
      nameEn: SLUG,
    } as Parameters<typeof createBusiness>[1])
  ).id;
});

beforeEach(() => {
  parse.mockReset();
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

afterAll(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  if (databaseReachable) {
    await prisma.business.deleteMany({ where: { slug: SLUG } });
    await prisma.user.deleteMany({ where: { email: { in: [EMAIL, OTHER_EMAIL] } } });
  }
  await prisma.$disconnect();
});

describe.skipIf(!databaseReachable)('menu AI', () => {
  it('sends only the dish facts, under rules that forbid inventing any, and returns the suggestion', async () => {
    parse.mockResolvedValue(answer({ ar: 'نصف دجاج شواية مع أرز.', en: 'Half rotisserie chicken with rice.', missing: [] }));

    const result = await describeDish(user, businessId, { nameAr: 'نصف دجاج شواية مع الأرز', section: 'دجاج الشواية' });
    expect(result.en).toBe('Half rotisserie chicken with rice.');

    const request = parse.mock.calls[0]![0];
    expect(request.model).toBe('claude-opus-5-5');
    expect(request.system).toMatch(/Never add an ingredient/);
    expect(request.messages[0].content).toContain('Arabic name: نصف دجاج شواية مع الأرز');
    expect(request.messages[0].content).toContain('Menu section: دجاج الشواية');
    expect(request.output_config.format).toBeTruthy();
    expect(request.fallbacks).toBe('default');
  });

  it('logs usage for every request', async () => {
    parse.mockResolvedValue(answer({ text: 'Bukhari rice' }));
    await translateDish(user, businessId, { text: 'أرز بخاري', to: 'en', kind: 'name' });
    const log = await prisma.auditLog.findFirst({
      where: { businessId, action: 'ai.generated' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log?.metadata).toMatchObject({ task: 'translate-name', inputTokens: 120, outputTokens: 60 });
  });

  it('asks for the weight and main ingredients before estimating calories, and never calls the model without them', async () => {
    await expect(
      estimateCalories(user, businessId, { nameAr: 'كبسة', portionGrams: 0, mainIngredients: '' }),
    ).rejects.toThrow(/serving weight/);
    expect(parse).not.toHaveBeenCalled();
  });

  it('explains a missing key instead of failing, and refuses another tenant', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(describeDish(user, businessId, { nameAr: 'كبسة' })).rejects.toBeInstanceOf(AiUnavailableError);
    process.env.ANTHROPIC_API_KEY = 'test-key';
    await expect(describeDish(outsider, businessId, { nameAr: 'كبسة' })).rejects.toBeInstanceOf(TenantAccessError);
    expect(parse).not.toHaveBeenCalled();
  });

  it('stops at the daily limit', async () => {
    const used = await prisma.auditLog.count({ where: { businessId, action: 'ai.generated' } });
    await prisma.auditLog.createMany({
      data: Array.from({ length: DAILY_LIMIT - used }, () => ({
        businessId,
        action: 'ai.generated',
        entity: 'business',
        entityId: businessId,
      })),
    });
    await expect(describeDish(user, businessId, { nameAr: 'كبسة' })).rejects.toBeInstanceOf(AiLimitError);
    expect(parse).not.toHaveBeenCalled();
  });
});
