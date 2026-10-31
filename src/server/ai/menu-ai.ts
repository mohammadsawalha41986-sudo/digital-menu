import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { prisma } from '@/server/db/client';
import { recordAudit } from '@/server/audit/log';
import { requireTenantContext, type AuthenticatedUser } from '@/server/tenancy/context';

/**
 * AI help for the menu editor: a dish description, a translation, and an
 * approximate calorie range.
 *
 * Every function returns a suggestion and saves nothing; the owner reviews,
 * edits and accepts it in the editor, and only then is it written through
 * the normal dish save. The menu works the same with no key configured.
 *
 * The prompts forbid inventing facts: an ingredient, a weight, a side dish
 * or a cooking method the restaurant did not give never appears, and what is
 * missing is reported back instead.
 */

const MODEL = 'claude-opus-5-5';
/** Requests per restaurant per 24 hours; a guard against runaway bulk use. */
export const DAILY_LIMIT = 300;

export class AiUnavailableError extends Error {}
export class AiLimitError extends Error {}
/** A request the owner can fix, or an answer that could not be used: shown as is. */
export class AiInputError extends Error {}

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!aiConfigured()) {
    throw new AiUnavailableError('AI is not set up: add ANTHROPIC_API_KEY to the server environment.');
  }
  client ??= new Anthropic({ maxRetries: 2, timeout: 60_000 });
  return client;
}

export interface DishFacts {
  nameAr: string;
  nameEn?: string | null;
  section?: string | null;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  ingredients?: string | null;
  servingSize?: string | null;
  restaurant?: string | null;
}

const SYSTEM = `You write and translate restaurant menu copy for restaurants in Saudi Arabia and the Gulf.

Rules that always apply:
- Use only facts given to you. Never add an ingredient, a side dish, a portion size, a weight, a cooking method, an origin, or a health claim that the input does not state. A dish name may imply its main item (for example "نصف دجاج شواية مع الأرز" states chicken and rice) and nothing more.
- When the facts are thin, write a short, conservative line rather than an invented one, and list what is missing.
- Arabic is Modern Standard Arabic suited to a menu: short, warm, natural. English is concise menu English.
- Gulf and Levantine dish names are transliterated, not translated literally: Bukhari, Kabsa, Mandi, Madghout, Mathbi, Daqoos, Mutabbal, Hummus, Shawarma, Saleeg, Jareesh, Margoog. Brand names stay as written.
- Keep quantities and serving sizes exactly as given.`;

async function withinLimit(businessId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const used = await prisma.auditLog.count({
    where: { businessId, action: 'ai.generated', createdAt: { gte: since } },
  });
  if (used >= DAILY_LIMIT) {
    throw new AiLimitError(`The daily AI limit for this restaurant (${DAILY_LIMIT}) is used up. Try again tomorrow.`);
  }
}

async function ask<T extends z.ZodType>(
  user: AuthenticatedUser,
  businessId: string,
  task: string,
  prompt: string,
  schema: T,
): Promise<z.infer<T>> {
  const context = await requireTenantContext(user, businessId, 'EDITOR');
  const api = anthropic();
  await withinLimit(context.businessId);

  const response = await api.beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    // Short, well-specified tasks: a low effort keeps them quick and cheap.
    output_config: { effort: 'low', format: betaZodOutputFormat(schema) },
    // A refusal on this model is retried on the API's default fallback.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: [{ role: 'user', content: prompt }],
  });

  await recordAudit({
    action: 'ai.generated',
    entity: 'business',
    entityId: context.businessId,
    businessId: context.businessId,
    userId: user.id,
    metadata: {
      task,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      stopReason: response.stop_reason,
    },
  });

  if (response.stop_reason === 'refusal') throw new AiInputError('رفض الذكاء الاصطناعي هذا الطلب · The AI declined this request');
  if (!response.parsed_output) throw new AiInputError('تعذّرت قراءة الاقتراح، حاول مرة أخرى · The answer could not be read, try again');
  return response.parsed_output;
}

const facts = (dish: DishFacts) =>
  [
    `Arabic name: ${dish.nameAr}`,
    dish.nameEn ? `English name: ${dish.nameEn}` : null,
    dish.section ? `Menu section: ${dish.section}` : null,
    dish.ingredients ? `Ingredients (from the restaurant): ${dish.ingredients}` : null,
    dish.servingSize ? `Serving size (from the restaurant): ${dish.servingSize}` : null,
    dish.descriptionAr ? `Current Arabic description: ${dish.descriptionAr}` : null,
    dish.descriptionEn ? `Current English description: ${dish.descriptionEn}` : null,
    dish.restaurant ? `Restaurant: ${dish.restaurant}` : null,
  ]
    .filter(Boolean)
    .join('\n');

const DescriptionSchema = z.object({
  ar: z.string().describe('Arabic menu description, one or two short sentences'),
  en: z.string().describe('English menu description, one or two short sentences'),
  missing: z.array(z.string()).describe('Facts that would make the description better, in Arabic, empty if none'),
});

/** An appetising, factual description in both languages. */
export function describeDish(user: AuthenticatedUser, businessId: string, dish: DishFacts) {
  return ask(
    user,
    businessId,
    'description',
    `Write a menu description for this dish in Arabic and English, using only these facts:\n\n${facts(dish)}`,
    DescriptionSchema,
  );
}

const TranslationSchema = z.object({
  text: z.string().describe('The translation'),
});

/** A name or description in the other language, for review before saving. */
export function translateDish(
  user: AuthenticatedUser,
  businessId: string,
  input: { text: string; to: 'ar' | 'en'; kind: 'name' | 'description'; context?: DishFacts },
) {
  const target = input.to === 'ar' ? 'Arabic' : 'English';
  return ask(
    user,
    businessId,
    `translate-${input.kind}`,
    [
      `Translate this dish ${input.kind} into ${target} for a restaurant menu.`,
      input.kind === 'name'
        ? 'It is a dish name: transliterate traditional names, keep it short, no description.'
        : 'It is a description: keep its meaning and length; add nothing.',
      input.context ? `\nAbout the dish:\n${facts(input.context)}` : '',
      `\nText:\n${input.text}`,
    ].join('\n'),
    TranslationSchema,
  );
}

const CaloriesSchema = z.object({
  low: z.number().int().describe('Lower end of the range, kcal per serving'),
  high: z.number().int().describe('Upper end of the range, kcal per serving'),
  estimate: z.number().int().describe('Single best estimate within the range'),
  assumptions: z.array(z.string()).describe('What the estimate assumes, in Arabic'),
  confidence: z.enum(['low', 'medium']).describe('Never high: this is an estimate, not a lab value'),
});

/**
 * An approximate calorie range per serving, labelled as such. It needs the
 * serving weight and the main ingredients; it is never presented as a
 * measured value, and is saved only when the owner accepts a figure.
 */
export async function estimateCalories(
  user: AuthenticatedUser,
  businessId: string,
  input: DishFacts & { portionGrams: number; mainIngredients: string },
) {
  if (!(input.portionGrams > 0) || !input.mainIngredients.trim()) {
    throw new AiInputError('أدخل وزن الحصة بالغرام والمكونات الرئيسية أولاً · Enter the serving weight in grams and the main ingredients first');
  }
  return ask(
    user,
    businessId,
    'calories',
    [
      'Estimate the calories of one serving of this dish, as a range.',
      `Serving weight: ${input.portionGrams} g`,
      `Main ingredients: ${input.mainIngredients}`,
      facts(input),
      'State your assumptions (oil, cooking method, rice share). Confidence is "low" or "medium" only.',
    ].join('\n'),
    CaloriesSchema,
  );
}
