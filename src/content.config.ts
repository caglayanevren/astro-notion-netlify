import { defineCollection, z } from 'astro:content';
//import { notionLoader } from '@astro-notion/loader';
import { notionPageSchema, propertySchema, transformedPropertySchema } from '@astro-notion/loader/schemas';
import { astroNotionLoaderPatch } from '@utils/astronotionloaderpatch';

const blog = defineCollection({
    loader: astroNotionLoaderPatch({
        auth: import.meta.env.NOTION_TOKEN,
        database_id: import.meta.env.NOTION_DATABASE_ID,
        // Use Notion sorting and filtering
        filter: {
            property: 'Status',
            select: {
                equals: 'Published',
            },
        },
    }),
    schema: notionPageSchema({
        properties: z.object({
            // Converts to a primitive string
            Name: transformedPropertySchema.title,
            Slug: transformedPropertySchema.rich_text,
            Date: transformedPropertySchema.date,
            Status: transformedPropertySchema.select,
            Summary: transformedPropertySchema.rich_text,
            Image: propertySchema.files,

            // Converts to a Notion API created_time object
            //Created: propertySchema.created_time.optional(),
        }),
    }).extend({
        last_edited_time: z.string(),
    }),
});

export const collections = {
    blog: blog,
};
