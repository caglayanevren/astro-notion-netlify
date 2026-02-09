// @ts-check
import { defineConfig } from 'astro/config';

import netlify from '@astrojs/netlify';
//import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
    output: 'server',
    adapter: netlify(),
    //adapter: cloudflare({
    //    imageService: 'compile',
    //}),
    //vite: {
    //    ssr: {
    //        external: ['fs', 'path', 'fs-extra'],
    //    },
    //},
    image: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: '**.amazonaws.com',
            },
        ],
        //domains: ['prod-files-secure.s3.us-west-2.amazonaws.com'],
    },
});
