import markalarJson from '../data/markalar.json';
import { trNormalize, kodAnahtar } from './normalize';

export { trNormalize, kodAnahtar } from './normalize';
export { kodYolu, kodAdresi } from './yol';

export interface Kod {
  kod: string;
  kodNormal?: string;
  aliaslar?: string[];
  sistem: string;
  baslik: string;
  aciklama: string;
  makineTepkisi?: string;
  siddet: string;
  nedenler?: string[];
  kontroller?: string[];
  ilgiliKodlar?: string[];
  kaynakSayfa?: number;
  durum: string;
}

export interface Seri {
  marka: string;
  seri: string;
  modelAdi: string;
  kaynakBelge: string;
  kaynakSurum?: string;
  kaynakDil?: string;
  kaynakUrl?: string;
  kodlar: Kod[];
}

export interface Marka {
  id: string;
  ad: string;
  grup: string;
  aciklama: string;
  not?: string;
  renk: string;
}

export interface AramaSonucu {
  kod: Kod;
  marka: string;
  markaAd: string;
  seri: string;
  modelAdi: string;
}

const seriModulleri = import.meta.glob<{ default: Seri }>('../data/seriler/*.json', {
  eager: true,
});

const SERILER: Seri[] = Object.values(seriModulleri)
  .map((modul) => modul.default)
  .filter((seri): seri is Seri => Boolean(seri && Array.isArray(seri.kodlar)));

const MARKALAR: Marka[] = markalarJson as Marka[];

export const SISTEMLER: Record<string, string> = {
  yuruyus: 'Yürüyüş',
  hidrolik: 'Hidrolik',
  direksiyon: 'Direksiyon',
  fren: 'Fren',
  batarya: 'Batarya',
  iletisim: 'İletişim',
  gosterge: 'Gösterge',
  motor: 'Motor',
  sanziman: 'Şanzıman',
  guvenlik: 'Güvenlik',
  elektrik: 'Elektrik',
  atisman: 'Atış / Mast',
  diger: 'Diğer',
};

export const SIDDETLER: Record<string, { ad: string; renk: string }> = {
  durdurucu: { ad: 'Durdurucu', renk: '#EF4444' },
  kisitlayici: { ad: 'Kısıtlayıcı', renk: '#F59E0B' },
  uyari: { ad: 'Uyarı', renk: '#3B82F6' },
  bilgi: { ad: 'Bilgi', renk: '#64748B' },
};

export const DURUMLAR: Record<string, { ad: string; renk: string }> = {
  dogrulandi: { ad: 'Doğrulandı', renk: '#22C55E' },
  incelemede: { ad: 'İncelemede', renk: '#F59E0B' },
  taslak: { ad: 'Taslak', renk: '#64748B' },
};

export function sistemAdi(sistem: string): string {
  return SISTEMLER[sistem] ?? sistem ?? 'Diğer';
}

export function markaAdi(markaId: string): string {
  return MARKALAR.find((m) => m.id === markaId)?.ad ?? markaId;
}

/** "Toyota" + "Toyota 8FBE" gibi tekrarları önler. */
export function seriEtiket(markaAd: string, modelAdi: string): string {
  const ad = String(modelAdi ?? '').trim();
  const marka = String(markaAd ?? '').trim();
  if (!marka || !ad) return ad || marka;
  return trNormalize(ad).startsWith(trNormalize(marka)) ? ad : `${marka} ${ad}`;
}

export function getMarkalar(): Marka[] {
  return MARKALAR;
}

export function getMarka(markaId: string): Marka | undefined {
  return MARKALAR.find((m) => m.id === markaId);
}

export function getSeriler(markaId?: string): Seri[] {
  if (!markaId) return SERILER;
  return SERILER.filter((seri) => seri.marka === markaId);
}

export function getSeri(markaId: string, seriId: string): Seri | undefined {
  return SERILER.find((seri) => seri.marka === markaId && seri.seri === seriId);
}

