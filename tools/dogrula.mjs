#!/usr/bin/env node
/**
 * dogrula.mjs — src/data icindeki birlesik veriyi kalite kapisindan gecirir.
 *
 * Hata (cikis 1): gecersiz JSON, seri icinde yinelenen kodNormal, bos
 * baslik/aciklama, 12 karakterden uzun kod, enum disi sistem/siddet/durum,
 * markalar.json'da bulunmayan marka, kod sayisi 0.
 *
 * Uyari (cikis 0): aciklama < 20 karakter, nedenler ve kontroller ikisi de bos,
 * kaynakUrl yokken kaynakSayfa yok, 3'ten az kod, kodda ASCII disi karakter.
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERI_KLASORU = join(KOK, 'src', 'data');
const SERI_KLASORU = join(VERI_KLASORU, 'seriler');
const MARKA_DOSYASI = join(VERI_KLASORU, 'markalar.json');

const SISTEM_ENUM = new Set([
  'yuruyus', 'hidrolik', 'direksiyon', 'fren', 'batarya', 'iletisim',
  'gosterge', 'motor', 'sanziman', 'guvenlik', 'elektrik', 'atisman', 'diger',
]);
const SIDDET_ENUM = new Set(['durdurucu', 'kisitlayici', 'uyari', 'bilgi']);
const DURUM_ENUM = new Set(['dogrulandi', 'incelemede', 'taslak']);

const hatalar = [];
const uyariListesi = [];
const satirlar = [];

function hata(dosya, mesaj) {
  hatalar.push({ dosya, mesaj });
}
function uyari(dosya, mesaj) {
  uyariListesi.push({ dosya, mesaj });
}
function metin(deger) {
  return deger === undefined || deger === null ? '' : String(deger).trim();
}

/** Sabit genislikli tablo satiri (Turkce karakterler de tek hane sayilir). */
function satir(hucreler, genislikler) {
  return hucreler.map((hucre, i) => String(hucre).padEnd(genislikler[i])).join(' | ').trimEnd();
}

/* ---------- markalar ---------- */

let markalar = [];
if (!existsSync(MARKA_DOSYASI)) {
  hata('markalar.json', 'dosya bulunamadı');
} else {
  try {
    markalar = JSON.parse(await readFile(MARKA_DOSYASI, 'utf8'));
    if (!Array.isArray(markalar)) hata('markalar.json', 'beklenen tür: dizi (array)');
  } catch (h) {
    hata('markalar.json', `geçersiz JSON: ${h.message}`);
  }
}
const markaIds = new Set(markalar.map((m) => metin(m?.id)).filter(Boolean));

/* ---------- seriler ---------- */

let seriDosyalari = [];
if (!existsSync(SERI_KLASORU)) {
  hata('seriler/', 'klasör bulunamadı');
} else {
  seriDosyalari = (await readdir(SERI_KLASORU))
    .filter((ad) => ad.endsWith('.json'))
    .sort();
}

let toplamKod = 0;
let toplamDogrulanan = 0;
let toplamIncelemede = 0;
let toplamTaslak = 0;

