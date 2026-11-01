import { describe, expect, it } from 'vitest';
import { nextStep } from '@/lib/admin-next-step';

describe('the next step shown on a restaurant’s home', () => {
  it('asks for the first dish while the menu is empty, whether or not it is live', () => {
    expect(nextStep({ dishCount: 0, live: false })).toMatchObject({ step: 'dishes' });
    expect(nextStep({ dishCount: 0, live: true })).toMatchObject({ step: 'dishes' });
  });

  it('asks to publish a menu that has dishes but is not live', () => {
    expect(nextStep({ dishCount: 12, live: false })).toMatchObject({ step: 'publish' });
  });

  it('points to sharing once the menu is live', () => {
    expect(nextStep({ dishCount: 12, live: true })).toMatchObject({ step: 'share' });
  });

  it('gives a bilingual title and action in every case', () => {
    for (const input of [
      { dishCount: 0, live: false },
      { dishCount: 3, live: false },
      { dishCount: 3, live: true },
    ]) {
      const step = nextStep(input);
      expect(step.title).toMatch(/·/);
      expect(step.action).toMatch(/·/);
      expect(step.body.length).toBeGreaterThan(0);
    }
  });
});
