import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineProject } from 'vitest/config';

export default defineProject({
  plugins: [cloudflareTest({ wrangler: { configPath: './test/worker/wrangler.test.jsonc' } })],
  test: { name: 'worker', include: ['test/worker/**/*.test.ts'] },
});
