# Forklift Hata Kodu

Türkçe, statik forklift hata kodu referansı. Kullanıcı bir kod (`30-1`, `A1-1`, `E001`, `1201`) veya arıza belirtisi yazar; ardından marka → seri → sistem gezinmesiyle detaya ulaşır. Üreticilerle resmî bağlantısı olmayan bağımsız bir teknik bilgi kaynağıdır.

- **Site:** https://forklifthata.com
- **Stack:** Astro (statik çıktı), düz CSS + CSS custom properties, minimal istemci JS
- **Node:** 22 · **npm:** 10

## Kurulum

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # public/veri/indeks.json → astro build → pagefind
npm run preview  # derleme çıktısını yerel olarak sunar
```

`npm run build` üç adımda çalışır:

1. `node tools/indeks-uret.mjs` — `public/veri/indeks.json` (ana sayfa anlık araması için sıkıştırılmış indeks) üretilir.
2. `astro build` — statik sayfalar `dist/` altına yazılır, sitemap üretilir.
3. `pagefind --site dist` — tam metin arama dizini `dist/pagefind/` altına eklenir.

Pagefind yerel ortamda kullanılamazsa arama sayfası sessizce devre dışı bırakır; temel arama ve filtreleme istemci tarafında çalışmaya devam eder.

## Dizin yapısı

```text
src/
  data/
    markalar.json              # marka kimlikleri, grup, açıklama, renk
    seriler/<marka>-<seri>.json# seri + kod kayıtları
  lib/
    veri.ts                    # veri erişimi, Türkçe arama, istatistik
    normalize.ts               # sunucu + istemci ortak karakter normalizasyonu
  layouts/BaseLayout.astro     # SEO, tema, PWA kaydı, klavye kısayolları
  components/                  # başlık, altbilgi, arama, kartlar, rozetler, tablo
  pages/
    index.astro                # ana sayfa
    arama.astro                # arama + anlık filtre + Pagefind
    kapsam.astro               # kapsam panosu
    kaynaklar.astro            # kaynaklar ve telif politikası
    hakkinda.astro             # hakkında ve iletişim
    404.astro
    [marka]/index.astro
    [marka]/[seri]/index.astro
    [marka]/[seri]/[kod]/index.astro
  styles/global.css            # tasarım sistemi, koyu/açık tema
public/
  manifest.webmanifest         # PWA bildirimi
  sw.js                        # el yazımı service worker
  robots.txt
  favicon.svg, icon.svg, og-cover.svg
  veri/indeks.json             # build sırasında üretilir (commit edilmez)
tools/indeks-uret.mjs          # indeks üretici
netlify.toml                   # güvenlik başlıkları ve önbellek kuralları
```

## Yeni marka veya seri ekleme

### Marka

`src/data/markalar.json` dizisine bir nesne ekleyin:

```json
{
  "id": "hyster",
  "ad": "Hyster",
  "grup": "Hyster-Yale Materials Handling",
  "aciklama": "Kısa Türkçe açıklama.",
  "not": "",
  "renk": "#22C55E"
}
```

`id`, URL'de kullanılır ve `src/data/seriler/<id>-<seri>.json` dosya adının ilk parçasıyla birebir aynı olmalıdır.

### Seri

`src/data/seriler/<marka-id>-<seri-id>.json` dosyası oluşturun:

```json
{
  "marka": "hyster",
  "seri": "h180",
  "modelAdi": "Hyster H180 (A Series)",
  "kaynakBelge": "H180-SM",
  "kaynakSurum": "2022",
  "kaynakDil": "EN",
  "kaynakUrl": "",
  "kodlar": [
    {
      "kod": "E001",
      "kodNormal": "E001",
      "aliaslar": ["E1"],
      "sistem": "iletisim",
      "baslik": "Kontrolör ile iletişim hatası",
      "aciklama": "En az 20 karakterlik Türkçe açıklama.",
      "makineTepkisi": "Makine durur.",
      "siddet": "durdurucu",
      "nedenler": ["Kablo kopukluğu"],
      "kontroller": ["Beslemeyi ölçün"],
      "ilgiliKodlar": [],
      "kaynakSayfa": 12,
      "durum": "dogrulandi"
    }
  ]
}
```

Kurallar:

- `sistem`: `yuruyus | hidrolik | direksiyon | fren | batarya | iletisim | gosterge | motor | sanziman | guvenlik | elektrik | atisman | diger`
- `siddet`: `durdurucu | kisitlayici | uyari | bilgi`
- `durum`: `dogrulandi | incelemede | taslak`
- `kaynakUrl` boş olabilir; `ilgiliKodlar` ve `makineTepkisi` atlanabilir. Render katmanı eksik alanlara dayanıklıdır.
- `kod`, sayfa URL'sinde kullanılır; benzersiz ve URL'ye uygun olmalıdır.
- Dosya kaydedip `npm run build` çalıştırın: yeni rota, indeks, sitemap ve Pagefind dizini otomatik güncellenir.

## Tema ve erişilebilirlik

Koyu tema varsayılandır. Kullanıcı tercihi `localStorage.fhk-tema` anahtarında saklanır ve `<head>` içindeki satır içi betikle sayfa boyanmadan uygulanır (flash yoktur). `/` aramaya odaklanır, `Esc` aramayı temizler. Odak halkaları, atlama bağlantısı, 44px dokunma hedefleri ve `prefers-reduced-motion` desteği mevcuttur.

## Netlify

- `netlify.toml` build komutunu ve `dist` yayın dizinini tanımlar; Node 22 / npm 10 sabitlenmiştir.
- Güvenlik başlıkları, `_astro` için immutable önbellek, `sw.js` için yeniden doğrulama zorunluluğu tanımlıdır.
- Domain: `forklifthata.com`. `astro.config.mjs` içindeki `site` ve canonical/OG URL'leri bu domaine göre ayarlıdır. Başka bir domaine geçişte bu alanları birlikte güncelleyin.
- SSL ve `www` → apex yönlendirmesini Netlify DNS/domain ayarlarından yapın.

## Yasal

Bağımsız teknik bilgi kaynağıdır; hiçbir üreticinin yetkili servisi, distribütörü veya temsilcisi değildir. Marka adları yalnızca makine kimliği amacıyla kullanılmıştır.
