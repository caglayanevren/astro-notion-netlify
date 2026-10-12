declare module '*notion-image-manifest.json' {
    const manifest: unknown;
    export default manifest;
}

declare module '*notion-image-assets' {
    const notionImageAssets: Record<string, ImageMetadata>;
    export { notionImageAssets };
}

declare module '*notion-body-image-assets' {
    const notionBodyImageAssets: Record<string, ImageMetadata>;
    export { notionBodyImageAssets };
}
