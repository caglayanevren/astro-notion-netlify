import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getStore } from '@netlify/blobs';
import { Client, isFullPage } from '@notionhq/client';

const projectRoot = process.cwd();
const assetsDirectory = path.resolve(projectRoot, 'src/assets/notion-generated');
const manifestPath = path.resolve(projectRoot, 'src/assets/notion-image-manifest.json');
const coverAssetModulePath = path.resolve(projectRoot, 'src/assets/notion-image-assets.ts');
const bodyAssetModulePath = path.resolve(projectRoot, 'src/assets/notion-body-image-assets.ts');
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

function safeFileSegment(value) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function extensionFromUrl(url) {
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  return ['.avif', '.gif', '.jpeg', '.jpg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
}

function fileUrl(file) {
  if (file?.type === 'file' && file.file?.url) return file.file.url;
  if (file?.type === 'external' && file.external?.url) return file.external.url;
  throw new Error('Notion image file does not contain a usable URL.');
}

function normalizeSourceUrl(url) {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}

function imageKey(image) {
  return image.kind === 'cover'
    ? `cover:${image.pageId}:${image.lastEditedTime}`
    : `body:${image.pageId}:${image.blockId}:${image.lastEditedTime}`;
}

function imageIdentity(image) {
  return image.kind === 'cover'
    ? `cover:${image.pageId}`
    : `body:${image.pageId}:${image.blockId}`;
}

function blobKey(image) {
  return image.kind === 'cover'
    ? `covers/${image.pageId}/${encodeURIComponent(image.lastEditedTime)}`
    : `body/${image.pageId}/${image.blockId}/${encodeURIComponent(image.lastEditedTime)}`;
}

function blobPrefix(image) {
  return image.kind === 'cover'
    ? `covers/${image.pageId}/`
    : `body/${image.pageId}/${image.blockId}/`;
}

function bodyFileNameFromNotionUrl(url, image) {
  if (image.sourceType === 'external') {
    return path.join(
      'body',
      'external',
      `${safeFileSegment(image.pageId)}-${safeFileSegment(image.blockId)}-${safeFileSegment(image.lastEditedTime)}${extensionFromUrl(url)}`,
    );
  }

  const parts = new URL(url).pathname.split('/').filter(Boolean);
  const [parentId, objectId, fileName] = parts;
  if (!parentId || !objectId || !fileName) {
    throw new Error(`Unsupported Notion file URL for body image block ${image.blockId}.`);
  }
  return path.join('body', parentId, `${objectId}.${extensionFromUrl(url).slice(1)}`);
}

function fileNameFor(image) {
  if (image.kind === 'body') return bodyFileNameFromNotionUrl(image.url, image);
  return path.join(
    'covers',
    `${safeFileSegment(image.pageId)}-${safeFileSegment(image.lastEditedTime)}${extensionFromUrl(image.url)}`,
  );
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
    if (!isImageBuffer(buffer)) throw new Error('Downloaded Notion image is not a recognized image file.');
    return buffer;
  }, 'Notion image download');
}

async function loadPreviousManifest() {
  try {
    return JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 2, images: [] };
    throw error;
  }
}

async function resolveDataSourceId(client, databaseId) {
  // İsterseniz doğrudan NOTION_DATA_SOURCE_ID env değişkeni tanımlayıp bu çağrıyı atlayabilirsiniz.
  if (process.env.NOTION_DATA_SOURCE_ID) return process.env.NOTION_DATA_SOURCE_ID;

  const database = await retry(
    () => client.databases.retrieve({ database_id: databaseId }),
    'Notion database retrieve',
  );
  const dataSources = database.data_sources ?? [];
  if (dataSources.length === 0) {
    throw new Error(`Database ${databaseId} has no accessible data sources.`);
  }
  if (dataSources.length > 1) {
    console.warn(`Database has ${dataSources.length} data sources; using "${dataSources[0].name}". Set NOTION_DATA_SOURCE_ID to choose one.`);
  }
  return dataSources[0].id;
}

async function getPublishedPages(client, dataSourceId) {
  const pages = [];
  let startCursor;
  do {
    const response = await retry(() => client.dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: startCursor,
      filter: { property: 'Status', select: { equals: 'Published' } },
    }), 'Notion data source query');
    pages.push(...response.results.filter(isFullPage));
    startCursor = response.has_more ? response.next_cursor : undefined;
  } while (startCursor);
  return pages;
}
async function listBodyImages(client, pageId) {
  const images = [];
  async function visitChildren(blockId) {
    let startCursor;
    do {
      const response = await retry(() => client.blocks.children.list({ block_id: blockId, start_cursor: startCursor }), `Notion blocks for ${blockId}`);
      for (const block of response.results) {
        if (block.type === 'image' && block.image) {
          const url = fileUrl(block.image);
          images.push({
            kind: 'body',
            pageId,
            blockId: block.id,
            lastEditedTime: block.last_edited_time,
            sourceType: block.image.type,
            url,
            sourceUrlKey: normalizeSourceUrl(url),
          });
        }
        if (block.has_children) await visitChildren(block.id);
      }
      startCursor = response.has_more ? response.next_cursor : undefined;
    } while (startCursor);
  }
  await visitChildren(pageId);
  return images;
}

async function getPageImages(client, page) {
  const images = await listBodyImages(client, page.id);
  const freshPage = await retry(() => client.pages.retrieve({ page_id: page.id }), `Notion page ${page.id}`);
  if (isFullPage(freshPage) && freshPage.properties.Image?.type === 'files' && freshPage.properties.Image.files[0]) {
    const cover = freshPage.properties.Image.files[0];
    const url = fileUrl(cover);
    images.unshift({
      kind: 'cover',
      pageId: page.id,
      lastEditedTime: freshPage.last_edited_time,
      sourceType: cover.type,
      url,
      sourceUrlKey: normalizeSourceUrl(url),
    });
  }
  return images;
}

