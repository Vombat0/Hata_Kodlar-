#!/usr/bin/env node
/**
 * public/veri/indeks.json — ana sayfadaki anlık arama için sıkıştırılmış kod indeksi.
 * Veri dosyaları değiştiğinde `npm run build` bu dosyayı yeniden üretir.
 */
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const kok = join(dirname(fileURLToPath(import.meta.url)), '..');
const seriKlasoru = join(kok, 'src', 'data', 'seriler');
const cikti = join(kok, 'public', 'veri', 'indeks.json');

/** Ayırıcıları kaldırıp arama anahtarı üretir (Türkçe duyarlı). */
function kodAnahtar(deger) {
  return String(deger ?? '')
    .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
    .replace(/Ş/g, 's').replace(/ş/g, 's')
    .replace(/Ğ/g, 'g').replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u').replace(/ü/g, 'u')
    .replace(/Ö/g, 'o').replace(/ö/g, 'o')
    .replace(/Ç/g, 'c').replace(/ç/g, 'c')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]/g, '');
}

const dosyalar = (await readdir(seriKlasoru)).filter((ad) => ad.endsWith('.json')).sort();
const kayitlar = [];

for (const dosya of dosyalar) {
  let seri;
  try {
    seri = JSON.parse(await readFile(join(seriKlasoru, dosya), 'utf8'));
  } catch (hata) {
    console.warn(`[indeks] Okunamayan dosya atlandı: ${dosya} — ${hata.message}`);
    continue;
  }
  if (!seri || !Array.isArray(seri.kodlar)) continue;

  for (const kod of seri.kodlar) {
    if (!kod || typeof kod.kod !== 'string') continue;
    kayitlar.push({
      kodNormal: kodAnahtar(kod.kodNormal || kod.kod),
      marka: seri.marka ?? '',
      seri: seri.seri ?? '',
      baslik: kod.baslik ?? '',
      siddet: kod.siddet ?? 'bilgi',
    });
  }
}

await mkdir(dirname(cikti), { recursive: true });
await writeFile(cikti, JSON.stringify(kayitlar), 'utf8');
console.log(`[indeks] ${kayitlar.length} kayıt yazıldı: public/veri/indeks.json`);
