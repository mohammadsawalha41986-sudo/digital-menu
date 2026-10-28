import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

/** Flat config. `src/generated` holds Prisma output and is never hand-edited. */
const config = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'src/generated/**',
      'playwright-report/**',
      'test-results/**',
      // Vite-built reference demo — not hand-written source.
      'public/sabah/**',
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // The Sabah reference app was authored outside Next.js. Its `<img>` tags
    // reach the browser faster than `next/image` would during the first
    // hydration tick of a cold phone visitor, and the imports it leaves
    // declared sit intentionally against ordered sections of the dish grid.
    // Keep its stylistic warnings off; errors still fail CI.
    files: ['src/templates/street-food/sabah/**/*.tsx'],
    rules: {
      '@next/next/no-img-element': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
];

export default config;
