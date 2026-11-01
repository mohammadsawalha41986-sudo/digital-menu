/**
 * What a restaurant owner should do next, read from the menu's real state.
 *
 * Pure on purpose: the rule is the same for every restaurant, and it can be
 * tested without a database. The three cases are ordered by what blocks a
 * customer from ordering: no dishes, then not published, then nothing to do.
 */

export interface NextStep {
  /** A short bilingual title, as the admin shows it. */
  title: string;
  body: string;
  action: string;
  /** Path under the admin, relative to the restaurant's builder or hub routes. */
  step: 'dishes' | 'publish' | 'share';
}

export function nextStep(input: { dishCount: number; live: boolean }): NextStep {
  if (input.dishCount === 0) {
    return {
      title: 'أضف أول طبق · Add your first dish',
      body: 'المنيو فارغ الآن. ابدأ بالأطباق والأسعار، ثم انشره.',
      action: 'الأطباق · Dishes',
      step: 'dishes',
    };
  }
  if (!input.live) {
    return {
      title: 'راجع ونشر المنيو · Review and publish',
      body: 'المنيو ما زال غير منشور، فلن يراه الزبائن بعد.',
      action: 'مراجعة ونشر · Review & publish',
      step: 'publish',
    };
  }
  return {
    title: 'المنيو منشور · Your menu is live',
    body: 'شارك رمز QR أو تابع الزيارات من الإحصائيات.',
    action: 'رمز QR · QR code',
    step: 'share',
  };
}
