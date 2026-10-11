import { dateToDateObjects } from '@astro-notion/loader';
import { getCollection, render } from 'astro:content';
import imageManifest from '../assets/notion-image-manifest.json';
import { type PostsType, type BlogPostDataType, type NotionPostItem } from '../config';

type NotionImageManifestEntry = {
    key: string;
    pageId: string;
    lastEditedTime: string;
    fileName: string;
    blobKey: string;
};

type NotionImageManifest = {
    version: number;
    generatedAt: string;
    images: NotionImageManifestEntry[];
};

let postsPromise: Promise<PostsType[]> | undefined;

const manifest = imageManifest as NotionImageManifest;
const imagesByRevision = new Map(
    manifest.images.map((image) => [`${image.pageId}:${image.lastEditedTime}`, image]),
);

function getImageAssetPath(post: NotionPostItem): string | undefined {
    const image = imagesByRevision.get(`${post.id}:${post.data.last_edited_time}`);
    return image ? `/src/assets/notion-generated/${image.fileName}` : undefined;
}

export async function getNotionPostData(post: NotionPostItem): Promise<BlogPostDataType> {
    const { properties } = post.data;
    return {
        Name: properties.Name,
        Slug: properties.Slug,
        Date: properties.Date
            ? dateToDateObjects({
                start: properties.Date.start.toISOString(),
                end: properties.Date.end?.toISOString() || null,
                time_zone: properties.Date.time_zone,
            })
            : null,
        Status: properties.Status,
        Summary: properties.Summary,
        Image: getImageAssetPath(post),
    };
}

async function loadNotionPosts(): Promise<PostsType[]> {
    const blogPosts = await getCollection('blog');
    return Promise.all(
        blogPosts.map(async (blogPost: NotionPostItem) => ({
            body: blogPost.body || '',
            data: await getNotionPostData(blogPost),
            slug: blogPost.data.properties.Slug,
            rendered: await render(blogPost),
        })),
    );
}

export function getNotionPosts(): Promise<PostsType[]> {
    postsPromise ??= loadNotionPosts();
    return postsPromise;
}
