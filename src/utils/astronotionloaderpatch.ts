import type { Loader } from 'astro/loaders';
import { notionLoader, type NotionLoaderOptions } from '@astro-notion/loader';

export function astroNotionLoaderPatch(options: NotionLoaderOptions): Loader {
    const loader = notionLoader(options);
    const schema = (loader as any).schema;

    if (typeof schema !== 'function') {
        return loader;
    }

    const { schema: _schema, ...loaderWithoutSchema } = loader as any;

    const originalLoad = loader.load;

    return {
        ...loaderWithoutSchema,
        createSchema: async () => ({
            schema: await schema(),
            types: 'export type Entry = any;',
        }),
        load: async (ctx) => {
            const originalParseData = ctx.parseData;

            // @astro-notion/loader omits page.last_edited_time from the
            // object passed to parseData. Supply a temporary string so the
            // user's required collection schema can validate the entry.
            // The real value is injected below from the loader digest.
            ctx.parseData = (async (props: any) => {
                return originalParseData({
                    ...props,
                    data: {
                        ...props.data,
                        last_edited_time: props.data.last_edited_time ?? '',
                    },
                });
            }) as typeof originalParseData;

            // notionLoader uses page.last_edited_time as the persistent-store
            // digest, but does not include it in entry.data. Add it there so
            // the collection schema and the image cache can use the same
            // invalidation value.
            const originalSet = ctx.store.set;
            ctx.store.set = ((entry: any) => {
                if (entry?.data && typeof entry.digest === 'string') {
                    entry = {
                        ...entry,
                        data: {
                            ...entry.data,
                            last_edited_time: entry.digest,
                        },
                    };
                }

                return originalSet(entry);
            }) as typeof originalSet;

            try {
                await originalLoad(ctx);
            } finally {
                ctx.parseData = originalParseData;
                ctx.store.set = originalSet;
            }

            // Migrate entries created by the unpatched loader. When the
            // digest is unchanged, notionLoader intentionally skips writing
            // the entry, so this second pass is needed for old Content Layer
            // records that predate last_edited_time in data.
            for (const [id, entry] of ctx.store.entries()) {
                if (entry.data && !('last_edited_time' in entry.data) && typeof entry.digest === 'string') {
                    ctx.store.set({
                        ...entry,
                        id,
                        data: {
                            ...entry.data,
                            last_edited_time: entry.digest,
                        },
                    });
                }
            }
        },
    };
}
