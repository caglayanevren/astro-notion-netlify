type ManagedBodyImage = {
    kind: 'body';
    sourceType: 'external';
    sourceUrlKey: string;
    fileName: string;
};

function normalizeSourceUrl(value: string): string | undefined {
    try {
        const parsed = new URL(value);
        return `${parsed.origin}${parsed.pathname}`;
    } catch {
        return undefined;
    }
}

function visit(node: any, callback: (node: any) => void): void {
    callback(node);
    if (Array.isArray(node?.children)) {
        for (const child of node.children) visit(child, callback);
    }
}

/**
 * Replaces external Notion image URLs with generated local assets before the
 * upstream loader marks image nodes for Astro's content-image transform.
 */
export function rehypeManagedNotionImages(images: ManagedBodyImage[]) {
    const assetsBySource = new Map(
        images.map((image) => [
            image.sourceUrlKey,
            `../../assets/notion-generated/${image.fileName.replaceAll('\\', '/')}`,
        ]),
    );

    return (tree: any) => {
        const occurrences = new Map<string, number>();
        visit(tree, (node) => {
            if (node?.type !== 'element' || node.tagName !== 'img' || typeof node.properties?.src !== 'string') {
                return;
            }

            const sourceKey = normalizeSourceUrl(node.properties.src);
            const assetPath = sourceKey ? assetsBySource.get(sourceKey) : undefined;
            if (!assetPath) return;

            const index = occurrences.get(assetPath) ?? 0;
            occurrences.set(assetPath, index + 1);
            const props = { ...node.properties, src: assetPath, index };
            node.properties = { __ASTRO_IMAGE_: JSON.stringify(props) };
        });
    };
}