/** Kod, kodNormal veya alias eşleşmesiyle tek bir kayıt döndürür. */
export function getKod(markaId: string, seriId: string, kod: string): Kod | undefined {
  const seri = getSeri(markaId, seriId);
  if (!seri) return undefined;
  const anahtar = kodAnahtar(kod);
  return seri.kodlar.find((k) => {
    const adaylar = [k.kod, k.kodNormal ?? '', ...(k.aliaslar ?? [])];
    return adaylar.some((aday) => kodAnahtar(aday) === anahtar);
  });
}

export interface AramaSecenekleri {
  marka?: string;
  seri?: string;
  sistem?: string;
}

/** Kod, başlık, açıklama, sistem ve alias alanlarında Türkçe duyarlı arama yapar. */
export function aramaYap(sorgu: string, secenekler: AramaSecenekleri = {}): AramaSonucu[] {
  const ham = String(sorgu ?? '').trim();
  const normalizeSorgu = trNormalize(ham);
  const sorguAnahtar = kodAnahtar(ham);
  const sonuclar: AramaSonucu[] = [];

  for (const seri of SERILER) {
    if (secenekler.marka && seri.marka !== secenekler.marka) continue;
    if (secenekler.seri && seri.seri !== secenekler.seri) continue;
    const marka = getMarka(seri.marka);

    for (const kod of seri.kodlar) {
      if (secenekler.sistem && kod.sistem !== secenekler.sistem) continue;

      if (ham) {
        const kodEslesmesi = sorguAnahtar.length > 0 &&
          [kod.kod, kod.kodNormal ?? '', ...(kod.aliaslar ?? [])].some(
            (aday) => kodAnahtar(aday) === sorguAnahtar ||
              (sorguAnahtar.length >= 3 && kodAnahtar(aday).includes(sorguAnahtar)),
          );
        const metinEslesmesi = normalizeSorgu.length > 0 && [
          kod.baslik,
          kod.aciklama,
          sistemAdi(kod.sistem),
          kod.sistem,
        ].some((alan) => trNormalize(alan ?? '').includes(normalizeSorgu));

        if (!kodEslesmesi && !metinEslesmesi) continue;
      }

      sonuclar.push({
        kod,
        marka: seri.marka,
        markaAd: marka?.ad ?? seri.marka,
        seri: seri.seri,
        modelAdi: seri.modelAdi,
      });
    }
  }

  // Önce tam kod eşleşmeleri, sonra marka/seri sıralaması.
  sonuclar.sort((a, b) => {
    const aTam = kodAnahtar(a.kod.kod) === sorguAnahtar ? 1 : 0;
    const bTam = kodAnahtar(b.kod.kod) === sorguAnahtar ? 1 : 0;
    if (aTam !== bTam) return bTam - aTam;
    if (a.marka !== b.marka) return a.marka.localeCompare(b.marka, 'tr');
    if (a.seri !== b.seri) return a.seri.localeCompare(b.seri, 'tr');
    return a.kod.kod.localeCompare(b.kod.kod, 'tr');
  });

  return sonuclar;
}

export interface MarkaIstatistik {
  id: string;
  ad: string;
  seriSayisi: number;
  kodSayisi: number;
  seriler: SeriIstatistik[];
}

export interface SeriIstatistik {
  marka: string;
  seri: string;
  modelAdi: string;
  kaynakBelge: string;
  kodSayisi: number;
  dogrulanan: number;
  incelemede: number;
  taslak: number;
}

export interface Istatistik {
  toplamKod: number;
  markaSayisi: number;
  seriSayisi: number;
  markalar: MarkaIstatistik[];
  sistemler: { id: string; ad: string; sayi: number }[];
  siddetler: { id: string; ad: string; renk: string; sayi: number }[];
  durumlar: { id: string; ad: string; renk: string; sayi: number }[];
}

