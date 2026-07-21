import { dateToDateObjects, richTextToPlainText, fileToUrl, fileToImageAsset } from '@astro-notion/loader';
import { Client, isFullPage } from '@notionhq/client';
import { getStore, type Store } from '@netlify/blobs';
import { getCollection, render } from 'astro:content';
import { type PostsType, type BlogPostDataType, type NotionPostItem, imageSavePath } from '../config';
import fs from 'node:fs/promises';
import path from 'node:path';

let _posts: PostsType[] | null = null;
let _notionClient: Client | null = null;
let _notionImagesStore: Store | null | undefined;

type NotionImageFile = {
    type: 'file' | 'external';
    file?: { url: string };
    external?: { url: string };
};

function getNotionClient(): Client {
    if (!_notionClient) {
        _notionClient = new Client({ auth: import.meta.env.NOTION_TOKEN });
    }

    return _notionClient;
}

function getNotionImagesStore(): Store | null {
    if (_notionImagesStore !== undefined) {
        return _notionImagesStore;
    }

    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_API_TOKEN;

    _notionImagesStore =
        siteID && token
            ? getStore({ name: 'notion-images', siteID, token })
            : getStore('notion-images');

    return _notionImagesStore;
}

function isNetlifyBlobsConfigurationError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);

    return /siteID|site id|token|NETLIFY_BLOBS_CONTEXT|environment|context/i.test(message);
}

function getStableNotionFileKey(url: string): string {
    const u = new URL(url);
    const parsedPath = path.parse(u.pathname);
    const pathWithoutExt = path.join(parsedPath.dir, parsedPath.name);
    // /secure.notion-static.com/UUID/filename.png

    return pathWithoutExt.replace(/^\//, '').replace(/\//g, '_');
}

function getFileUrl(file: NotionImageFile): string {
    if (file.type === 'file' && file.file?.url) {
        return file.file.url;
    }

    if (file.type === 'external' && file.external?.url) {
        return file.external.url;
    }

    throw new Error(`Notion image file does not contain a usable URL: ${JSON.stringify(file)}`);
}

function getImageFileFromPage(page: Parameters<typeof isFullPage>[0]): NotionImageFile {
    if (!isFullPage(page)) {
        throw new Error('Notion pages.retrieve did not return a full page object.');
    }

    const imageProperty = page.properties.Image;

    if (!imageProperty || imageProperty.type !== 'files' || imageProperty.files.length === 0) {
        throw new Error(`Fresh Notion page ${page.id} does not contain properties.Image files.`);
    }

    return imageProperty.files[0] as NotionImageFile;
}

async function getFreshNotionImageUrl(pageId: string): Promise<string> {
    const page = await getNotionClient().pages.retrieve({ page_id: pageId });
    return getFileUrl(getImageFileFromPage(page));
}

async function fetchNotionImageWithFreshUrl(pageId: string, cacheKey: string): Promise<Buffer> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
        const freshUrl = await getFreshNotionImageUrl(pageId);
        const res = await fetch(freshUrl);

        if (res.ok) {
            return Buffer.from(await res.arrayBuffer());
        }

        const body = await res.text().catch(() => '');
        lastError = new Error(
            [
                `Failed to download Notion image for ${cacheKey} (attempt ${attempt}/3)`,
                `Status: ${res.status} ${res.statusText}`,
                `URL: ${freshUrl}`,
                `Body: ${body.slice(0, 1000)}`,
            ].join('\n'),
        );

        console.error(lastError.message);

        if (res.status !== 403 || attempt === 3) {
            throw lastError;
        }
    }

    throw lastError ?? new Error(`Failed to download Notion image for ${cacheKey}`);
}

async function downloadNotionImageToAssets(url: string, slug: string, pageId: string, lastEditedTime: string): Promise<string> {
    const cacheKey = `page-${pageId}-${lastEditedTime}`;
    const ext = path.extname(new URL(url).pathname) || '.jpg';
    const stableKey = getStableNotionFileKey(url);

    // Deterministic filename keeps expired Notion URLs from breaking cached images.
    const fileName = `${slug}-${stableKey}${ext}`;

    const assetsDir = path.resolve(process.cwd(), `src/${imageSavePath}`);
    await fs.mkdir(assetsDir, { recursive: true });

    const filePath = path.join(assetsDir, fileName);
    const assetPath = `/src/${imageSavePath}/${fileName}`;

    // Blob is checked before the local asset. A local file can have survived a
    // previous build while the corresponding Content Layer URL has expired.
    const store = getNotionImagesStore();

    if (store) {
        try {
            const cachedImage = await store.get(cacheKey, { type: 'arrayBuffer' });

            if (cachedImage) {
                await fs.writeFile(filePath, Buffer.from(cachedImage));
                return assetPath;
            }
        } catch (error) {
            if (!isNetlifyBlobsConfigurationError(error)) {
                console.error(`Netlify Blobs read failed for ${cacheKey}:`, error);
                throw error;
            }

            console.warn(
                `Netlify Blobs is not configured for build-time notion image cache; falling back to a fresh Notion download. ${error instanceof Error ? error.message : String(error)}`,
            );
            _notionImagesStore = null;
        }
    }

    const buffer = await fetchNotionImageWithFreshUrl(pageId, cacheKey);
    await fs.writeFile(filePath, buffer);

    if (_notionImagesStore) {
        // Copy into a standalone ArrayBuffer because Buffer.buffer may be a
        // SharedArrayBuffer under newer Node.js type definitions.
        const blobData = new ArrayBuffer(buffer.byteLength);
        new Uint8Array(blobData).set(buffer);

        // Cache invalidation is encoded entirely in cacheKey. Do not put the
        // expiring presigned URL or other variable data in Blob metadata.
        await _notionImagesStore.set(cacheKey, blobData);
    }

    return assetPath;
}

export async function getNotionPostData(post: NotionPostItem): Promise<BlogPostDataType> {
    const { properties, cover } = post.data;
    //console.log("properties.Image: ", properties.Image.files[0].file.expiry_time)
    return {
        Name: properties.Name,
        Slug: properties.Slug,
        Date: properties.Date ? dateToDateObjects({ start: properties.Date.start.toISOString(), end: properties.Date.end?.toISOString() || null, time_zone: properties.Date.time_zone }) : null,
        Status: properties.Status,
        Summary: properties.Summary,
        Image: properties.Image && properties.Image.files.length > 0 
            ? await downloadNotionImageToAssets(properties.Image.files[0].type === 'file' 
                                                    ? properties.Image.files[0].file.url 
                                                    : properties.Image.files[0].external.url, properties.Slug, post.id, post.data.last_edited_time)
            : undefined,
    };
}

export async function getNotionPosts(): Promise<PostsType[]> {
    if (!_posts) {
        const blogPosts = await getCollection('blog');

        const processedPosts = await Promise.all(
            blogPosts.map(async (blogPost: NotionPostItem) => {
                const { properties } = blogPost.data;
                return {
                    body: blogPost.body || '',
                    data: await getNotionPostData(blogPost),
                    slug: properties.Slug,
                    rendered: await render(blogPost),
                };
            }),
        );

        _posts = processedPosts.map((p) => ({
            ...p,
            data: {
                ...p.data,
            },
        }));
    }
    return _posts;
}
