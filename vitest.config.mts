import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Template modules are TSX; Next compiles them in the app. This plugin does
  // the same transform for tests so unit specs can import the registry.
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // Playwright owns e2e/.
    exclude: ['e2e/**', 'node_modules/**'],
    // Integration tests read DATABASE_URL from the local .env, exactly as the
    // Prisma CLI does.
    setupFiles: ['dotenv/config'],
    restoreMocks: true,
  },
  resolve: {
    alias: { '@': path.resolve(root, 'src') },
  },
});
