# .orchestrator — proje belleği

Bu klasör projeyle ilgili yönetim kayıtlarını tutar. Kod, veri ve yapılandırma dosyaları burada değiştirilmez; yalnızca Markdown/JSON belgeler bulunur. Dosyalar her iş dalgasından sonra güncellenir ve bir sonraki dalganın başlangıç bağlamı olarak okunur.

Dizin düzeni:

- `model-registry/providers.json` — kullanılan provider'lar, rolleri ve devre dışı nedenleri.
- `model-registry/sources.json` — veri kaynağı alan adları ve kayıt bazlı kullanım sayıları.
- `project-management/project-charter.json` — hedef, kapsam, kabul kriterleri ve ölçülen proje rakamları.
- `project-management/wbs.json` — teslim edilen fazlar (P1–P7) ve çıktıları.
- `execution/completed-tasks.json` — tamamlanan işler, tarih ve doğrulama yöntemi.
- `execution/blockers.json` — açık kalan veri, kapsam ve provider sorunları.
- `performance/credits.json` — kredi/context ölçüm durumu; ölçüm yapılmadıysa boş bırakılır.

Kurallar:

- Sayılar `src/data/seriler/*.json` üzerinden yeniden sayılarak doğrulanır; eski değerler kopyalanmaz.
- Doğrulanmayan bilgiler `UNKNOWN` veya `belirtilmedi` olarak yazılır; tahmin uydurulmaz.
- Provider yetenekleri ve benchmark sonuçları bu projede ölçülmediği için `UNKNOWN` tutulur.
- Görev tamamlandığında `completed-tasks.json` güncellenir; yeni engel ortaya çıkarsa `blockers.json` yazılır.
- Kapsam veya kabul kriteri değişmediği sürece proje charter'ı yeniden yazılmaz.
