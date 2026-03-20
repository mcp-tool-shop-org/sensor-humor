// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://mcp-tool-shop-org.github.io',
  base: '/sensor-humor',
  integrations: [
    starlight({
      title: 'sensor-humor',
      disable404Route: true,
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/mcp-tool-shop-org/sensor-humor' },
      ],
      sidebar: [
        { label: 'Handbook', autogenerate: { directory: 'handbook' } },
      ],
      customCss: ['./src/styles/starlight-custom.css'],
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
