import type { Loader } from 'astro/loaders';
import { notionLoader, type NotionLoaderOptions } from '@astro-notion/loader';
import imageManifest from '../assets/notion-image-manifest.json';
import { rehypeManagedNotionImages } from './rehype-managed-notion-images';

type ManagedImage = {
    kind?: 'cover' | 'body';
    pageId: string;
    sourceType?: 'file' | 'external';
    sourceUrlKey?: string;
    fileName: string;
};

const manifest = imageManifest as { images: ManagedImage[] };
const externalBodyImages = manifest.images.filter(
    (image): image is ManagedImage & { kind: 'body'; sourceType: 'external'; sourceUrlKey: string } =>
        image.kind === 'body'
        && image.sourceType === 'external'
        && typeof image.sourceUrlKey === 'string',
);

function bodyAssetImportPaths(pageId: string): string[] {
    return externalBodyImages
        .filter((image) => image.pageId === pageId)
        .map((image) => `../../assets/notion-generated/${image.fileName.replaceAll('\\', '/')}`);
}

export function astroNotionLoaderPatch(options: NotionLoaderOptions): Loader {
    const rehypePlugins = [
        ...(options.rehypePlugins ?? []),
        [rehypeManagedNotionImages, externalBodyImages],
    ];
    const loader = notionLoader({
        ...options,
        imageSavePath: 'assets/notion-generated/body',
        rehypePlugins: rehypePlugins as NotionLoaderOptions['rehypePlugins'],
    });
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

                if (entry?.id && entry?.rendered) {
                    const externalPaths = bodyAssetImportPaths(entry.id);
                    console.error(`[DEBUG set] id=${entry.id} externalPaths=${externalPaths.length} imagePathsBefore=${JSON.stringify(entry.rendered.metadata?.imagePaths)}`);
                    if (externalPaths.length > 0) {
                        const metadata = entry.rendered.metadata ?? {};
                        entry = {
                            ...entry,
                            // The upstream loader only records `file` body images in
                            // metadata.imagePaths; `external` ones are returned as remote
                            // URLs and never recorded. Astro only rewrites the
                            // __ASTRO_IMAGE_ placeholders emitted by
                            // rehypeManagedNotionImages when imagePaths is non-empty,
                            // so external body images have to be listed there as well.
                            rendered: {
                                ...entry.rendered,
                                metadata: {
                                    ...metadata,
                                    imagePaths: [...new Set([
                                        ...(metadata.imagePaths ?? []),
                                        ...externalPaths,
                                    ])],
                                },
                            },
                            assetImports: [...new Set([
                                ...(entry.assetImports ?? []),
                                ...externalPaths,
                            ])],
                        };
                    }
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

            // Entries persisted before external body images were recorded in
            // metadata.imagePaths still carry an empty array, and their digest is
            // unchanged, so notionLoader would never rewrite them. Drop the digest
            // from the payload (store.set short-circuits when it matches) to force
            // the repaired entry through; the loader re-renders it once on the next
            // sync and writes a fresh digest.
            for (const [id, entry] of ctx.store.entries()) {
                const externalPaths = bodyAssetImportPaths(id);
                if (externalPaths.length === 0 || !entry.rendered) {
                    console.error(`[DEBUG migration] id=${id} externalPaths=${externalPaths.length} rendered=${!!entry.rendered}`);
                    continue;
                }

                const metadata = entry.rendered.metadata ?? {};
                const imagePaths = [...new Set([...(metadata.imagePaths ?? []), ...externalPaths])];
                const assetImports = [...new Set([...(entry.assetImports ?? []), ...externalPaths])];
                const imagePathsIntact = (metadata.imagePaths?.length ?? 0) === imagePaths.length;
                const assetImportsIntact = (entry.assetImports?.length ?? 0) === assetImports.length;
                console.error(`[DEBUG migration] id=${id} before imagePaths=${JSON.stringify(metadata.imagePaths)} intact=${imagePathsIntact && assetImportsIntact}`);
                if (imagePathsIntact && assetImportsIntact) continue;

                const { digest: _digest, ...withoutDigest } = entry;
                ctx.store.set({
                    ...withoutDigest,
                    id,
                    assetImports,
                    rendered: {
                        ...entry.rendered,
                        metadata: {
                            ...metadata,
                            imagePaths,
                        },
                    },
                });
            }
        },
    };
}
