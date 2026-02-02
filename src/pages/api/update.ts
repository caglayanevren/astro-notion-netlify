export const prerender = false;

import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
    const url = new URL(request.url);
    const secret = url.searchParams.get('secret');

    // Şifre kontrolü
    if (secret !== import.meta.env.UPDATE_SECRET) {
        return new Response(JSON.stringify({ message: 'Yetkisiz Erişim' }), { status: 401 });
    }

    try {
        // Netlify'ı tetikle
        const response = await fetch(import.meta.env.NETLIFY_HOOK_URL, {
            method: 'POST',
        });

        if (response.ok) {
            return new Response(JSON.stringify({ message: 'Güncelleme Başlatıldı! 1-2 dakika içinde site yenilenecek.' }), { status: 200 });
        } else {
            return new Response(JSON.stringify({ message: 'Netlify Tetiklenemedi' }), { status: 500 });
        }
    } catch (error) {
        return new Response(JSON.stringify({ message: 'Sunucu Hatası' }), { status: 500 });
    }
};
