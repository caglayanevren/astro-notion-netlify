import fs from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@notionhq/client';

const projectRoot = process.cwd();
const assetsDirectory = path.resolve(projectRoot, 'src/assets/notion');

function loadLocalEnv() {
  const envPath = path.resolve(projectRoot, '.env');

  return fs.readFile(envPath, 'utf8')
    .then((contents) => {
      for (const line of contents.split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!match || process.env[match[1]]) continue;

        process.env[match[1]] = match[2]
          .replace(/^['"]|['"]$/g, '')
          .replace(/\\n/g, '\n');
      }
    })
    .catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getStableNotionFileKey(url) {
  const parsedUrl = new URL(url);
  const parsedPath = path.parse(parsedUrl.pathname);
  const pathWithoutExtension = path.join(parsedPath.dir, parsedPath.name);

  return pathWithoutExtension.replace(/^\//, '').replace(/\//g, '_');
}

function getFileUrl(file) {
  if (file?.type === 'file' && file.file?.url) return file.file.url;
  if (file?.type === 'external' && file.external?.url) return file.external.url;
  throw new Error(`Notion image file does not contain a usable URL: ${JSON.stringify(file)}`);
}

function getPlainText(property) {
  return property?.title?.map((item) => item.plain_text).join('')
    || property?.rich_text?.map((item) => item.plain_text).join('')
    || '';
}

async function getPublishedPages(client, databaseId) {
  const pages = [];
  let startCursor;

  do {
    const response = await client.databases.query({
      database_id: databaseId,
      start_cursor: startCursor,
      filter: {
        property: 'Status',
        select: { equals: 'Published' },
      },
    });

    pages.push(...response.results);
    startCursor = response.has_more ? response.next_cursor : undefined;
  } while (startCursor);

  return pages;
}

async function syncPageImage(client, page) {
  const properties = page.properties;
  const slug = getPlainText(properties.Slug);
  const imageFiles = properties.Image?.type === 'files' ? properties.Image.files : [];

  if (!slug || imageFiles.length === 0) return false;

  const freshPage = await client.pages.retrieve({ page_id: page.id });
  const freshImageFiles = freshPage.properties.Image?.type === 'files'
    ? freshPage.properties.Image.files
    : [];

  if (freshImageFiles.length === 0) return false;

  const imageUrl = getFileUrl(freshImageFiles[0]);
  const extension = path.extname(new URL(imageUrl).pathname) || '.jpg';
  const fileName = `${slug}-${getStableNotionFileKey(imageUrl)}${extension}`;
  const filePath = path.join(assetsDirectory, fileName);

  try {
    await fs.access(filePath);
    console.log(`Notion image already exists: ${fileName}`);
    return false;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download ${fileName}: ${response.status} ${response.statusText}`);
  }

  await fs.writeFile(filePath, Buffer.from(await response.arrayBuffer()));
  console.log(`Downloaded Notion image: ${fileName}`);
  return true;
}

await loadLocalEnv();
const client = new Client({ auth: requiredEnvironment('NOTION_TOKEN') });
const databaseId = requiredEnvironment('NOTION_DATABASE_ID');

await fs.mkdir(assetsDirectory, { recursive: true });
const pages = await getPublishedPages(client, databaseId);
let downloadedCount = 0;

for (const page of pages) {
  if (await syncPageImage(client, page)) downloadedCount++;
}

console.log(`Notion image prebuild sync complete: ${downloadedCount} downloaded, ${pages.length} published pages checked.`);
