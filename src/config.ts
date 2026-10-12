import type { RenderResult } from 'astro:content';
import { getCollection } from 'astro:content';

export const imageSavePath = "assets/notion";

export type NotionPostItem = Awaited<ReturnType<typeof getCollection<'blog'>>>[number];

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
