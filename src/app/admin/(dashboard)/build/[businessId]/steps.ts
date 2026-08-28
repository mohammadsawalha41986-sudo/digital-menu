/**
 * The ten steps, in the order a restaurant owner actually works.
 *
 * Held in one place because three things must agree: the rail, the Continue
 * button's destination, and the guard that decides which steps are reachable.
 * Deriving all three from this array is what keeps them from drifting apart.
 */
export interface BuildStep {
  key: string;
  number: number;
  title: string;
  summary: string;
  /** False for steps that are useful but never block finishing. */
  required: boolean;
}

export const BUILD_STEPS: readonly BuildStep[] = [
  { key: 'brand', number: 2, title: 'Logo & brand', summary: 'Your logo builds the palette', required: false },
  { key: 'style', number: 3, title: 'Menu style', summary: 'Pick the look', required: false },
  { key: 'details', number: 4, title: 'Menu information', summary: 'Description and contact', required: false },
  { key: 'menu', number: 5, title: 'Your menu', summary: 'Import or type it', required: true },
  { key: 'images', number: 6, title: 'Photos', summary: 'Dishes and hero images', required: false },
  { key: 'builder', number: 7, title: 'Edit menu', summary: 'Change anything, see it live', required: false },
  { key: 'qr', number: 8, title: 'QR & link', summary: 'Permanent address', required: false },
  { key: 'connect', number: 9, title: 'Connect & offers', summary: 'Maps, socials, offers', required: false },
  { key: 'review', number: 10, title: 'Review & publish', summary: 'Go live', required: false },
];

export function stepAt(key: string): BuildStep | undefined {
  return BUILD_STEPS.find((step) => step.key === key);
}

export function nextStep(key: string): BuildStep | undefined {
  const index = BUILD_STEPS.findIndex((step) => step.key === key);
  return index === -1 ? undefined : BUILD_STEPS[index + 1];
}

export function previousStep(key: string): BuildStep | undefined {
  const index = BUILD_STEPS.findIndex((step) => step.key === key);
  return index <= 0 ? undefined : BUILD_STEPS[index - 1];
}
