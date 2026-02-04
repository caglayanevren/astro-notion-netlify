// @ts-check
import { defineConfig } from 'astro/config';

import netlify from '@astrojs/netlify';

// https://astro.build/config
export default defineConfig({
    output: 'server',
    adapter: netlify(),
    image: {
        domains: ['prod-files-secure.s3.us-west-2.amazonaws.com'],
    },
});
