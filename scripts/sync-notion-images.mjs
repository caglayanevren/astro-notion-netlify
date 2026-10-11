import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getStore } from '@netlify/blobs';
import { Client, isFullPage } from '@notionhq/client';

const projectRoot = process.cwd();
const assetsDirectory = path.resolve(projectRoot, 'src/assets/notion-generated');
const manifestPath = path.resolve(projectRoot, 'src/assets/notion-image-manifest.json');
const assetModulePath = path.resolve(projectRoot, 'src/assets/notion-image-assets.ts');
const storeName = 'notion-images';
const concurrency = 4;
const keepBlobVersions = 2;

async function loadLocalEnv() {
  const envPath = path.resolve(projectRoot, '.env');
  try {
    const contents = await fs.readFile(envPath, 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '').replace(/\\n/g, '\n');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function imageKey(pageId, lastEditedTime) {
  return `${pageId}:${lastEditedTime}`;
}

function safeFileSegment(value) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function blobKey(pageId, lastEditedTime) {
  return `covers/${pageId}/${encodeURIComponent(lastEditedTime)}`;
}

function extensionFromUrl(url) {
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  return ['.avif', '.gif', '.jpeg', '.jpg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
}

function fileName(pageId, lastEditedTime, extension) {
  return `${safeFileSegment(pageId)}-${safeFileSegment(lastEditedTime)}${extension}`;
}

function fileUrl(file) {
  if (file?.type === 'file' && file.file?.url) return file.file.url;
  if (file?.type === 'external' && file.external?.url) return file.external.url;
  throw new Error('Notion image file does not contain a usable URL.');
}

function imageFileFromPage(page) {
  if (!isFullPage(page)) throw new Error(`Notion page ${page.id} is not a full page.`);
  const property = page.properties.Image;
  if (!property || property.type !== 'files' || property.files.length === 0) {
    throw new Error(`Notion page ${page.id} does not contain properties.Image.`);
  }
  return property.files[0];
}

function isImageBuffer(buffer) {
  if (buffer.byteLength < 12) return false;
  const bytes = new Uint8Array(buffer);
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const gif = bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46;
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  const avif = String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp';
  return jpeg || png || gif || webp || avif;
}

function createStore() {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_API_TOKEN;

  if (siteID && token) return getStore({ name: storeName, siteID, token });
  if (process.env.NETLIFY_BLOBS_CONTEXT) return getStore(storeName);

  console.warn('Netlify Blobs credentials are unavailable; using Notion without a persistent image cache.');
  return null;
}

async function retry(operation, label) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === 2) break;
      const delay = 400 * 2 ** attempt + Math.round(Math.random() * 200);
      console.warn(`${label} failed (attempt ${attempt + 1}/3); retrying in ${delay}ms.`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

async function fetchImage(url) {
  return retry(async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`Image download failed: ${response.status} ${response.statusText}`);
    const buffer = await response.arrayBuffer();
    if (!isImageBuffer(buffer)) throw new Error('Downloaded cover is not a recognized image file.');
    return buffer;
  }, 'Notion image download');
}

async function loadPreviousManifest() {
  try {
    return JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, images: [] };
    throw error;
  }
}

async function getPublishedPages(client, databaseId) {
  const pages = [];
  let startCursor;
  do {
    const response = await retry(() => client.databases.query({
      database_id: databaseId,
      start_cursor: startCursor,
      filter: { property: 'Status', select: { equals: 'Published' } },
    }), 'Notion database query');
    pages.push(...response.results);
    startCursor = response.has_more ? response.next_cursor : undefined;
  } while (startCursor);
  return pages;
}

