/**
 * Kod -> site içi adres dönüşümü. Veri yükü olmadığı için sunucu ve istemci
 * tarafından güvenle içe aktarılabilir.
 *
 * "OFF/ON" -> "OFF-ON", "1,2" -> "1-2", "30 1" -> "30-1"
 * Hem getStaticPaths hem de tüm iç bağlantılar bu fonksiyonu kullanmalıdır.
 */
export function kodYolu(kod: string): string {
  return String(kod)
    .trim()
    .replace(/[\/\\]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/,/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Bir kod kaydının site içi tam adresi. */
export function kodAdresi(marka: string, seri: string, kod: string): string {
  return `/${marka}/${seri}/${kodYolu(kod)}/`;
}
