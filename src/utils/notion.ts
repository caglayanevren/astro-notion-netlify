import { dateToDateObjects, richTextToPlainText, fileToUrl, fileToImageAsset } from '@chlorinec-pkgs/notion-astro-loader';
//import type { GetImageResult } from 'astro';
import { getCollection, render } from 'astro:content';
import type { RenderResult } from 'astro:content';

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

export type NotionPostItem = Awaited<ReturnType<typeof getCollection<'blog'>>>[number];

export async function getNotionPostData(post: NotionPostItem): Promise<BlogPostDataType> {
    const { properties, cover } = post.data;
    return {
        Name: properties.Name,
        Slug: properties.Slug,
        Date: properties.Date ? dateToDateObjects({ start: properties.Date.start.toISOString(), end: properties.Date.end?.toISOString() || null, time_zone: properties.Date.time_zone }) : null,
        Status: properties.Status,
        Summary: properties.Summary,
        Image: properties.Image && properties.Image.files.length > 0 ? (await fileToImageAsset(properties.Image.files[0])).src : undefined,
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
