'use server';

import { requireUser } from '@/server/auth/current-user';
import { TenantAccessError } from '@/server/tenancy/context';
import {
  AiInputError,
  AiLimitError,
  AiUnavailableError,
  describeDish,
  estimateCalories,
  translateDish,
  type DishFacts,
} from '@/server/ai/menu-ai';

/**
 * The dish editor's AI buttons. Each returns a suggestion for the owner to
 * review; none of them writes to the menu — accepting fills the form, and the
 * dish is saved by the owner's own "Save dish".
 */

export interface AiResult {
  error?: string;
  ar?: string;
  en?: string;
  missing?: string[];
  text?: string;
  low?: number;
  high?: number;
  estimate?: number;
  assumptions?: string[];
  confidence?: string;
}

const field = (data: FormData, name: string) => String(data.get(name) ?? '').trim() || null;

function facts(data: FormData): DishFacts {
  return {
    nameAr: field(data, 'nameAr') ?? '',
    nameEn: field(data, 'nameEn'),
    section: field(data, 'section'),
    descriptionAr: field(data, 'descriptionAr'),
    descriptionEn: field(data, 'descriptionEn'),
    ingredients: field(data, 'ingredients'),
    servingSize: field(data, 'servingSize'),
  };
}

async function run(work: () => Promise<AiResult>): Promise<AiResult> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AiUnavailableError || error instanceof AiLimitError || error instanceof AiInputError) return { error: error.message };
    if (error instanceof TenantAccessError) return { error: 'Not found or access denied' };
    console.error('[ai] request failed', error);
    return { error: 'تعذّر الحصول على اقتراح الآن، حاول مرة أخرى · The AI could not answer now, try again' };
  }
}

export async function aiDescribeAction(businessId: string, data: FormData): Promise<AiResult> {
  const user = await requireUser();
  return run(async () => {
    const dish = facts(data);
    if (!dish.nameAr) return { error: 'اكتب اسم الطبق أولاً · Enter the dish name first' };
    return describeDish(user, businessId, dish);
  });
}

export async function aiTranslateAction(businessId: string, data: FormData): Promise<AiResult> {
  const user = await requireUser();
  return run(async () => {
    const text = field(data, 'text');
    const to = data.get('to') === 'ar' ? 'ar' : 'en';
    const kind = data.get('kind') === 'description' ? 'description' : 'name';
    if (!text) return { error: 'لا يوجد نص للترجمة · Nothing to translate' };
    return translateDish(user, businessId, { text, to, kind, context: facts(data) });
  });
}

export async function aiCaloriesAction(businessId: string, data: FormData): Promise<AiResult> {
  const user = await requireUser();
  return run(async () =>
    estimateCalories(user, businessId, {
      ...facts(data),
      portionGrams: Number(data.get('portionGrams')),
      mainIngredients: field(data, 'mainIngredients') ?? '',
    }),
  );
}