async function copyIfPresent(source, destination) {
  try {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function syncImage({ image, store, previousByKey, stagingDirectory }) {
  const key = imageKey(image);
  const fileName = fileNameFor(image);
  const destination = path.join(stagingDirectory, fileName);
  const previous = previousByKey.get(key);

  if (!previous?.stale && previous && await copyIfPresent(path.join(assetsDirectory, previous.fileName), destination)) {
    return { ...image, key, fileName: previous.fileName, blobKey: previous.blobKey, stale: false };
  }

  const keyForBlob = blobKey(image);
  let buffer;
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
    buffer = await fetchImage(image.url);
    if (store) {
      try {
        await store.set(keyForBlob, buffer);
      } catch (error) {
        console.warn(`Blob write failed for ${keyForBlob}; continuing with the staged asset. ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, Buffer.from(buffer));
  return { ...image, key, fileName, blobKey: keyForBlob, stale: false };
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

function renderAssetModule(images, exportName) {
  const imports = images
    .map((image, index) => `import image${index} from './notion-generated/${image.fileName.replaceAll('\\', '/')}';`)
    .join('\n');
  const entries = images
    .map((image, index) => `  ${JSON.stringify(`/src/assets/notion-generated/${image.fileName.replaceAll('\\', '/')}`)}: image${index},`)
    .join('\n');
  return `${imports}\n\nexport const ${exportName} = {\n${entries}\n} as const;\n`;
}

async function pruneOldBlobVersions(store, images, previousImages) {
  if (!store || !process.argv.includes('--prune')) return;
  const imageByPrefix = new Map();
  for (const image of [...images, ...previousImages]) imageByPrefix.set(blobPrefix(image), image);
  for (const [prefix] of imageByPrefix) {
    const listed = await store.list({ prefix });
    const stale = listed.blobs.map((blob) => blob.key).sort().reverse().slice(keepBlobVersions);
    await Promise.all(stale.map((key) => store.delete(key)));
  }
}

await loadLocalEnv();
const client = new Client({ auth: requiredEnvironment('NOTION_TOKEN') });
const databaseId = requiredEnvironment('NOTION_DATABASE_ID');
const dataSourceId = await resolveDataSourceId(client, databaseId);
const store = createStore();
const previousManifest = await loadPreviousManifest();
const previousByKey = new Map(previousManifest.images.map((image) => [image.key, image]));
const previousByIdentity = new Map(
  previousManifest.images
    .slice()
    .sort((a, b) => a.lastEditedTime.localeCompare(b.lastEditedTime))
    .map((image) => [imageIdentity(image), image]),
);
const stagingDirectory = `${assetsDirectory}.staging-${crypto.randomUUID()}`;

await fs.mkdir(path.join(stagingDirectory, 'covers'), { recursive: true });
await fs.mkdir(path.join(stagingDirectory, 'body'), { recursive: true });
await fs.writeFile(path.join(stagingDirectory, '.gitkeep'), '');
try {
  const pages = await getPublishedPages(client, dataSourceId);
  const pageImageGroups = await mapWithConcurrency(pages, concurrency, (page) => getPageImages(client, page));
  const imagesToSync = pageImageGroups.flat();
  const images = await mapWithConcurrency(imagesToSync, concurrency, async (image) => {
    try {
      return await syncImage({ image, store, previousByKey, stagingDirectory });
    } catch (error) {
      const fallback = previousByIdentity.get(imageIdentity(image));
      const fallbackPath = fallback && path.join(assetsDirectory, fallback.fileName);
      if (!fallback || !fallbackPath || !await copyIfPresent(fallbackPath, path.join(stagingDirectory, fallback.fileName))) {
        throw error;
      }
      console.warn(`Using the previous ${image.kind} image for ${image.pageId} because the current image could not be prepared.`);
      return {
        ...image,
        key: imageKey(image),
        fileName: fallback.fileName,
        blobKey: fallback.blobKey,
        stale: true,
      };
    }
  });
  const covers = images.filter((image) => image.kind === 'cover');
  const bodyImages = images.filter((image) => image.kind === 'body');
  const manifest = { version: 2, generatedAt: new Date().toISOString(), images };
  const temporaryManifestPath = `${manifestPath}.staging-${crypto.randomUUID()}`;
  const temporaryCoverModulePath = `${coverAssetModulePath}.staging-${crypto.randomUUID()}`;
  const temporaryBodyModulePath = `${bodyAssetModulePath}.staging-${crypto.randomUUID()}`;
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(temporaryManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.writeFile(temporaryCoverModulePath, renderAssetModule(covers, 'notionImageAssets'));
  await fs.writeFile(temporaryBodyModulePath, renderAssetModule(bodyImages, 'notionBodyImageAssets'));
  await replaceDirectory(stagingDirectory);
  await fs.rename(temporaryCoverModulePath, coverAssetModulePath);
  await fs.rename(temporaryBodyModulePath, bodyAssetModulePath);
  await fs.rename(temporaryManifestPath, manifestPath);
  await pruneOldBlobVersions(store, images, previousManifest.images);
  console.log(`Notion image sync complete: ${covers.length} cover and ${bodyImages.length} body images prepared.`);
} catch (error) {
  await fs.rm(stagingDirectory, { recursive: true, force: true });
  throw error;
}
