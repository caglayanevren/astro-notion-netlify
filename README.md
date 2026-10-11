# Notion destekli Astro blogu

## Blogu kullanma

Yazılar Notion veritabanından yönetilir. Yeni bir yazı için veritabanında yeni bir sayfa oluşturun; sayfa içeriği doğrudan yazının gövdesi olur. Sitenin beklediği alanlar şunlardır:

| Notion alanı | Tür | Kullanımı |
| --- | --- | --- |
| `Name` | Başlık | Yazı başlığı |
| `Slug` | Metin | Yazının benzersiz URL'si; ör. `ilk-yazim` → `/blog/ilk-yazim` |
| `Date` | Tarih | Listeleme sırası ve tarih bilgisi |
| `Status` | Seçim | Yalnızca değeri `Published` olan yazılar sitede görünür |
| `Summary` | Metin | Ana sayfadaki kısa açıklama |
| `Image` | Dosyalar | Ana sayfadaki kapak görseli; ilk dosya kullanılır |

Notion sayfasını hazırladıktan sonra `Status` değerini `Published` yapın. Değişikliğin siteye yansıması için Netlify'da yeni bir build başlatın. Bu işlem, `GET` veya `POST /api/update?secret=<UPDATE_SECRET>` çağrısıyla da yapılabilir; endpoint doğrulandıktan sonra `NETLIFY_HOOK_URL` adresindeki build hook'unu tetikler.

Yerelde çalışmak için proje kökünde aşağıdaki değişkenleri içeren bir `.env` dosyası oluşturun:

```env
NOTION_TOKEN=...
NOTION_DATABASE_ID=...
UPDATE_SECRET=...
NETLIFY_HOOK_URL=...
# İsteğe bağlı: kapak görselleri için kalıcı Netlify Blob önbelleği
NETLIFY_SITE_ID=...
NETLIFY_AUTH_TOKEN=...
```

Ardından `npm install` ve `npm run dev` komutlarını çalıştırın. `dev` ve `build` komutları önce Notion kapak görsellerini eşitler. Eski Blob sürümlerini temizlemek gerektiğinde `npm run prune:notion-images` kullanılabilir.

## Sistemin çalışma şekli: Notion verisinin yaşam döngüsü

1. Editör yazıyı Notion veritabanında oluşturur veya günceller. `Published` durumundaki kayıtlar yayın adayıdır.
2. Geliştirme ya da build başlangıcında `scripts/sync-notion-images.mjs`, Notion API ile yayınlanmış sayfaları sorgular ve her kaydın `Image` alanındaki ilk kapak görselini hazırlar.
3. Betik aynı sayfanın aynı `last_edited_time` sürümünü önce yerel önbellekte, uygunsa Netlify Blobs'ta arar. Bulamazsa kısa ömürlü Notion URL'sinden indirir; mümkünse Blob'a yazar.
4. Hazırlanan dosyalar `src/assets/notion-generated/` altında tutulur. Betik ayrıca hangi sayfa/sürümün hangi dosyaya karşılık geldiğini `src/assets/notion-image-manifest.json` içinde, Astro'nun görseli import edebilmesini de `src/assets/notion-image-assets.ts` içinde üretir.
5. Astro Content Layer, `src/content.config.ts` içindeki loader aracılığıyla Notion'dan yazı metnini ve özelliklerini alır. Loader yalnızca `Status = Published` olan sayfaları seçer; şema veriyi güvenli tiplere dönüştürür.
6. `src/utils/notion.ts`, Content Layer kayıtlarını sayfa bileşenlerinin kullanacağı biçime çevirir. Sayfanın son düzenleme zamanı manifestteki kayıtla eşleştirilerek kapak görseli yolu bulunur. Sonuç, build boyunca tekrar kullanılmak üzere bellekte önbelleğe alınır.
7. Ana sayfa yazıları tarihe göre listeler; dinamik blog sayfası her `Slug` için statik bir yol üretir ve Notion gövdesini HTML olarak render eder. Kapak görseli gerekiyorsa Astro'nun görsel optimizasyonu devreye girer.
8. Notion güncellemesinden sonra Netlify build hook'u tetiklenirse süreç yeniden çalışır ve yeni dağıtım, güncel içerikle yayınlanır.

## Koda katkı için dosya rehberi

| Dosya | Sorumluluğu |
| --- | --- |
| `src/content.config.ts` | Notion koleksiyonunu, yayın filtresini ve alan şemasını tanımlar. Notion veritabanına alan eklerken ilk bakılacak yerdir. |
| `src/config.ts` | Uygulama içindeki blog veri tiplerini ve Notion görsellerinin hedef yolunu tanımlar. |
| `src/utils/astronotionloaderpatch.ts` | Haricî Notion loader'ına `last_edited_time` bilgisini ekleyen uyumluluk katmanıdır. Görsel önbelleğinin sürüm eşleştirmesi buna dayanır. |
| `scripts/sync-notion-images.mjs` | Notion kapaklarını indirir/önbellekten alır, Blob önbelleğini yönetir ve manifest ile asset modülünü üretir. |
| `src/utils/notion.ts` | Content Layer verisini sayfaların kullandığı post modeline dönüştürür; kapak görselini manifestten çözer. |
| `src/pages/index.astro` | Yayınlanmış yazıların ana sayfa listesini oluşturur. |
| `src/pages/blog/[slug].astro` | Her yazı için `/blog/<slug>` statik sayfasını üretir ve içeriği render eder. |
| `src/components/misc/ImageWrapper.astro` | Hazırlanmış kapak dosyasını Astro `Image` bileşenine bağlar; WebP optimizasyonunu uygular. |
| `src/pages/api/update.ts` | Secret doğrulamasından sonra Netlify build hook'unu çağıran güncelleme endpointidir. |
| `src/layouts/Layout.astro` | Ortak HTML iskeleti, meta etiketleri ve temel sayfa stilleridir. |
| `astro.config.js` | Netlify adaptörünü, sunucu çıktısını ve görsel işleme ayarlarını içerir. |
| `src/assets/notion-generated/` | Build sırasında oluşan kapak görselleri. Git'te yalnızca `.gitkeep` izlenir. |
| `src/assets/notion-image-manifest.json` ve `src/assets/notion-image-assets.ts` | Görsel eşitleme betiğinin ürettiği dosyalardır; elle düzenlenmez. |

> Not: `Slug` değiştirildiğinde yazının adresi de değişir. Eski adreslerin çalışmaya devam etmesi isteniyorsa yönlendirme kuralını ayrıca ekleyin.
