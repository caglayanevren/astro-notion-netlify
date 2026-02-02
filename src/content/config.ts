import { defineCollection, z } from 'astro:content';
import { notionLoader } from 'notion-astro-loader';
import { notionPageSchema, propertySchema, transformedPropertySchema } from 'notion-astro-loader/schemas';

const defaultImageUrl = 'https://placehold.co/600x500.png'; // when image missing somehow

const blog = defineCollection({
    loader: notionLoader({
        auth: import.meta.env.NOTION_TOKEN,
        database_id: import.meta.env.NOTION_DATABASE_ID,
        // Use Notion sorting and filtering
        //filter: {
        //    property: 'Status',
        //    select: {
        //        equals: 'Published',
        //    },
        //},
    }),
    schema: notionPageSchema({
        properties: z.object({
            // Converts to a primitive string
            Name: transformedPropertySchema.title,
            Slug: transformedPropertySchema.rich_text,
            Date: transformedPropertySchema.date,
            Status: transformedPropertySchema.select,
            Summary: transformedPropertySchema.rich_text,
            Cover: propertySchema.files.transform((files) => {
                const firstFile = files.files[0];
                if (!firstFile) return defaultImageUrl;
                if (firstFile.type === 'file') {
                    return firstFile.file.url;
                } else if (firstFile.type === 'external') {
                    return firstFile.external.url;
                }
                return defaultImageUrl;
            }),

            // Converts to a Notion API created_time object
            //Created: propertySchema.created_time.optional(),
        }),
    }),
});

export const collections = {
    blog: blog,
};
