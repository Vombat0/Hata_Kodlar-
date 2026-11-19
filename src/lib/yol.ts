/**
 * Kod -> site içi adres dönüşümü. Veri yükü olmadığı için sunucu ve istemci
 * tarafından güvenle içe aktarılabilir.
 *
 * "OFF/ON" -> "OFF-ON", "1,2" -> "1-2", "30 1" -> "30-1"
 * Hem getStaticPaths hem de tüm iç bağlantılar bu fonksiyonu kullanmalıdır.
 */
const TR_HARF: Record<string, string> = {
  'ı': 'i', 'İ': 'i', 'ş': 's', 'Ş': 's', 'ğ': 'g', 'Ğ': 'g',
  'ü': 'u', 'Ü': 'u', 'ö': 'o', 'Ö': 'o', 'ç': 'c', 'Ç': 'c', 'â': 'a', 'î': 'i', 'û': 'u',
};

export function kodYolu(kod: string): string {
  return String(kod)
    .trim()
    .replace(/[\/\\]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/,/g, '-')
    .replace(/[ıİşŞğĞüÜöÖçÇâîû]/g, (h) => TR_HARF[h] ?? h)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Bir kod kaydının site içi tam adresi. */
export function kodAdresi(marka: string, seri: string, kod: string): string {
  return `/${marka}/${seri}/${kodYolu(kod)}/`;
}
