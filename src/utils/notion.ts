import { dateToDateObjects, richTextToPlainText, fileToUrl, fileToImageAsset } from '@astro-notion/loader';
import { getCollection, render } from 'astro:content';
import { type PostsType, type BlogPostDataType, type NotionPostItem, imageSavePath } from '../config';
import fs from 'node:fs/promises';
import path from 'node:path';

let _posts: PostsType[] | null = null;

function getStableNotionFileKey(url: string): string {
    const u = new URL(url);
    const parsedPath = path.parse(u.pathname);
    const pathWithoutExt = path.join(parsedPath.dir, parsedPath.name);
    // /secure.notion-static.com/UUID/filename.png

    return pathWithoutExt.replace(/^\//, '').replace(/\//g, '_');
}

async function downloadNotionImageToAssets(url: string, slug: string): Promise<string> {
    const ext = path.extname(new URL(url).pathname) || '.jpg';

    const stableKey = getStableNotionFileKey(url);

    // Deterministic filename keeps expired Notion URLs from breaking cached images.
    const fileName = `${slug}-${stableKey}${ext}`;

    const assetsDir = path.resolve(process.cwd(), `src/${imageSavePath}`);
    await fs.mkdir(assetsDir, { recursive: true });

    const filePath = path.join(assetsDir, fileName);
    const assetPath = `/src/${imageSavePath}/${fileName}`;

    try {
        await fs.access(filePath);
        return assetPath;
    } catch {
        const res = await fetch(url);
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(
                `Failed to download image (${res.status} ${res.statusText}): ${url}\n${body.slice(0, 300)}`,
            );
        }

        const buffer = Buffer.from(await res.arrayBuffer());
        await fs.writeFile(filePath, buffer);
        return assetPath;
    }
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
                                                    : properties.Image.files[0].external.url, properties.Slug) 
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
