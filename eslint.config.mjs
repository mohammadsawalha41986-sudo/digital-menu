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
];

export default config;