export function istatistik(): Istatistik {
  const sistemSayilari = new Map<string, number>();
  const siddetSayilari = new Map<string, number>();
  const durumSayilari = new Map<string, number>();
  let toplamKod = 0;

  for (const seri of SERILER) {
    for (const kod of seri.kodlar) {
      toplamKod += 1;
      sistemSayilari.set(kod.sistem, (sistemSayilari.get(kod.sistem) ?? 0) + 1);
      siddetSayilari.set(kod.siddet, (siddetSayilari.get(kod.siddet) ?? 0) + 1);
      durumSayilari.set(kod.durum, (durumSayilari.get(kod.durum) ?? 0) + 1);
    }
  }

  const markalar: MarkaIstatistik[] = MARKALAR.map((marka) => {
    const seriler: SeriIstatistik[] = getSeriler(marka.id).map((seri) => ({
      marka: seri.marka,
      seri: seri.seri,
      modelAdi: seri.modelAdi,
      kaynakBelge: seri.kaynakBelge,
      kodSayisi: seri.kodlar.length,
      dogrulanan: seri.kodlar.filter((k) => k.durum === 'dogrulandi').length,
      incelemede: seri.kodlar.filter((k) => k.durum === 'incelemede').length,
      taslak: seri.kodlar.filter((k) => k.durum === 'taslak').length,
    }));
    return {
      id: marka.id,
      ad: marka.ad,
      seriSayisi: seriler.length,
      kodSayisi: seriler.reduce((toplam, s) => toplam + s.kodSayisi, 0),
      seriler,
    };
  });

  const sayiSirala = (a: { sayi: number }, b: { sayi: number }) => b.sayi - a.sayi;

  return {
    toplamKod,
    markaSayisi: markalar.filter((m) => m.kodSayisi > 0).length,
    seriSayisi: SERILER.length,
    markalar,
    sistemler: [...sistemSayilari.entries()]
      .map(([id, sayi]) => ({ id, ad: sistemAdi(id), sayi }))
      .sort(sayiSirala),
    siddetler: [...siddetSayilari.entries()]
      .map(([id, sayi]) => ({ id, ad: SIDDETLER[id]?.ad ?? id, renk: SIDDETLER[id]?.renk ?? '#64748B', sayi }))
      .sort(sayiSirala),
    durumlar: [...durumSayilari.entries()]
      .map(([id, sayi]) => ({ id, ad: DURUMLAR[id]?.ad ?? id, renk: DURUMLAR[id]?.renk ?? '#64748B', sayi }))
      .sort(sayiSirala),
  };
}

/** Sık aranan kodlar — ana sayfadaki hızlı erişim listesi için.
 *  Öncelik listesi sabit değildir: her markanın en temsili kodlarından
 *  veriye dayalı bir seçki üretilir. Böylece örnek bağlantılar asla boş sonuç vermez. */
export function sikArananKodlar(limit = 6): AramaSonucu[] {
  const tercih = ['30-1', 'A1-1', 'A0-1', '201', '1201', '108'];
  const secilen: AramaSonucu[] = [];
  const kullanilan = new Set<string>();

  // 1) Bilinen temsili kodlar (varsa)
  for (const kod of tercih) {
    const bulunan = aramaYap(kod).find((s) => kodAnahtar(s.kod.kod) === kodAnahtar(kod));
    if (bulunan && !kullanilan.has(`${bulunan.marka}|${bulunan.seri}|${bulunan.kod.kod}`)) {
      secilen.push(bulunan);
      kullanilan.add(`${bulunan.marka}|${bulunan.seri}|${bulunan.kod.kod}`);
    }
  }

  // 2) Marka çeşitliliği gözeterek tamamla: her markadan bir kod
  const markaGoruldu = new Set(secilen.map((s) => s.marka));
  for (const seri of SERILER) {
    if (secilen.length >= limit) break;
    if (markaGoruldu.has(seri.marka)) continue;
    const aday = seri.kodlar.find((k) => k.durum === 'dogrulandi') ?? seri.kodlar[0];
    if (!aday) continue;
    secilen.push({
      marka: seri.marka,
      seri: seri.seri,
      markaAd: markaAdi(seri.marka),
      modelAdi: seri.modelAdi,
      kod: aday,
    });
    markaGoruldu.add(seri.marka);
  }

  return secilen.slice(0, limit);
}
