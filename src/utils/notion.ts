import { dateToDateObjects, richTextToPlainText, fileToUrl, fileToImageAsset } from '@chlorinec-pkgs/notion-astro-loader';
import { getCollection, render } from 'astro:content';
import type { RenderResult } from 'astro:content';
import fs from 'node:fs/promises';
import path from 'node:path';

export type BlogPostDataType = {
    Name: string;
    Slug: string;
    Date: {
        start: Date;
        end: Date | null;
        time_zone: string | null;
    } | null;
    Status: string | null;
    Summary: string;
    Image: string | undefined;
};

export type PostsType = {
    body: string;
    data: BlogPostDataType;
    slug: string;
    rendered: RenderResult;
};

let _posts: PostsType[] | null = null;

function getStableNotionFileKey(url: string): string {
    const u = new URL(url);
    const path = u.pathname;
    // /secure.notion-static.com/UUID/filename.png

    return path.replace(/^\//, '').replace(/\//g, '_').replace('.jpg','');
}

async function downloadNotionImageToAssets(url: string, slug: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download image: ${url}`);

    const buffer = Buffer.from(await res.arrayBuffer());

    const ext = path.extname(new URL(url).pathname) || '.jpg';

    const stableKey = getStableNotionFileKey(url);

    // ✅ deterministic filename
    const fileName = `${slug}-${stableKey}${ext}`;

    const assetsDir = path.resolve(process.cwd(), 'src/assets/notion');
    await fs.mkdir(assetsDir, { recursive: true });

    const filePath = path.join(assetsDir, fileName);

    // ✅ cache: varsa tekrar indirme
    try {
        await fs.access(filePath);
        return `/src/assets/notion/${fileName}`;
    } catch {
        await fs.writeFile(filePath, buffer);
        return `/src/assets/notion/${fileName}`;
    }
} 

export type NotionPostItem = Awaited<ReturnType<typeof getCollection<'blog'>>>[number];

export async function getNotionPostData(post: NotionPostItem): Promise<BlogPostDataType> {
    const { properties, cover } = post.data;
    return {
        Name: properties.Name,
        Slug: properties.Slug,
        Date: properties.Date ? dateToDateObjects({ start: properties.Date.start.toISOString(), end: properties.Date.end?.toISOString() || null, time_zone: properties.Date.time_zone }) : null,
        Status: properties.Status,
        Summary: properties.Summary,
        Image: properties.Image && properties.Image.files.length > 0 ? await downloadNotionImageToAssets(properties.Image.files[0].type === 'file' ? properties.Image.files[0].file.url : properties.Image.files[0].external.url, properties.Slug) : undefined,
    };
}

export async function getNotionPosts(): Promise<PostsType[]> {
    if (!_posts) {
        const blogPosts = await getCollection('blog');

        const processedPosts = await Promise.all(
            blogPosts.map(async (p) => {
                const { properties } = p.data;
                return {
                    body: p.body || '',
                    data: await getNotionPostData(p),
                    slug: properties.Slug,
                    rendered: await render(p),
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
