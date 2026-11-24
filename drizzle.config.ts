import { defineConfig } from 'drizzle-kit';

// Only used to generate migrations (`npm run db:generate`); no database access.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
});