async function copyIfPresent(source, destination) {
  try {
    await fs.copyFile(source, destination);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function syncPageImage({ client, store, page, previousByKey, stagingDirectory }) {
  const revision = page.last_edited_time;
  const key = imageKey(page.id, revision);
  const listedImage = imageFileFromPage(page);
  const extension = extensionFromUrl(fileUrl(listedImage));
  const name = fileName(page.id, revision, extension);
  const destination = path.join(stagingDirectory, name);
  const previous = previousByKey.get(key);

  if (!previous?.stale && previous && await copyIfPresent(path.join(assetsDirectory, previous.fileName), destination)) {
    return {
      key,
      pageId: page.id,
      lastEditedTime: revision,
      fileName: previous.fileName,
      blobKey: previous.blobKey,
      stale: false,
    };
  }

  let buffer;
  const keyForBlob = blobKey(page.id, revision);
  if (store) {
    try {
      buffer = await store.get(keyForBlob, { type: 'arrayBuffer' });
      if (buffer && !isImageBuffer(buffer)) {
        console.warn(`Ignoring invalid Blob cache entry ${keyForBlob}.`);
        buffer = null;
      }
    } catch (error) {
      console.warn(`Blob read failed for ${keyForBlob}; falling back to Notion. ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!buffer) {
    const freshPage = await retry(() => client.pages.retrieve({ page_id: page.id }), `Notion page ${page.id}`);
    buffer = await fetchImage(fileUrl(imageFileFromPage(freshPage)));
    if (store) {
      try {
        await store.set(keyForBlob, buffer);
      } catch (error) {
        console.warn(`Blob write failed for ${keyForBlob}; continuing with the staged asset. ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  await fs.writeFile(destination, Buffer.from(buffer));
  return { key, pageId: page.id, lastEditedTime: revision, fileName: name, blobKey: keyForBlob, stale: false };
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

async function replaceDirectory(stagingDirectory) {
  const backupDirectory = `${assetsDirectory}.previous-${crypto.randomUUID()}`;
  try {
    await fs.rename(assetsDirectory, backupDirectory);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    await fs.rename(stagingDirectory, assetsDirectory);
    await fs.rm(backupDirectory, { recursive: true, force: true });
  } catch (error) {
    await fs.rename(backupDirectory, assetsDirectory).catch(() => {});
    throw error;
  }
}

function renderAssetModule(images) {
  const imports = images
    .map((image, index) => `import image${index} from './notion-generated/${image.fileName}';`)
    .join('\n');
  const entries = images
    .map((image, index) => `  ${JSON.stringify(`/src/assets/notion-generated/${image.fileName}`)}: image${index},`)
    .join('\n');
  return `${imports}\n\nexport const notionImageAssets = {\n${entries}\n} as const;\n`;
}

async function pruneOldBlobVersions(store, images, previousImages) {
  if (!store || !process.argv.includes('--prune')) return;
  const pageIds = [...new Set([...images, ...previousImages].map((image) => image.pageId))];
  for (const pageId of pageIds) {
    const listed = await store.list({ prefix: `covers/${pageId}/` });
    const stale = listed.blobs.map((blob) => blob.key).sort().reverse().slice(keepBlobVersions);
    await Promise.all(stale.map((key) => store.delete(key)));
  }
}

await loadLocalEnv();
const client = new Client({ auth: requiredEnvironment('NOTION_TOKEN') });
const databaseId = requiredEnvironment('NOTION_DATABASE_ID');
const store = createStore();
const previousManifest = await loadPreviousManifest();
const previousByKey = new Map(previousManifest.images.map((image) => [image.key, image]));
const previousByPage = new Map(
  previousManifest.images
    .slice()
    .sort((a, b) => a.lastEditedTime.localeCompare(b.lastEditedTime))
    .map((image) => [image.pageId, image]),
);
const stagingDirectory = `${assetsDirectory}.staging-${crypto.randomUUID()}`;

await fs.mkdir(stagingDirectory, { recursive: true });
await fs.writeFile(path.join(stagingDirectory, '.gitkeep'), '');
try {
  const pages = await getPublishedPages(client, databaseId);
  const images = await mapWithConcurrency(pages, concurrency, async (page) => {
    try {
      return await syncPageImage({ client, store, page, previousByKey, stagingDirectory });
    } catch (error) {
      const fallback = previousByPage.get(page.id);
      if (!fallback || !await copyIfPresent(path.join(assetsDirectory, fallback.fileName), path.join(stagingDirectory, fallback.fileName))) {
        throw error;
      }
      console.warn(`Using the previous cover for ${page.id} because the current image could not be prepared.`);
      return {
        key: imageKey(page.id, page.last_edited_time),
        pageId: page.id,
        lastEditedTime: page.last_edited_time,
        fileName: fallback.fileName,
        blobKey: fallback.blobKey,
        stale: true,
      };
    }
  });
  const manifest = { version: 1, generatedAt: new Date().toISOString(), images };
  const temporaryManifestPath = `${manifestPath}.staging-${crypto.randomUUID()}`;
  const temporaryAssetModulePath = `${assetModulePath}.staging-${crypto.randomUUID()}`;
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(temporaryManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.writeFile(temporaryAssetModulePath, renderAssetModule(images));
  await replaceDirectory(stagingDirectory);
  await fs.rename(temporaryManifestPath, manifestPath);
  await fs.rename(temporaryAssetModulePath, assetModulePath);
  await pruneOldBlobVersions(store, images, previousManifest.images);
  console.log(`Notion image sync complete: ${images.length} published cover images prepared.`);
} catch (error) {
  await fs.rm(stagingDirectory, { recursive: true, force: true });
  throw error;
}
