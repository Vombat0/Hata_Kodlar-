#!/usr/bin/env node
/**
 * birlestir.mjs — PDF (A) + web arastirmasi (B, C) kaynaklarini tek bir
 * dogrulanabilir veri setinde birlestirir.
 *
 * Ciktilar:
 *   src/data/markalar.json
 *   src/data/seriler/<marka>-<seri>.json
 *   tools/rapor-veri.json
 *
 * Kaynak klasorlerinin hicbiri yoksa cikis 0 ile sonlanir ve src/data'ya
 * dokunulmaz (temiz klon / ilk kurulum senaryosu).
 */
import { readFile, readdir, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ARAC_KLASORU = dirname(fileURLToPath(import.meta.url));
const KOK = join(ARAC_KLASORU, '..');
const VERI_KLASORU = join(KOK, 'src', 'data');
const SERI_KLASORU = join(VERI_KLASORU, 'seriler');
const RAPOR_DOSYASI = join(ARAC_KLASORU, 'rapor-veri.json');

/**
 * KURATORLUK KATMANI (src/data/kuretaj/)
 * Otomatik birlesmeyi EZER, asla onun tarafindan ezilmez.
 *   kuretaj/markalar.json  -> marka kunyesi (ad, grup, aciklama, not, renk)
 *   kuretaj/seriler/*.json -> elle islenmis tam seri dosyasi
 *   kuretaj/karantina.json -> hic alinmayacak seri/marka listesi
 */
const KURETAJ_KLASORU = join(VERI_KLASORU, 'kuretaj');
const KURETAJ_SERI_KLASORU = join(KURETAJ_KLASORU, 'seriler');

const KAYNAK_YOLLARI = {
  A: process.env.VERI_A || '/tmp/opencode/veri',
  B: process.env.VERI_B || '/tmp/opencode/veri-ek/g1',
  W4: process.env.VERI_W4 || '/tmp/opencode/veri-w4',
  W5: process.env.VERI_W5 || '/tmp/opencode/veri-w5',
  JH: process.env.VERI_JH || '/tmp/opencode/veri-jh',
  BT: process.env.VERI_BT || '/tmp/opencode/veri-bt',
  C: process.env.VERI_C || '/tmp/opencode/veri-ek/g2',
};

const SISTEM_ENUM = new Set([
  'yuruyus', 'hidrolik', 'direksiyon', 'fren', 'batarya', 'iletisim',
  'gosterge', 'motor', 'sanziman', 'guvenlik', 'elektrik', 'atisman', 'diger',
]);
const SIDDET_ENUM = new Set(['durdurucu', 'kisitlayici', 'uyari', 'bilgi']);
const DURUM_ENUM = new Set(['dogrulandi', 'incelemede', 'taslak']);

const ATLANAN_KLASORLER = new Set(['raw', 'tools', '__pycache__', 'node_modules', '.git']);
const ON_EKLER = ['cl-', 'fec-', 'fps_', 'fps-', 'rm-', 'g1-', 'g2-'];
const RENK_PALETI = ['#0EA5E9', '#8B5CF6', '#F59E0B', '#10B981', '#EF4444', '#06B6D4', '#EC4899', '#84CC16'];

const rapor = {
  olusturulma: new Date().toISOString(),
  kaynaklar: {},
  toplamlar: {},
  markalar: [],
  seriler: [],
  dusurulenKodlar: [],
  carpismalar: [],
  enumOnarimlari: [],
  otomatikMarkalar: [],
  korunanDosyalar: [],
  uyarilar: [],
};

/* ---------- yardimcilar ---------- */

function ilkDeger(...degerler) {
  for (const deger of degerler) {
    if (deger === undefined || deger === null) continue;
    if (typeof deger === 'string' && deger.trim() === '') continue;
    return deger;
  }
  return undefined;
}

function metin(deger) {
  if (deger === undefined || deger === null) return '';
  return String(deger).trim();
}

function dizi(deger) {
  if (deger === undefined || deger === null || deger === '') return [];
  if (Array.isArray(deger)) {
    return deger
      .filter((oz) => oz !== undefined && oz !== null && typeof oz !== 'object')
      .map((oz) => String(oz).trim())
      .filter(Boolean);
  }
  if (typeof deger === 'object') return [];
  return String(deger).split(/[,;]/).map((oz) => oz.trim()).filter(Boolean);
}

function urlMu(deger) {
  const aday = metin(deger);
  return /^https?:\/\//i.test(aday) ? aday : '';
}

function kodNormalUret(kod) {
  return metin(kod).toUpperCase().replace(/[-.\\/()\s]/g, '');
}

function slug(deger) {
  return metin(deger)
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function dosyadanMarkaSeri(dosyaAdi) {
  let ad = basename(dosyaAdi, extname(dosyaAdi));
  let degisti = true;
  while (degisti) {
    degisti = false;
    for (const on of ON_EKLER) {
      if (ad.toLowerCase().startsWith(on)) {
        ad = ad.slice(on.length);
        degisti = true;
      }
    }
  }
  const parcalar = ad.split(/[-_]/).filter(Boolean);
  if (!parcalar.length) return { marka: 'bilinmeyen', seri: 'genel' };
  if (parcalar.length === 1) return { marka: parcalar[0].toLowerCase(), seri: 'genel' };
  return { marka: parcalar[0].toLowerCase(), seri: parcalar.slice(1).join('-').toLowerCase() };
}

function etiketUret(id) {
  return id.split(/[-_]/).filter(Boolean)
    .map((p) => (p === 'ep' ? 'EP' : p.charAt(0).toLocaleUpperCase('tr') + p.slice(1)))
    .join(' ');
}

function kaynakHost(adres) {
  const url = urlMu(adres);
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Anahtar kelime ile sistem enum'unu onarir (Turkce + Ingilizce). */
function sistemden(hamKod) {
  const metinler = [
    hamKod.baslik, hamKod.aciklama, hamKod.makineTepkisi,
    ...dizi(hamKod.nedenler),
  ].join(' ').toLocaleLowerCase('tr');

  const kurallar = [
    [/\b(fren|brake|frenle|braking)\b/, 'fren'],
    [/\b(direksiyon|steer|steering|rota)\b/, 'direksiyon'],
    [/\b(batarya|akü|aku|battery|akumulat|batterie)\b/, 'batarya'],
    [/\b(pompa|pump|hidrol|hydraul|lift|kaldır|kaldir|hoist)\b/, 'hidrolik'],
    [/\b(can|haberleş|haberles|comm|communication|iletisim|sharebus)\b/, 'iletisim'],
    [/\b(gösterge|gosterge|display|ekran|panel|dashboard)\b/, 'gosterge'],
    [/\b(şanzıman|sanziman|gear|transmission|vites|gearbox)\b/, 'sanziman'],
    [/\b(ops|seat|koltuk|safety|güvenlik|guvenlik|emniyet|giic)\b/, 'guvenlik'],
    [/\b(atış|atisman|atisma|mast|fork|lifting height)\b/, 'atisman'],
    [/\b(sigorta|wiring|kablo|elektrik|electrical|voltaj|voltage|short circuit|fuse|sensor)\b/, 'elektrik'],
    [/\b(yürüyüş|yuruyus|drive|traction|tahrik|sürücü|surucu|travel)\b/, 'yuruyus'],
    [/\b(motor|engine)\b/, 'motor'],
  ];
  for (const [kalip, sistem] of kurallar) {
    if (kalip.test(metinler)) return sistem;
  }
  return 'diger';
}

function onarimKaydet(ctx, alan, eski, yeni) {
  rapor.enumOnarimlari.push({
    kaynak: ctx.kaynak,
    dosya: ctx.dosya,
    marka: ctx.marka,
    seri: ctx.seri,
    kod: ctx.kod,
    alan,
    eski: eski === undefined || eski === null || metin(eski) === '' ? '(eksik)' : metin(eski),
    yeni,
  });
}

function dusurmeKaydet(ctx, sebep) {
  rapor.dusurulenKodlar.push({
    kaynak: ctx.kaynak,
    dosya: ctx.dosya,
    marka: ctx.marka,
    seri: ctx.seri,
    kod: ctx.kod ?? '(eksik)',
    sebep,
  });
}

/* ---------- dosya keşfi ---------- */

async function jsonOku(dosya) {
  return JSON.parse(await readFile(dosya, 'utf8'));
}

function seriDosyasiMi(ad) {
  return ad.endsWith('.json') && ad.toLowerCase() !== 'markalar.json';
}

async function dosyalariTara(klasor) {
  const bulunan = [];
  async function gez(dir) {
    let girdiler;
    try {
      girdiler = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const girdi of girdiler) {
      const tam = join(dir, girdi.name);
      if (girdi.isDirectory()) {
        if (!ATLANAN_KLASORLER.has(girdi.name)) await gez(tam);
      } else if (girdi.isFile() && seriDosyasiMi(girdi.name)) {
        bulunan.push(tam);
      }
    }
  }
  await gez(klasor);
  return bulunan.sort();
}

/* ---------- kod / seri normalizasyonu ---------- */

function kodNormalize(ham, ust, ctx) {
  const kodDegeri = ilkDeger(ham.kod, ham.seg, ham.code, ham.kodNo, ham.faultCode);
  ctx.kod = metin(kodDegeri) || '(eksik)';
  if (!kodDegeri) {
    dusurmeKaydet(ctx, 'kod alanı eksik');
    return null;
  }
  const kod = metin(kodDegeri);

  const baslikDegeri = ilkDeger(ham.baslik, ham.h1, ham.title, ham.kodBasligi);
  if (!baslikDegeri || metin(baslikDegeri).length < 3) {
    dusurmeKaydet(ctx, 'başlık eksik veya 3 karakterden kısa');
    return null;
  }
  const baslik = metin(baslikDegeri);

  // Şema uyarlaması: A sözleşmesi, cl-* (ozet/cozum) ve fec-* (h1/scope/quick).
  let aciklama = metin(ilkDeger(
    ham.aciklama, ham.ozet, ham.scope, ham.quick, ham.aciklamaKisa, ham.description,
  ));

  const kontroller = dizi(ilkDeger(ham.kontroller, ham.cozum, ham.cozumler, ham.oneriler));
  const nedenler = dizi(ilkDeger(ham.nedenler, ham.causes, ham.neden));
  const aliaslar = dizi(ilkDeger(ham.aliaslar, ham.aliases, ham.digerKodlar));
  const ilgiliKodlar = dizi(ilkDeger(ham.ilgiliKodlar, ham.relatedCodes, ham.ilgili));

  let makineTepkisi = metin(ilkDeger(ham.makineTepkisi, ham.machineResponse, ham.tepi));

  let sistem = metin(ham.sistem).toLocaleLowerCase('tr');
  if (!SISTEM_ENUM.has(sistem)) {
    const yeni = sistemden({ baslik, aciklama, makineTepkisi, nedenler });
    onarimKaydet(ctx, 'sistem', ham.sistem, yeni);
    sistem = yeni;
  }

  let siddet = metin(ham.siddet).toLocaleLowerCase('tr');
  if (!SIDDET_ENUM.has(siddet)) {
    onarimKaydet(ctx, 'siddet', ham.siddet, 'uyari');
    siddet = 'uyari';
  }

  let durum = metin(ham.durum).toLocaleLowerCase('tr');
  if (!DURUM_ENUM.has(durum)) {
    onarimKaydet(ctx, 'durum', ham.durum, 'incelemede');
    durum = 'incelemede';
  }

  let kodNormal = metin(ham.kodNormal).toUpperCase();
  if (!kodNormal) {
    kodNormal = kodNormalUret(kod);
    rapor.enumOnarimlari.push({
      kaynak: ctx.kaynak, dosya: ctx.dosya, marka: ctx.marka, seri: ctx.seri,
      kod, alan: 'kodNormal', eski: '(eksik)', yeni: kodNormal,
    });
  }
  kodNormal = kodNormal.replace(/[-.\\/()\s]/g, '').toUpperCase();

  // Aciklama bos birakilmaz; dogrula bunu "hard fail" sayar. Son care baslik.
  if (!aciklama) {
    aciklama = baslik + '.';
    rapor.uyarilar.push({
      kaynak: ctx.kaynak, dosya: ctx.dosya, marka: ctx.marka, seri: ctx.seri,
      kod, mesaj: 'aciklama eksik; basliktan uretildi — insan onayi gerekli',
    });
  }
  if (!makineTepkisi) makineTepkisi = '';

  let kaynakSayfa = ham.kaynakSayfa ?? ham.sayfa;
  if (kaynakSayfa !== undefined && kaynakSayfa !== null && metin(kaynakSayfa) !== '') {
    const sayi = Number(kaynakSayfa);
    kaynakSayfa = Number.isFinite(sayi) ? sayi : metin(kaynakSayfa);
  } else {
    kaynakSayfa = undefined;
  }

  const kaynakUrl = urlMu(ham.kaynakUrl) || urlMu(ham.url) || urlMu(ham.kaynakAdres) || ust.kaynakUrl || '';

  return {
    kod,
    kodNormal,
    aliaslar,
    sistem,
    baslik,
    aciklama,
    makineTepkisi,
    siddet,
    nedenler,
    kontroller,
    ilgiliKodlar,
    ...(kaynakSayfa !== undefined ? { kaynakSayfa } : {}),
    kaynakUrl,
    durum,
  };
}

function seriNormalize(ham, ctx) {
  let marka;
  let seri;
  let hamKodlar = [];
  let ust = { kaynakUrl: '' };

  if (Array.isArray(ham)) {
    // fec-* tarzi: duz kayit dizisi (seg / h1 / quick / scope / url).
    hamKodlar = ham;
    ust = {
      modelAdi: undefined,
      kaynakBelge: 'Web araştırması — forklifterrorcodes.com',
      kaynakSurum: undefined,
      kaynakDil: 'EN',
      kaynakUrl: '',
    };
  } else if (ham && typeof ham === 'object') {
    marka = ilkDeger(ham.marka, ham.brand, ham.markaId, ham.uretici);
    seri = ilkDeger(ham.seri, ham.model, ham.series, ham.seriAd, ham.modelKodu);
    hamKodlar = ilkDeger(ham.kodlar, ham.codes, ham.kodlari, ham.kayitlar) ?? [];
    if (!Array.isArray(hamKodlar)) hamKodlar = [];

    const belge = ilkDeger(ham.kaynakBelge, ham.belge, ham.kaynak, ham.document);
    const url = urlMu(ham.kaynakUrl) || urlMu(ham.modelUrl) || urlMu(ham.url) || urlMu(ham.kaynak);
    ust = {
      modelAdi: ilkDeger(ham.modelAdi, ham.modelAd, ham.ad),
      kaynakBelge: metin(belge) || (url ? `Web araştırması — ${kaynakHost(url)}` : 'Web araştırması'),
      kaynakSurum: ilkDeger(ham.kaynakSurum, ham.surum, ham.version),
      kaynakDil: ilkDeger(ham.kaynakDil, ham.dil, ham.language),
      kaynakUrl: url,
    };
  } else {
    rapor.uyarilar.push({ kaynak: ctx.kaynak, dosya: ctx.dosya, mesaj: 'seri dosyası beklenen nesne/dizi değil' });
    return null;
  }

  const dosyaTurev = dosyadanMarkaSeri(ctx.dosya);
  if (!marka) {
    marka = dosyaTurev.marka;
    rapor.uyarilar.push({
      kaynak: ctx.kaynak, dosya: ctx.dosya, alan: 'marka',
      mesaj: `dosya adından türetildi: ${marka}`,
    });
  }
  if (!seri) {
    seri = dosyaTurev.seri;
    rapor.uyarilar.push({
      kaynak: ctx.kaynak, dosya: ctx.dosya, alan: 'seri',
      mesaj: `dosya adından türetildi: ${seri}`,
    });
  }
  marka = slug(marka) || 'bilinmeyen';
  seri = slug(seri) || 'genel';
  ctx.marka = marka;
  ctx.seri = seri;

  if (!ust.modelAdi) ust.modelAdi = `${etiketUret(marka)} ${seri}`;

  return {
    marka,
    seri,
    ust,
    hamKodlar,
  };
}

/* ---------- ana birleştirme ---------- */

const markaHarita = new Map();
const seriHarita = new Map();
const kayitEdilenDosyalar = new Set();

function markaEkle(kayit, kaynak, dosya) {
  if (!kayit || typeof kayit !== 'object') return;
  const id = slug(ilkDeger(kayit.id, kayit.marka, kayit.ad));
  if (!id) {
    rapor.uyarilar.push({ kaynak, dosya, mesaj: 'marka kaydında id/ad yok, atlandı' });
    return;
  }
  const mevcut = markaHarita.get(id) || {
    id, ad: '', grup: '', aciklama: '', not: '', renk: '',
    _kaynaklar: new Set(), _oncelik: 9,
  };
  const oncelik = kaynak === 'A' ? 0 : kaynak === 'B' ? 1 : 2;
  const alanlariDoldur = [
    ['ad', ilkDeger(kayit.ad, kayit.isim) || etiketUret(id)],
    ['grup', metin(kayit.grup)],
    ['aciklama', metin(kayit.aciklama)],
    ['renk', metin(kayit.renk)],
  ];
  for (const [alan, deger] of alanlariDoldur) {
    if (!deger) continue;
    if (!mevcut[alan] || oncelik < mevcut._oncelik) mevcut[alan] = deger;
  }
  const not = metin(kayit.not ?? kayit.note);
  if (not && !mevcut.not.includes(not)) mevcut.not = mevcut.not ? `${mevcut.not} ${not}` : not;
  mevcut._kaynaklar.add(kaynak);
  if (oncelik < mevcut._oncelik) mevcut._oncelik = oncelik;
  markaHarita.set(id, mevcut);
}

/**
 * Bir kodu seriye ekler. Aynı kodNormal + aynı başlık -> atılır.
 * Aynı kodNormal + farklı başlık -> ikisi de tutulur, görünen kod "(2)"
 * ve kodNormal "...b" ile ayrılır.
 */
function koduEkle(seri, kod, ctx) {
  const mevcut = seri._kodNormalMap.get(kod.kodNormal);
  if (mevcut) {
    if (metin(mevcut.baslik).toLocaleLowerCase('tr') === metin(kod.baslik).toLocaleLowerCase('tr')) {
      dusurmeKaydet(ctx, `yinelenen kodNormal (${kod.kodNormal}), aynı başlık`);
      return;
    }
    let sayi = 2;
    let yeniKod;
    let yeniNormal;
    do {
      yeniKod = `${kod.kod} (${sayi})`;
      yeniNormal = `${kod.kodNormal}${harf(sayi)}`;
      sayi += 1;
    } while (seri._kodNormalMap.has(yeniNormal));

    rapor.carpismalar.push({
      kaynak: ctx.kaynak,
      dosya: ctx.dosya,
      marka: ctx.marka,
      seri: ctx.seri,
      kod: kod.kod,
      kodNormal: kod.kodNormal,
      yeniKod,
      yeniKodNormal: yeniNormal,
      korunanBaslik: mevcut.baslik,
      yeniBaslik: kod.baslik,
    });
    const ayrik = { ...kod, kod: yeniKod, kodNormal: yeniNormal };
    seri.kodlar.push(ayrik);
    seri._kodNormalMap.set(yeniNormal, ayrik);
    return;
  }
  seri.kodlar.push(kod);
  seri._kodNormalMap.set(kod.kodNormal, kod);
}

function harf(sayi) {
  // 2 -> b, 3 -> c, ... (26'dan sonra aa, ab, ...)
  let n = sayi - 1;
  let son = '';
  do {
    son = String.fromCharCode(97 + (n % 26)) + son;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return son;
}

async function seriDosyasiniIsle(dosya, kaynak) {
  const ctx = { kaynak, dosya: basename(dosya), marka: '', seri: '', kod: '' };
  let ham;
  try {
    ham = await jsonOku(dosya);
  } catch (hata) {
    rapor.uyarilar.push({ kaynak, dosya: ctx.dosya, mesaj: `JSON okunamadı: ${hata.message}` });
    return;
  }

  const normalize = seriNormalize(ham, ctx);
  if (!normalize) return;
  const { marka, seri: seriAdi, ust, hamKodlar } = normalize;

  const anahtar = `${marka}|${seriAdi}`;
  let seri = seriHarita.get(anahtar);
  if (!seri) {
    seri = {
      marka,
      seri: seriAdi,
      modelAdi: metin(ust.modelAdi),
      kaynakBelge: metin(ust.kaynakBelge),
      kaynakSurum: metin(ust.kaynakSurum),
      kaynakDil: metin(ust.kaynakDil),
      kaynakUrl: metin(ust.kaynakUrl),
      kodlar: [],
      _kodNormalMap: new Map(),
      _kaynaklar: new Set(),
      _dosyalar: new Set(),
      _ustOncelik: 9,
    };
    seriHarita.set(anahtar, seri);
  }

  const oncelik = kaynak === 'A' ? 0 : kaynak === 'B' ? 1 : 2;
  if (oncelik < seri._ustOncelik) {
    seri.modelAdi = metin(ust.modelAdi) || seri.modelAdi;
    seri.kaynakBelge = metin(ust.kaynakBelge) || seri.kaynakBelge;
    seri.kaynakSurum = metin(ust.kaynakSurum) || seri.kaynakSurum;
    seri.kaynakDil = metin(ust.kaynakDil) || seri.kaynakDil;
    seri._ustOncelik = oncelik;
  }
  if (!seri.kaynakUrl && ust.kaynakUrl) seri.kaynakUrl = metin(ust.kaynakUrl);
  seri._kaynaklar.add(kaynak);
  seri._dosyalar.add(ctx.dosya);
  kayitEdilenDosyalar.add(ctx.dosya);

  const oncekiKod = rapor.dusurulenKodlar.length;
  const oncekiCarpisma = rapor.carpismalar.length;
  let gecerli = 0;

  for (const hamKod of hamKodlar) {
    if (!hamKod || typeof hamKod !== 'object') {
      dusurmeKaydet(ctx, 'kod kaydı nesne değil');
      continue;
    }
    const kod = kodNormalize(hamKod, ust, ctx);
    if (!kod) continue;
    koduEkle(seri, kod, ctx);
    gecerli += 1;
  }

  rapor.seriler.push({
    kaynak,
    dosya: ctx.dosya,
    marka,
    seri: seriAdi,
    kayitEdilenKod: gecerli,
    dusurulen: rapor.dusurulenKodlar.length - oncekiKod,
    carpisma: rapor.carpismalar.length - oncekiCarpisma,
  });
}

async function markaDosyalariniIsle(dosya, kaynak) {
  let ham;
  try {
    ham = await jsonOku(dosya);
  } catch (hata) {
    rapor.uyarilar.push({ kaynak, dosya: basename(dosya), mesaj: `markalar.json okunamadı: ${hata.message}` });
    return 0;
  }
  const kayitlar = Array.isArray(ham) ? ham : (Array.isArray(ham?.markalar) ? ham.markalar : []);
  for (const kayit of kayitlar) markaEkle(kayit, kaynak, basename(dosya));
  return kayitlar.length;
}

function renkSec(id) {
  let toplam = 0;
  for (const harf of id) toplam = (toplam + harf.charCodeAt(0)) % 997;
  return RENK_PALETI[toplam % RENK_PALETI.length];
}

/* ---------- çalıştırma ---------- */

const mevcutKaynaklar = Object.entries(KAYNAK_YOLLARI).filter(([, yol]) => existsSync(yol));
if (mevcutKaynaklar.length === 0) {
  console.log('[birlestir] Kaynak klasörlerinin hiçbiri yok; src/data değiştirilmedi (çıkış 0).');
  process.exit(0);
}

for (const [kaynak, yol] of Object.entries(KAYNAK_YOLLARI)) {
  const varMi = existsSync(yol);
  const bilgi = { dizin: yol, var: varMi, markaKaydi: 0, seriDosyasi: 0, kod: 0, dosyalar: [] };
  rapor.kaynaklar[kaynak] = bilgi;
  if (!varMi) continue;

  const markaDosyasi = join(yol, 'markalar.json');
  if (existsSync(markaDosyasi)) {
    bilgi.markaKaydi = await markaDosyalariniIsle(markaDosyasi, kaynak);
  }

  // seriler/ alt klasörü + kök klasör (B/C düz dosya kullanabilir).
  const adaylar = await dosyalariTara(yol);
  const seriKlasoru = join(yol, 'seriler');
  const altDosyalar = existsSync(seriKlasoru) ? await dosyalariTara(seriKlasoru) : [];
  const tumDosyalar = [...new Set([...altDosyalar, ...adaylar])].sort();

  for (const dosya of tumDosyalar) {
    const onceki = rapor.seriler.length;
    await seriDosyasiniIsle(dosya, kaynak);
    const yeni = rapor.seriler.slice(onceki);
    for (const kayit of yeni) {
      bilgi.kod += kayit.kayitEdilenKod;
      bilgi.dosyalar.push(kayit.dosya);
    }
    bilgi.seriDosyasi += yeni.length;
  }
}

// Serilerde geçen markalar için eksik marka kayıtlarını güvenli biçimde oluştur.
for (const seri of seriHarita.values()) {
  if (!seri.kodlar.length) continue;
  if (markaHarita.has(seri.marka)) continue;
  const id = seri.marka;
  const ad = etiketUret(id);
  markaHarita.set(id, {
    id,
    ad,
    grup: 'Doğrulanmalı',
    aciklama: `${ad} markası, web araştırması seri dosyasından otomatik oluşturuldu. Açıklama ve grup bilgisi insan tarafından tamamlanmalıdır.`,
    not: 'Otomatik oluşturuldu — marka bilgileri doğrulanmalı.',
    renk: renkSec(id),
    _kaynaklar: new Set(seri._kaynaklar),
    _oncelik: 9,
  });
  rapor.otomatikMarkalar.push({ id, ad, seri: seri.seri, dosyalar: [...seri._dosyalar] });
}

await mkdir(SERI_KLASORU, { recursive: true });

/* ---------- KURATORLUK KATMANINI YUKLE ---------- */
let kuretajMarkalar = new Map();
let kuretajKarantina = { seriler: new Set(), markalar: new Set() };
const kuretajSeriler = new Map();

try {
  const ham = JSON.parse(await readFile(join(KURETAJ_KLASORU, 'markalar.json'), 'utf8'));
  for (const m of ham) if (m?.id) kuretajMarkalar.set(m.id, m);
} catch {
  // kuretaj kunyesi yoksa sorun degil
}

try {
  const k = JSON.parse(await readFile(join(KURETAJ_KLASORU, 'karantina.json'), 'utf8'));
  for (const s of k.seriler ?? []) kuretajKarantina.seriler.add(String(s));
  for (const m of k.markalar ?? []) kuretajKarantina.markalar.add(String(m));
} catch {
  // karantina listesi yoksa bos kabul et
}

try {
  for (const dosya of await readdir(KURETAJ_SERI_KLASORU)) {
    if (!dosya.endsWith('.json')) continue;
    const icerik = JSON.parse(await readFile(join(KURETAJ_SERI_KLASORU, dosya), 'utf8'));
    if (!icerik?.marka || !icerik?.seri || !Array.isArray(icerik.kodlar)) continue;
    kuretajSeriler.set(`${icerik.marka}|${icerik.seri}`, icerik);
  }
} catch {
  // kuretaj seri klasoru yoksa sorun degil
}

/* ---------- KARANTINA UYGULA ---------- */
let karantinaSeriSayisi = 0;
for (const [anahtar, seri] of [...seriHarita.entries()]) {
  if (kuretajKarantina.markalar.has(String(seri.marka))) {
    seriHarita.delete(anahtar);
    karantinaSeriSayisi++;
    continue;
  }
  const dosyaAnahtari = `${seri.marka}-${seri.seri}`;
  if (
    kuretajKarantina.seriler.has(dosyaAnahtari) ||
    kuretajKarantina.seriler.has(anahtar) ||
    kuretajKarantina.seriler.has(`${seri.marka}|${seri.seri}`)
  ) {
    seriHarita.delete(anahtar);
    karantinaSeriSayisi++;
  }
}
for (const id of kuretajKarantina.markalar) markaHarita.delete(id);

/* ---------- KURETAJ SERILERINI UYGULA (otomatigin onune gecer) ---------- */
let kuretajSeriSayisi = 0;
for (const [anahtar, icerik] of kuretajSeriler) {
  const markaId = String(icerik.marka);
  if (kuretajKarantina.markalar.has(markaId)) continue;

  if (!markaHarita.has(markaId)) {
    markaHarita.set(markaId, {
      id: markaId,
      ad: kuretajMarkalar.get(markaId)?.ad ?? markaId,
      grup: '',
      aciklama: '',
      not: '',
      renk: RENK_PALETI[markaHarita.size % RENK_PALETI.length],
      _kaynaklar: new Set(),
      _oncelik: 'K',
    });
  }
  markaHarita.get(markaId)._oncelik = 'K';
  markaHarita.get(markaId)._kaynaklar.add('kuretaj');

  seriHarita.set(`${markaId}|${icerik.seri}`, {
    marka: markaId,
    seri: icerik.seri,
    modelAdi: icerik.modelAdi ?? '',
    kaynakBelge: icerik.kaynakBelge ?? '',
    kaynakSurum: icerik.kaynakSurum ?? '',
    kaynakDil: icerik.kaynakDil ?? 'TR',
    kaynakUrl: icerik.kaynakUrl ?? '',
    kodlar: icerik.kodlar,
    _dosyalar: new Set(['kuretaj']),
    _oncelik: 'K',
  });
  kuretajSeriSayisi++;
}

/* ---------- KURETAJ MARKA KUNYESI (alan bazli ustunluk) ---------- */
for (const [id, kunye] of kuretajMarkalar) {
  if (kuretajKarantina.markalar.has(id)) continue;
  const mevcut = markaHarita.get(id);
  if (!mevcut) {
    markaHarita.set(id, {
      id,
      ad: kunye.ad ?? id,
      grup: kunye.grup ?? '',
      aciklama: kunye.aciklama ?? '',
      not: kunye.not ?? '',
      renk: kunye.renk ?? RENK_PALETI[markaHarita.size % RENK_PALETI.length],
      _kaynaklar: new Set(['kuretaj']),
      _oncelik: 'K',
    });
    continue;
  }
  for (const alan of ['ad', 'grup', 'aciklama', 'not', 'renk']) {
    if (typeof kunye[alan] === 'string' && kunye[alan].length > 0) mevcut[alan] = kunye[alan];
  }
  mevcut._oncelik = 'K';
  mevcut._kaynaklar.add('kuretaj');
}

/* ---------- NIHAI SERI LISTESI (kuretaj + karantina sonrasi) ---------- */
const gecerliSeriler = [...seriHarita.values()].filter((seri) => seri.kodlar.length > 0);
const toplamKod = gecerliSeriler.reduce((toplam, seri) => toplam + seri.kodlar.length, 0);

/* Eski/bayat seri dosyalarini temizle. */
let silinenDosyaSayisi = 0;
try {
  const uretilenAnahtarlar = new Set(
    gecerliSeriler.map((seri) => `${slug(seri.marka)}-${slug(seri.seri)}`),
  );
  for (const dosya of await readdir(SERI_KLASORU)) {
    if (!dosya.endsWith('.json')) continue;
    const anahtar = dosya.replace(/\.json$/, '');
    if (uretilenAnahtarlar.has(anahtar)) continue;
    if (kuretajSeriler.has(anahtar)) continue;
    await rm(join(SERI_KLASORU, dosya), { force: true });
    silinenDosyaSayisi++;
  }
} catch {
  // okunamadiysa atla
}

if (gecerliSeriler.length === 0 || markaHarita.size === 0) {
  console.log('[birlestir] Kaynaklarda geçerli seri/marka bulunamadı; src/data değiştirilmedi.');
  await mkdir(ARAC_KLASORU, { recursive: true });
  await writeFile(RAPOR_DOSYASI, JSON.stringify({ ...rapor, toplamlar: { marka: markaHarita.size, seri: 0, kod: 0 } }, null, 2), 'utf8');
  process.exit(0);
}

rapor.karantina = {
  seri: karantinaSeriSayisi,
  marka: [...kuretajKarantina.markalar],
  liste: [...kuretajKarantina.seriler],
};
rapor.kuretaj = { seri: kuretajSeriSayisi, marka: kuretajMarkalar.size };
console.log(`[birlestir] Küratörlük: ${kuretajSeriSayisi} seri ezildi, ${karantinaSeriSayisi} seri karantinada.`);


// Kullanılmayan eski seri dosyaları korunur (başka iş akışlarının ürünü olabilir).
try {
  for (const dosya of await readdir(SERI_KLASORU)) {
    if (!dosya.endsWith('.json')) continue;
    const anahtar = dosya.replace(/\.json$/, '');
    const uretilen = gecerliSeriler.some((seri) => `${seri.marka}-${seri.seri}` === anahtar);
    if (!uretilen) rapor.korunanDosyalar.push(dosya);
  }
} catch {
  // seri klasörü yeni oluşturulduysa okuma hatası normal.
}

// Küratörlük marka künyesi varsa YALNIZCA o kullanılır; otomatik üretilen
// marka kayıtları (yer tutucu grup/açıklama) siteye sızmaz.
const kuretajVar = kuretajMarkalar.size > 0;
const markalar = [...markaHarita.values()]
  .map(({ _kaynaklar, _oncelik, ...marka }) => marka)
  .filter((marka) => {
    if (!kuretajVar) return true;
    return kuretajMarkalar.has(marka.id);
  })
  .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));

gecerliSeriler.sort((a, b) =>
  a.marka.localeCompare(b.marka, 'tr') || a.seri.localeCompare(b.seri, 'tr'));

for (const seri of gecerliSeriler) {
  const dosyaAdi = `${slug(seri.marka)}-${slug(seri.seri)}.json`;
  const cikti = {
    marka: seri.marka,
    seri: seri.seri,
    modelAdi: seri.modelAdi,
    kaynakBelge: seri.kaynakBelge,
    kaynakSurum: seri.kaynakSurum,
    kaynakDil: seri.kaynakDil,
    kaynakUrl: seri.kaynakUrl,
    kodlar: seri.kodlar,
  };
  await writeFile(join(SERI_KLASORU, dosyaAdi), JSON.stringify(cikti, null, 2) + '\n', 'utf8');
}

await writeFile(join(VERI_KLASORU, 'markalar.json'), JSON.stringify(markalar, null, 2) + '\n', 'utf8');

rapor.toplamlar = {
  marka: markalar.length,
  seri: gecerliSeriler.length,
  kod: toplamKod,
  dusurulenKod: rapor.dusurulenKodlar.length,
  carpisma: rapor.carpismalar.length,
  enumOnarimi: rapor.enumOnarimlari.length,
  otomatikMarka: rapor.otomatikMarkalar.length,
};
rapor.markalar = markalar.map((marka) => {
  const seriler = gecerliSeriler.filter((seri) => seri.marka === marka.id);
  return {
    id: marka.id,
    ad: marka.ad,
    seriSayisi: seriler.length,
    kodSayisi: seriler.reduce((toplam, seri) => toplam + seri.kodlar.length, 0),
    seriler: seriler.map((seri) => seri.seri),
    kaynaklar: [...(markaHarita.get(marka.id)?._kaynaklar ?? [])],
  };
});

await writeFile(RAPOR_DOSYASI, JSON.stringify(rapor, null, 2), 'utf8');

console.log(`[birlestir] ${rapor.toplamlar.marka} marka, ${rapor.toplamlar.seri} seri, ${rapor.toplamlar.kod} kod yazıldı.`);
console.log(`[birlestir] ${rapor.toplamlar.dusurulenKod} kod atıldı, ${rapor.toplamlar.carpisma} kodNormal çakışması, ${rapor.toplamlar.enumOnarimi} alan onarıldı.`);
console.log('[birlestir] Rapor: tools/rapor-veri.json');
