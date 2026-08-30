import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import vercel from '@astrojs/vercel/serverless';

export default defineConfig({
  output: 'server', // Sunucu/API özelliklerini aktif eder (Vercel'de tamamen ücretsizdir)
  adapter: vercel(),
  integrations: [tailwind()]
});
