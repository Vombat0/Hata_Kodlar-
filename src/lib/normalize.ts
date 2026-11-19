/** Türkçe karakterleri sadeleştirip küçük harfe indirger (sunucu + istemci ortak). */
export function trNormalize(deger: string): string {
  return String(deger ?? '')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/Ş/g, 's')
    .replace(/ş/g, 's')
    .replace(/Ğ/g, 'g')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u')
    .replace(/ü/g, 'u')
    .replace(/Ö/g, 'o')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'c')
    .replace(/ç/g, 'c')
    .toLocaleLowerCase('en-US');
}

/** Kodları karşılaştırmak için ayırıcıları kaldırır: "30-1" -> "301". */
export function kodAnahtar(deger: string): string {
  return trNormalize(deger).replace(/[^a-z0-9]/g, '');
}
