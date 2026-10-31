'use client';

import { useState, type RefObject } from 'react';
import type { AiResult } from '@/server/admin/ai-actions';

/**
 * The AI assistant inside the dish editor. Every tool returns a suggestion
 * shown here for review; "Use" copies it into the form, and nothing reaches
 * the menu until the owner presses "Save dish". A field that already has
 * text is replaced only after a confirmation.
 */

type AiAction = (data: FormData) => Promise<AiResult>;

export interface DishAiActions {
  describe: AiAction;
  translate: AiAction;
  calories: AiAction;
}

type Field = HTMLInputElement | HTMLTextAreaElement;

export function DishAi({
  formRef,
  section,
  ready,
  actions,
}: {
  formRef: RefObject<HTMLFormElement | null>;
  section: string;
  /** False when the server has no AI key: the tools explain instead of failing. */
  ready: boolean;
  actions: DishAiActions;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState<AiResult | null>(null);
  const [translation, setTranslation] = useState<{ target: string; label: string; text: string } | null>(null);
  const [calories, setCalories] = useState<AiResult | null>(null);
  const [portion, setPortion] = useState('');
  const [ingredients, setIngredients] = useState('');

  const get = (name: string) => (formRef.current?.elements.namedItem(name) as Field | null)?.value?.trim() ?? '';
  const put = (name: string, value: string) => {
    const field = formRef.current?.elements.namedItem(name) as Field | null;
    if (!field) return;
    if (field.value.trim() && field.value.trim() !== value.trim()) {
      if (!window.confirm('استبدال النص الحالي بالاقتراح؟ · Replace the current text with the suggestion?')) return;
    }
    field.value = value;
  };

  const dishData = () => {
    const data = new FormData();
    for (const name of ['nameAr', 'nameEn', 'descriptionAr', 'descriptionEn']) data.set(name, get(name));
    data.set('section', section);
    return data;
  };

  const call = async (label: string, action: AiAction, data: FormData) => {
    setBusy(label);
    setError(null);
    try {
      const result = await action(data);
      if (result.error) {
        setError(result.error);
        return null;
      }
      return result;
    } catch {
      setError('تعذّر الاتصال · Could not reach the server');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const describe = async () => {
    const result = await call('describe', actions.describe, dishData());
    if (result) setDescription(result);
  };

  const translate = async (source: string, target: string, to: 'ar' | 'en', kind: 'name' | 'description', label: string) => {
    const text = get(source);
    if (!text) {
      setError('الحقل المصدر فارغ · The field to translate from is empty');
      return;
    }
    const data = dishData();
    data.set('text', text);
    data.set('to', to);
    data.set('kind', kind);
    const result = await call(`translate-${target}`, actions.translate, data);
    if (result?.text) setTranslation({ target, label, text: result.text });
  };

  const estimate = async () => {
    const data = dishData();
    data.set('portionGrams', portion);
    data.set('mainIngredients', ingredients);
    const result = await call('calories', actions.calories, data);
    if (result) setCalories(result);
  };

  const disabled = !ready || Boolean(busy);

  return (
    <section className="dish-ai" aria-label="AI assistant" data-dish-ai="">
      <h3 className="dish-ai__title">مساعد الذكاء الاصطناعي · AI assistant</h3>
      {!ready ? (
        <p className="admin__hint" data-ai-off="">
          غير مفعّل بعد: يلزم إضافة مفتاح ANTHROPIC_API_KEY في إعدادات الخادم. المنيو يعمل كالمعتاد بدونه. · Not set up:
          the server needs ANTHROPIC_API_KEY. The menu works as usual without it.
        </p>
      ) : (
        <p className="admin__hint">
          اقتراحات للمراجعة فقط — لا يُحفظ شيء حتى تضغط «Save dish». لا يضيف مكونات أو أوزاناً لم تذكرها. · Suggestions
          only; nothing is saved until you press Save dish, and nothing you did not state is added.
        </p>
      )}

      <div className="dish-ai__row">
        <button type="button" className="admin__button admin__button--small" disabled={disabled} onClick={() => void describe()}>
          {busy === 'describe' ? '…' : 'إنشاء وصف · Generate description'}
        </button>
        <button
          type="button"
          className="admin__button admin__button--small admin__button--secondary"
          disabled={disabled}
          onClick={() => void translate('nameAr', 'nameEn', 'en', 'name', 'English name')}
        >
          ترجمة الاسم إلى الإنجليزية · Name → EN
        </button>
        <button
          type="button"
          className="admin__button admin__button--small admin__button--secondary"
          disabled={disabled}
          onClick={() => void translate('nameEn', 'nameAr', 'ar', 'name', 'الاسم بالعربي')}
        >
          ترجمة الاسم إلى العربية · Name → AR
        </button>
        <button
          type="button"
          className="admin__button admin__button--small admin__button--secondary"
          disabled={disabled}
          onClick={() => void translate('descriptionAr', 'descriptionEn', 'en', 'description', 'English description')}
        >
          ترجمة الوصف إلى الإنجليزية · Description → EN
        </button>
        <button
          type="button"
          className="admin__button admin__button--small admin__button--secondary"
          disabled={disabled}
          onClick={() => void translate('descriptionEn', 'descriptionAr', 'ar', 'description', 'الوصف بالعربي')}
        >
          ترجمة الوصف إلى العربية · Description → AR
        </button>
      </div>

      {busy && busy.startsWith('translate') ? <p className="admin__hint" role="status">جارٍ الترجمة…</p> : null}

      {description ? (
        <div className="dish-ai__proposal" data-ai-proposal="description">
          <p dir="rtl">{description.ar}</p>
          <p dir="ltr">{description.en}</p>
          {description.missing && description.missing.length > 0 ? (
            <p className="admin__hint">لتحسين الوصف أضف: {description.missing.join('، ')}</p>
          ) : null}
          <div className="dish-ai__row">
            <button
              type="button"
              className="admin__button admin__button--small"
              onClick={() => {
                put('descriptionAr', description.ar ?? '');
                put('descriptionEn', description.en ?? '');
                setDescription(null);
              }}
            >
              استخدام · Use
            </button>
            <button type="button" className="admin__button admin__button--small admin__button--secondary" disabled={disabled} onClick={() => void describe()}>
              إعادة · Regenerate
            </button>
            <button type="button" className="admin__button admin__button--small admin__button--secondary" onClick={() => setDescription(null)}>
              رفض · Reject
            </button>
          </div>
        </div>
      ) : null}

      {translation ? (
        <div className="dish-ai__proposal" data-ai-proposal="translation">
          <p className="admin__hint">{translation.label}:</p>
          <p dir="auto">{translation.text}</p>
          <div className="dish-ai__row">
            <button
              type="button"
              className="admin__button admin__button--small"
              onClick={() => {
                put(translation.target, translation.text);
                setTranslation(null);
              }}
            >
              استخدام · Use
            </button>
            <button type="button" className="admin__button admin__button--small admin__button--secondary" onClick={() => setTranslation(null)}>
              رفض · Reject
            </button>
          </div>
        </div>
      ) : null}

      <details className="dish-ai__calories">
        <summary>تقدير السعرات الحرارية · Estimate calories</summary>
        <p className="admin__hint">
          تقدير تقريبي وليس قياساً مخبرياً. أدخل وزن الحصة والمكونات الرئيسية. · An approximate estimate, not a lab
          value; give the serving weight and main ingredients.
        </p>
        <div className="dish-ai__grid">
          <label className="admin__field">
            <span>وزن الحصة (غرام) · Serving (g)</span>
            <input className="admin__input" inputMode="numeric" value={portion} onChange={(event) => setPortion(event.target.value)} />
          </label>
          <label className="admin__field">
            <span>المكونات الرئيسية · Main ingredients</span>
            <input className="admin__input" value={ingredients} onChange={(event) => setIngredients(event.target.value)} placeholder="دجاج 250غ، أرز بخاري 200غ، زيت" />
          </label>
        </div>
        <button type="button" className="admin__button admin__button--small" disabled={disabled} onClick={() => void estimate()}>
          {busy === 'calories' ? '…' : 'تقدير · Estimate'}
        </button>
        {calories ? (
          <div className="dish-ai__proposal" data-ai-proposal="calories">
            <p>
              <strong>{calories.low}–{calories.high}</strong> سعرة للحصة (الأقرب {calories.estimate}) · ثقة{' '}
              {calories.confidence === 'medium' ? 'متوسطة' : 'منخفضة'}
            </p>
            <ul className="dish-ai__assumptions">
              {calories.assumptions?.map((line) => <li key={line}>{line}</li>)}
            </ul>
            <div className="dish-ai__row">
              <button
                type="button"
                className="admin__button admin__button--small"
                onClick={() => {
                  put('calories', String(calories.estimate ?? ''));
                  setCalories(null);
                }}
              >
                اعتماد {calories.estimate} · Use
              </button>
              <button type="button" className="admin__button admin__button--small admin__button--secondary" onClick={() => setCalories(null)}>
                رفض · Reject
              </button>
            </div>
          </div>
        ) : null}
      </details>

      {error ? (
        <p className="admin__message admin__message--error" role="alert" data-ai-error="">
          {error}
        </p>
      ) : null}
    </section>
  );
}
