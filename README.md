# Forklift Hata Kodu

Türkçe, statik bir forklift hata kodu referansıdır. Kullanıcı bir kodu (`30-1`, `E001`, `1201`) veya arıza belirtisini arar; marka → seri → sistem gezinmesiyle detaya ulaşır. Site: https://forklifthata.com. Üreticilerle resmî bağlantısı olmayan bağımsız bir teknik bilgi kaynağıdır; yetkili servis, distribütör veya temsilci değildir.

## Ne var?

`src/data/seriler/*.json` üzerinde ölçülen değerler:

- 26 marka, 61 seri, 3550 kod kaydı.
- `durum` alanında üç değer tanımlıdır: `dogrulandi` (doğrulandı), `incelemede`, `taslak`. Mevcut 3550 kaydın tamamı `incelemede` durumundadır; çapraz doğrulanmış kayıt sayısı sıfırdır.
- Her kayıt, ait olduğu serinin kaynak belgesine (`kaynakBelge`) bağlıdır. Kaynakta sayfa numarası verilmişse `kaynakSayfa` alanında tutulur, verilmemişse arayüzde "belirtilmedi" yazar. 1944 kayıtta sayfa numarası vardır; 1606 kayıtta yoktur.
- Kayıt düzeyinde `kaynakUrl` dolu olan 1803 kayıt vardır; seri düzeyinde `kaynakUrl` bulunan kayıt sayısı 1563'tür. Hiçbir kayıt ne URL ne de sayfa numarasından yoksundur.
- Kaynak alan adları arasında forkliftpdfmanuals.com, forklifterrorcodes.com, chinaliftsupply.com, truck-manuals.net, machinemaxxusa.com, partao.com, flatearthequipment.com ve procarmanuals.com bulunur.

## Teknoloji

Astro `output: 'static'` ile derlenir; çalışma zamanında sunucu gerekmez. Stil düz CSS ve CSS custom properties kullanır; istemci JavaScript arama, tema ve küçük etkileşimlerle sınırlıdır. Pagefind tam metin dizini `dist/pagefind/` altına üretilir. `public/sw.js` el yazımı service worker, `public/manifest.webmanifest` PWA bildirimini sağlar. `@astrojs/sitemap` sitemap dosyalarını üretir.

## Kurulum

Node 22 gerekir (Netlify yapılandırmasında npm 10 sabitlenmiştir).

```bash
npm install
npm run dev      # http://localhost:4321
npm run build
npm run preview  # derleme çıktısını yerel olarak sunar
```

`npm run build` sırasıyla dört komutu çalıştırır:

1. `node tools/birlestir.mjs` — ham veriyi birleştirir, küratörlük katmanını uygular, `src/data/seriler/` dosyalarını üretir.
2. `node tools/indeks-uret.mjs` — ana sayfadaki anlık arama için `public/veri/indeks.json` dosyasını yazar.
3. `astro build` — statik sayfaları `dist/` altına yazar; sitemap bu adımda oluşur.
4. `pagefind --site dist` — tam metin arama dizinini `dist/pagefind/` altına ekler.

Pagefind mutlaka `astro build` sonrasında çalışmalıdır; bu yüzden tek `npm run build` komutu kullanılır. Pagefind yerel ortamda çalışmazsa arama sayfası bu özelliği sessizce devre dışı bırakır; temel arama ve filtreleme istemci tarafında çalışmaya devam eder.

## Veri düzeni

- `src/data/markalar.json` — marka kimlikleri: `id`, `ad`, `grup`, `aciklama`, `not`, `renk`. `id` URL'de ve seri dosyası adının ilk parçasında kullanılır.
- `src/data/seriler/<marka>-<seri>.json` — seri künyesi (`marka`, `seri`, `modelAdi`, `kaynakBelge`, `kaynakSurum`, `kaynakDil`, `kaynakUrl`) ve `kodlar` dizisi.
- `src/data/kuretaj/` — küratörlük geçersiz kılma katmanı: `markalar.json`, `seriler/*.json`, `karantina.json`. Birleştirme sırasında otomatik üretimin önüne geçtiği için birleştirmelerle asla üzerine yazılmaz; `kuretaj-al.mjs` varsayılan olarak korumacıdır.
- `src/data/kuretaj/karantina.json` — otomatik birleştirmeye alınmayacak seri listesi. Marka bazlı karantina kullanılmaz; aynı markanın kaliteli serileri engellenmemelidir.

