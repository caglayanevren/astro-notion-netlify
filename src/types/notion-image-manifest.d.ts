declare module '*notion-image-manifest.json' {
    const manifest: unknown;
    export default manifest;
}

declare module '*notion-image-assets' {
    const notionImageAssets: Record<string, ImageMetadata>;
    export { notionImageAssets };
}
