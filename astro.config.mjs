import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://news.3mi.ai',
  output: 'hybrid',
  adapter: cloudflare({
    platformProxy: { enabled: true },
  }),
  integrations: [
    // sitemap 暫時關閉：等 D1 有資料後再開（routes 為空時 plugin crash）；需要時再重新安裝 @astrojs/sitemap
  ],
});