Kayıt sözleşmesi alanları: `kod`, `kodNormal`, `aliaslar`, `sistem`, `baslik`, `aciklama`, `makineTepkisi`, `siddet`, `nedenler`, `kontroller`, `ilgiliKodlar`, `kaynakSayfa`, `kaynakUrl`, `durum`.

- `durum`: `dogrulandi | incelemede | taslak` (üç değer).
- `sistem`: `yuruyus | hidrolik | direksiyon | fren | batarya | iletisim | gosterge | motor | sanziman | guvenlik | elektrik | atisman | diger`.
- `siddet`: `durdurucu | kisitlayici | uyari | bilgi`.
- `kaynakUrl` boş olabilir; `ilgiliKodlar` ve `makineTepkisi` atlanabilir. Render katmanı eksik alanlara dayanıklıdır. `kod` sayfa URL'sinde kullanılır, benzersiz ve URL'ye uygun olmalıdır.

## Veri araçları

- `tools/birlestir.mjs` — ham ve küratörlü veriyi birleştirip seri dosyalarını üretir (`npm run veri:birlestir`).
- `tools/dogrula.mjs` — kalite kapısı; JSON, alan, enum ve yinelenen kod denetimi yapar, hatalarda çıkış kodu 1 döner (`npm run veri:dogrula`).
- `tools/kaynak-raporu.mjs` — `/kaynaklar/` sayfası için kaynak envanteri üretir (`npm run veri:kaynak-raporu`).
- `tools/kuretaj-al.mjs` — işlenmiş serileri küratörlüğe kopyalar; mevcut dosyayı `--force` verilmedikçe ezmez (`npm run veri:kuretaj`).
- `tools/kuretaj-senkron.mjs` — seri ve küratörlük sürümlerini ölçülen kalite puanına göre karşılaştırır; `--uygula` ile yazar, varsayılan olarak kuru çalışır.
- `tools/indeks-uret.mjs` — anlık arama indeksini üretir; `npm run build` içinde çalışır. Ayrı bir `veri:indeks` betiği tanımlı değildir.

## Yayına alma

Netlify: build komutu `npm run build`, yayın dizini `dist`, Node 22 (npm 10). `netlify.toml` dosyası güvenlik başlıklarını ve CSP'yi, `_astro` için immutable önbelleği, `pagefind`, `veri`, `sw.js` ve manifest kurallarını zaten içerir; ayrıca ayar gerekmez.

DNS: `forklifthata.com` için Netlify'a A (veya ALIAS/ANAME) kaydı, `www.forklifthata.com` için CNAME kaydı ekleyin. SSL ve `www` → apex yönlendirmesi Netlify domain ayarlarından yapılır. `astro.config.mjs` içindeki `site` değeri bu domaine göredir; domain değişirse canonical/OG URL'leri de güncelleyin. Pagefind, `npm run build` zincirinde `astro build` sonrasında koşar; yayın sırasında ayrı bir adım eklemeyin.

## Yasal

Bağımsız teknik bilgi kaynağıdır; hiçbir üreticinin yetkili servisi, distribütörü veya temsilcisi değildir. Marka adları yalnızca makine kimliği için kullanılır. Özetler kendi ifadelerimizle yazılmıştır; taranmış servis kılavuzu sayfaları yayınlanmaz. Her kayıt kaynak belgeye bağlanır, kaynakta varsa sayfa numarası gösterilir, yoksa "belirtilmedi" denir. Telif hakları ilgili sahiplere aittir; bildirim hakkında/hakkinda sayfasından yapılır. İçerik bilgilendirmedir, onarım talimatı veya güvenlik garantisi değildir; kesin teşhis için orijinal servis kılavuzu esas alınmalıdır.

## Bilinen eksikler

- Doğrulama dağılımı: 3550 kaydın tamamı `incelemede`, `dogrulandi` kayıt sayısı 0. Hiçbir kayıt ikinci bir bağımsız kaynakla çapraz doğrulanmış değildir.
- Kaynak sayfa numarası olmayan kayıt: 1606. Bu kayıtlarda belge/URL bağlantısı vardır ancak sayfa bilgisi kaynakta verilmemiştir.
- Henüz veri üretilmeyen markalar: Tailift, Maximal, Utilear/Utilev, Hubtex. UniCarriers ve Komatsu kayıtlıdır ancak ek serileri için doğrulanmış kod tablosu bulunamamıştır.
- `npm run veri:dogrula` şu an 0 hata, 27 uyarı ile geçer. Uyarılar çoğunlukla BYD gösterge mesajı formundaki uzun kodlarla ilgilidir ve çıkış kodunu etkilemez.
