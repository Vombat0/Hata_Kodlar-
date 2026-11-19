#!/usr/bin/env node
/**
 * kaynak-raporu.mjs — /kaynaklar/ sayfası için kaynak envanteri üretir.
 * Her farklı belge/URL'yi ve ona atıf yapan kod sayısını listeler.
 * Çıktı: public/veri/kaynaklar.json
 */
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERI_KLASORU = join(KOK, 'src', 'data', 'seriler');
const CIKTI = join(KOK, 'public', 'veri', 'kaynaklar.json');

const kaynakHarita = new Map();
let toplamKod = 0;

function metin(deger) {
  return deger === undefined || deger === null ? '' : String(deger).trim();
}

function urlMu(deger) {
  const aday = metin(deger);
  return /^https?:\/\//i.test(aday) ? aday : '';
}

function kaynakEkle(tur, ad, url, sayfa, marka, seri) {
  if (!ad) return;
  const anahtar = `${tur}|${ad}`;
  let kaynak = kaynakHarita.get(anahtar);
  if (!kaynak) {
    kaynak = {
      tur,
      ad,
      url: url || '',
      kodSayisi: 0,
      sayfalar: new Set(),
      markalar: new Set(),
      seriler: new Set(),
    };
    kaynakHarita.set(anahtar, kaynak);
  }
  kaynak.kodSayisi += 1;
  if (url && !kaynak.url) kaynak.url = url;
  if (sayfa !== undefined && sayfa !== null && metin(sayfa) !== '') kaynak.sayfalar.add(String(sayfa));
  if (marka) kaynak.markalar.add(marka);
  if (seri) kaynak.seriler.add(`${marka}/${seri}`);
}

let seriDosyalari = [];
if (existsSync(SERI_KLASORU)) {
  seriDosyalari = (await readdir(SERI_KLASORU)).filter((ad) => ad.endsWith('.json')).sort();
}

for (const dosyaAdi of seriDosyalari) {
  let seri;
  try {
    seri = JSON.parse(await readFile(join(SERI_KLASORU, dosyaAdi), 'utf8'));
  } catch (hata) {
    console.warn(`[kaynak-raporu] Okunamayan dosya atlandı: ${dosyaAdi} — ${hata.message}`);
    continue;
  }
  if (!seri || !Array.isArray(seri.kodlar)) continue;

  const marka = metin(seri.marka);
  const seriAd = metin(seri.seri);
  const seriUrl = urlMu(seri.kaynakUrl);
  const belge = metin(seri.kaynakBelge) || (seriUrl ? 'Adlandırılmamış web kaynağı' : 'Belge belirtilmemiş');
  const birlesikUrl = seriUrl || (belge.startsWith('http') ? belge : '');

  for (const kod of seri.kodlar) {
    if (!kod || typeof kod !== 'object') continue;
    toplamKod += 1;

    kaynakEkle('belge', belge, birlesikUrl, kod.kaynakSayfa, marka, seriAd);

    const kodUrl = urlMu(kod.kaynakUrl);
    if (kodUrl) kaynakEkle('url', kodUrl, kodUrl, kod.kaynakSayfa, marka, seriAd);
    else if (seriUrl) kaynakEkle('url', seriUrl, seriUrl, kod.kaynakSayfa, marka, seriAd);
  }
}

const kaynaklar = [...kaynakHarita.values()]
  .map((kaynak) => ({
    tur: kaynak.tur,
    ad: kaynak.ad,
    url: kaynak.url,
    kodSayisi: kaynak.kodSayisi,
    sayfalar: [...kaynak.sayfalar].sort((a, b) => {
      const aSayi = Number(a);
      const bSayi = Number(b);
      if (Number.isFinite(aSayi) && Number.isFinite(bSayi)) return aSayi - bSayi;
      return a.localeCompare(b, 'tr');
    }),
    markalar: [...kaynak.markalar].sort((a, b) => a.localeCompare(b, 'tr')),
    seriler: [...kaynak.seriler].sort((a, b) => a.localeCompare(b, 'tr')),
  }))
  .sort((a, b) => b.kodSayisi - a.kodSayisi || a.ad.localeCompare(b.ad, 'tr'));

await mkdir(dirname(CIKTI), { recursive: true });
await writeFile(CIKTI, JSON.stringify({
  olusturulma: new Date().toISOString(),
  toplamKod,
  toplamKaynak: kaynaklar.length,
  kaynaklar,
}, null, 2) + '\n', 'utf8');

console.log(`[kaynak-raporu] ${kaynaklar.length} kaynak, ${toplamKod} kod atfı yazıldı: public/veri/kaynaklar.json`);
