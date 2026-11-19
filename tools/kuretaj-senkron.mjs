#!/usr/bin/env node
/**
 * kuretaj-senkron.mjs — src/data/seriler/ ile src/data/kuretaj/seriler/
 * arasında KALİTEYE GÖRE senkronizasyon yapar.
 *
 * Neden: iş akışları bazen src/data/seriler/ dosyasını iyileştirir, bazen
 * küratörlük katmanını. Hangisinin daha iyi olduğunu dosya tarihine bakarak
 * değil, ÖLÇÜLEN KALİTE PUANINA bakarak belirlemek gerekir.
 *
 * Puan (yüksek = iyi):
 *   +3  nedenler >= 2 olan kayıt
 *   +3  kontroller >= 2 olan kayıt
 *   +2  aciklama >= 40 karakter
 *   +2  aciklama != baslik
 *   -4  İngilizce kalıntı içeren kayıt
 *   -2  "kaynakta belirtilmemiş" yer tutucusu
 *
 * Kullanım:
 *   node tools/kuretaj-senkron.mjs            # kuru çalışma (rapor)
 *   node tools/kuretaj-senkron.mjs --uygula   # kazananı küratörlüğe yaz
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ARAC = dirname(fileURLToPath(import.meta.url));
const KOK = join(ARAC, '..');
const KAYNAK = join(KOK, 'src', 'data', 'seriler');
const KURETAJ = join(KOK, 'src', 'data', 'kuretaj', 'seriler');

const uygula = process.argv.includes('--uygula');

const INGILIZCE = /\b(the|check|replace|circuit|voltage|controller|when|with|from|error|open|short|fault|sensor|relay|switch)\b/i;

function puanla(veri) {
  let puan = 0;
  const kodlar = veri.kodlar ?? [];
  for (const k of kodlar) {
    if ((k.nedenler ?? []).length >= 2) puan += 3;
    if ((k.kontroller ?? []).length >= 2) puan += 3;
    const ac = k.aciklama ?? '';
    if (ac.length >= 40) puan += 2;
    if (ac.trim() !== (k.baslik ?? '').trim()) puan += 2;
    const metin = [k.baslik, k.aciklama, ...(k.nedenler ?? []), ...(k.kontroller ?? [])].join(' ');
    if (INGILIZCE.test(metin)) puan -= 4;
    const tum = [...(k.nedenler ?? []), ...(k.kontroller ?? [])].join(' ');
    if (tum.includes('kaynakta belirtilmemiş') || tum.includes('Kaynakta neden belirtilmemiş')) puan -= 2;
  }
  return { puan, kod: kodlar.length };
}

const dosyalar = (await readdir(KAYNAK)).filter((d) => d.endsWith('.json'));
const satirlar = [];
let guncellenen = 0;

for (const dosya of dosyalar) {
  const kaynakYol = join(KAYNAK, dosya);
  const hedefYol = join(KURETAJ, dosya);

  let kaynak;
  try {
    kaynak = JSON.parse(await readFile(kaynakYol, 'utf8'));
  } catch {
    continue;
  }

  if (!existsSync(hedefYol)) {
    satirlar.push({ dosya, durum: 'YENİ', kaynak: puanla(kaynak).puan, kuretaj: '—' });
    if (uygula) {
      await writeFile(hedefYol, JSON.stringify(kaynak, null, 2) + '\n', 'utf8');
      guncellenen++;
    }
    continue;
  }

  let kuretaj;
  try {
    kuretaj = JSON.parse(await readFile(hedefYol, 'utf8'));
  } catch {
    satirlar.push({ dosya, durum: 'BOZUK→KAYNAK', kaynak: puanla(kaynak).puan, kuretaj: '—' });
    if (uygula) {
      await writeFile(hedefYol, JSON.stringify(kaynak, null, 2) + '\n', 'utf8');
      guncellenen++;
    }
    continue;
  }

  const kp = puanla(kaynak);
  const jp = puanla(kuretaj);
  const ayni = kaynak.kodlar?.length === kuretaj.kodlar?.length && kp.puan === jp.puan;

  if (ayni) {
    satirlar.push({ dosya, durum: 'eşit', kaynak: kp.puan, kuretaj: jp.puan });
    continue;
  }

  const kaynakKazandi = kp.puan > jp.puan;
  satirlar.push({
    dosya,
    durum: kaynakKazandi ? 'KAYNAK→KÜRATAJ' : 'küratör korunur',
    kaynak: kp.puan,
    kuretaj: jp.puan,
  });

  if (uygula && kaynakKazandi) {
    await writeFile(hedefYol, JSON.stringify(kaynak, null, 2) + '\n', 'utf8');
    guncellenen++;
  }
}

satirlar.sort((a, b) => String(a.durum).localeCompare(String(b.durum)) || a.dosya.localeCompare(b.dosya));
console.log(`${'DOSYA'.padEnd(48)} ${'DURUM'.padEnd(20)} KAYNAK  KÜRATAJ`);
for (const s of satirlar) {
  console.log(`${s.dosya.padEnd(48)} ${String(s.durum).padEnd(20)} ${String(s.kaynak).padStart(6)} ${String(s.kuretaj).padStart(8)}`);
}
console.log(
  `\n[kuretaj-senkron] ${satirlar.filter((s) => s.durum === 'KAYNAK→KÜRATAJ' || s.durum === 'YENİ' || String(s.durum).startsWith('BOZUK')).length} dosya güncellenmeli.` +
    (uygula ? ` ${guncellenen} dosya yazıldı.` : ' Kuru çalışma — uygulamak için --uygula'),
);
