#!/usr/bin/env node
/**
 * kuretaj-al.mjs — src/data/seriler/ altındaki işlenmiş seri dosyalarını
 * küratörlük katmanına kopyalar. Böylece bir sonraki `birlestir.mjs`
 * çalışması bu dosyaları ham kaynakla EZEMEZ.
 *
 * GÜVENLİK KURALI: küratörlükte zaten var olan bir dosya, açıkça
 * `--force` verilmedikçe ÜZERİNE YAZILMAZ. Çünkü src/data/seriler/
 * dosyaları ham kaynaktan üretilmiş olabilir; elle işlenmiş küratörlük
 * sürümünü kaybetmemek için varsayılan davranış korumacıdır.
 *
 * Kullanım:
 *   node tools/kuretaj-al.mjs                    # yalnızca yeni serileri al
 *   node tools/kuretaj-al.mjs --force            # hepsini yeniden al
 *   node tools/kuretaj-al.mjs traigo-48 --force  # belirtileni zorla al
 */
import { readFile, readdir, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ARAC = dirname(fileURLToPath(import.meta.url));
const KOK = join(ARAC, '..');
const KAYNAK = join(KOK, 'src', 'data', 'seriler');
const HEDEF = join(KOK, 'src', 'data', 'kuretaj', 'seriler');

await mkdir(HEDEF, { recursive: true });

const argumanlar = process.argv.slice(2);
const zorla = argumanlar.includes('--force');
const istenen = argumanlar.filter((a) => !a.startsWith('--'));

const dosyalar = (await readdir(KAYNAK))
  .filter((d) => d.endsWith('.json'))
  .filter((d) => istenen.length === 0 || istenen.some((i) => d.includes(i)));

let alinan = 0;
let atlanan = 0;
let korunan = 0;

for (const dosya of dosyalar) {
  const yol = join(KAYNAK, dosya);
  const hedefYol = join(HEDEF, dosya);

  if (existsSync(hedefYol) && !zorla) {
    console.log(`[kuretaj-al] KORUNDU (zaten küratörlükte): ${dosya} — zorlamak için --force`);
    korunan++;
    continue;
  }

  let icerik;
  try {
    icerik = JSON.parse(await readFile(yol, 'utf8'));
  } catch (hata) {
    console.warn(`[kuretaj-al] ATLANDI (geçersiz JSON): ${dosya}`);
    atlanan++;
    continue;
  }

  if (!icerik?.marka || !icerik?.seri || !Array.isArray(icerik.kodlar) || icerik.kodlar.length === 0) {
    console.warn(`[kuretaj-al] ATLANDI (eksik alan): ${dosya}`);
    atlanan++;
    continue;
  }

  const eksik = icerik.kodlar.filter(
    (k) => !k.kod || !k.baslik || !k.aciklama || k.aciklama.length < 20,
  );
  if (eksik.length > 0) {
    console.warn(
      `[kuretaj-al] ATLANDI (${eksik.length} eksik/boş kayıt): ${dosya} → ${eksik.slice(0, 3).map((k) => k.kod).join(', ')}`,
    );
    atlanan++;
    continue;
  }

  await copyFile(yol, join(HEDEF, dosya));
  console.log(`[kuretaj-al] alındı: ${dosya} (${icerik.kodlar.length} kod)`);
  alinan++;
}

console.log(`[kuretaj-al] ${alinan} seri alındı, ${korunan} korundu, ${atlanan} atlandı.`);