for (const dosyaAdi of seriDosyalari) {
  const dosya = `seriler/${dosyaAdi}`;
  let seri;
  try {
    seri = JSON.parse(await readFile(join(SERI_KLASORU, dosyaAdi), 'utf8'));
  } catch (h) {
    hata(dosya, `geçersiz JSON: ${h.message}`);
    continue;
  }
  if (!seri || typeof seri !== 'object' || Array.isArray(seri)) {
    hata(dosya, 'seri nesnesi bekleniyor');
    continue;
  }

  const marka = metin(seri.marka);
  const seriAd = metin(seri.seri);
  if (!markaIds.has(marka)) hata(dosya, `"marka" değeri markalar.json'da yok: ${marka || '(boş)'}`);

  const kodlar = seri.kodlar;
  if (!Array.isArray(kodlar)) {
    hata(dosya, '"kodlar" dizisi değil');
    satirlar.push({ marka, seri: seriAd, kod: 0, dogrulanan: 0, incelemede: 0, taslak: 0, uyari: 0 });
    continue;
  }
  if (kodlar.length === 0) hata(dosya, 'kod sayısı 0');
  if (kodlar.length > 0 && kodlar.length < 3) uyari(dosya, `seride ${kodlar.length} kod var (eşik: 3)`);

  let seriUyari = 0;
  const gorulenNormal = new Map();
  let dogrulanan = 0;
  let incelemede = 0;
  let taslak = 0;

  for (let i = 0; i < kodlar.length; i += 1) {
    const kod = kodlar[i];
    const etiket = `#${i + 1} (${metin(kod?.kod) || 'kodsuz'})`;
    if (!kod || typeof kod !== 'object' || Array.isArray(kod)) {
      hata(dosya, `${etiket}: kod kaydı nesne değil`);
      continue;
    }

    const kodDegeri = metin(kod.kod);
    if (!kodDegeri) hata(dosya, `${etiket}: kod boş`);
    if (kodDegeri.length > 12) hata(dosya, `${etiket}: kod 12 karakterden uzun (${kodDegeri.length})`);
    if (/[^\x00-\x7F]/.test(kodDegeri)) uyari(dosya, `${etiket}: kodda ASCII dışı karakter — ${kodDegeri}`);

    const baslik = metin(kod.baslik);
    if (!baslik) hata(dosya, `${etiket}: başlık boş`);

    const aciklama = metin(kod.aciklama);
    if (!aciklama) hata(dosya, `${etiket}: açıklama boş`);
    else if (aciklama.length < 20) uyari(dosya, `${etiket}: açıklama ${aciklama.length} karakter`);

    const sistem = metin(kod.sistem).toLocaleLowerCase('tr');
    if (!SISTEM_ENUM.has(sistem)) hata(dosya, `${etiket}: geçersiz sistem — ${sistem || '(boş)'}`);

    const siddet = metin(kod.siddet).toLocaleLowerCase('tr');
    if (!SIDDET_ENUM.has(siddet)) hata(dosya, `${etiket}: geçersiz siddet — ${siddet || '(boş)'}`);

    const durum = metin(kod.durum).toLocaleLowerCase('tr');
    if (!DURUM_ENUM.has(durum)) hata(dosya, `${etiket}: geçersiz durum — ${durum || '(boş)'}`);
    else if (durum === 'dogrulandi') dogrulanan += 1;
    else if (durum === 'incelemede') incelemede += 1;
    else taslak += 1;

    const nedenler = Array.isArray(kod.nedenler) ? kod.nedenler.filter(Boolean) : [];
    const kontroller = Array.isArray(kod.kontroller) ? kod.kontroller.filter(Boolean) : [];
    if (nedenler.length === 0 && kontroller.length === 0) {
      uyari(dosya, `${etiket}: nedenler ve kontroller ikisi de boş`);
    }

    const kaynakUrl = metin(kod.kaynakUrl) || metin(seri.kaynakUrl);
    const kaynakSayfa = kod.kaynakSayfa;
    if (!kaynakUrl && (kaynakSayfa === undefined || kaynakSayfa === null || metin(kaynakSayfa) === '')) {
      uyari(dosya, `${etiket}: ne kaynakSayfa ne kaynakUrl var`);
    }

    const normal = metin(kod.kodNormal).toUpperCase();
    if (!normal) hata(dosya, `${etiket}: kodNormal boş`);
    else if (gorulenNormal.has(normal)) {
      hata(dosya, `${etiket}: yinelenen kodNormal ${normal} (ilk: ${gorulenNormal.get(normal)})`);
    } else {
      gorulenNormal.set(normal, kodDegeri);
    }
  }

  const seriUyariSayisi = uyariListesi.filter((u) => u.dosya === dosya).length;
  seriUyari = seriUyariSayisi;
  toplamKod += kodlar.length;
  toplamDogrulanan += dogrulanan;
  toplamIncelemede += incelemede;
  toplamTaslak += taslak;
  satirlar.push({ marka, seri: seriAd, kod: kodlar.length, dogrulanan, incelemede, taslak, uyari: seriUyari });
}

/* ---------- rapor ---------- */

const genislikler = [14, 16, 7, 12, 12, 8, 7];
console.log('\n=== DOĞRULAMA ÖZETİ ===');
console.log(satir(['MARKA', 'SERİ', 'KOD', 'DOĞRULANDI', 'İNCELEMEDE', 'TASLAK', 'UYARI'], genislikler));
console.log(genislikler.map((g) => '-'.repeat(g)).join('-+-'));
for (const satirVeri of satirlar) {
  console.log(satir([
    satirVeri.marka, satirVeri.seri, satirVeri.kod,
    satirVeri.dogrulanan, satirVeri.incelemede, satirVeri.taslak, satirVeri.uyari,
  ], genislikler));
}
console.log(genislikler.map((g) => '-'.repeat(g)).join('-+-'));
console.log(satir([
  'TOPLAM', `${seriDosyalari.length} seri`, toplamKod,
  toplamDogrulanan, toplamIncelemede, toplamTaslak, uyariListesi.length,
], genislikler));

if (hatalar.length) {
  console.log(`\n[HATA] ${hatalar.length} sorun bulundu:`);
  for (const h of hatalar.slice(0, 60)) console.log(`  ✗ ${h.dosya}: ${h.mesaj}`);
  if (hatalar.length > 60) console.log(`  ... ve ${hatalar.length - 60} hata daha`);
}

if (uyariListesi.length) {
  console.log(`\n[UYARI] ${uyariListesi.length} uyarı (çıkış kodu etkilenmez):`);
  for (const u of uyariListesi.slice(0, 40)) console.log(`  ! ${u.dosya}: ${u.mesaj}`);
  if (uyariListesi.length > 40) console.log(`  ... ve ${uyariListesi.length - 40} uyarı daha`);
}

if (hatalar.length) {
  console.log(`\nDoğrulama BAŞARISIZ: ${hatalar.length} hata.`);
  process.exit(1);
}
console.log('\nDoğrulama başarılı: kalite kapısı geçildi.');
process.exit(0);
