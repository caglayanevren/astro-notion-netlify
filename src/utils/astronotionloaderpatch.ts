import type { Loader } from 'astro/loaders';
import { notionLoader, type NotionLoaderOptions } from '@astro-notion/loader';

export function astroNotionLoaderPatch(options: NotionLoaderOptions): Loader {
    const loader = notionLoader(options);
    const schema = (loader as any).schema;

    if (typeof schema !== 'function') {
        return loader;
    }

    const { schema: _schema, ...loaderWithoutSchema } = loader as any;

    return {
        ...loaderWithoutSchema,
        createSchema: async () => ({
            schema: await schema(),
            types: 'export type Entry = any;',
        }),
    };
}
