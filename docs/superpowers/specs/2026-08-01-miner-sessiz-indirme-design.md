# Miner — Sessiz (Odak Çalmayan) İndirme Tasarımı

**Tarih:** 2026-08-01
**Durum:** Onaylandı, uygulanıyor

## Problem

Miner her belge için sayfadaki PDF ikonuna `el.click()` yapıyor. SGK'da bu tıklama
`islem()` fonksiyonunu çalıştırıyor ve o da gizli `pdfGosterimForm`'u
`target="_blank"` ile POST ediyor. Tarayıcı bu POST için **yeni bir sekme/pencere
yaratmak zorunda** ve işletim sistemi o pencereyi öne getiriyor.

Sonuç: kullanıcı indirme boyunca bilgisayarını kullanamıyor — başka uygulamaya
geçtiği anda Chrome tekrar öne fırlıyor.

### Denenip başarısız olan yaklaşımlar

1. `inject.js` içinde `window.focus = function(){}` — **dosya hiç yüklenmiyordu**, ölü koddu.
2. `window.open` intercept — SGK'nın indirme akışı (`TD`/`HD`/`SHD`) `window.open`
   **çağırmıyor**; sadece form target'ı kullanıyor. Yama ilgisiz yere denk geliyordu.
3. `chrome.windows.onCreated` → pencereyi küçültmek — yarış durumu. Pencere
   yaratıldıktan *sonra* tepki verdiğimiz için kısa bir öne-fırlama hep kalıyor.

**Çıkarım:** Tıklamayı simüle ettiğimiz sürece tarayıcı pencere yaratacak ve odak
çalınacak. Tek kesin çözüm: **hiç tıklamamak.**

## Keşif: SGK'nın gerçek isteği

Canlı sayfadan çıkarılan `islem()` kaynağı:

```js
function islem(EkForm, deger){
  var popName = "_blank";
  switch (EkForm) {
    case "T": case "H": case "SH":   // sadece GÖRÜNTÜLE varyantları
      pdfPopupPencere = window.open('about:blank', 'pdfPopup'+i, '...');
      pdfPopupPencere.focus();
      popName = pdfPopupPencere.name;
    break;
  }
  $('#bildirgeRefNoId').val(deger);
  $('#downloadId').val('false');
  switch (EkForm) {
    case "TD":  $('#tipId').val('tahakkukonayliFisTahakkukPdf');          $('#downloadId').val('true'); break;
    case "HD":  $('#tipId').val('tahakkukonayliFisHizmetPdf');            $('#downloadId').val('true'); break;
    case "SHD": $('#tipId').val('tahakkukonayliFisUcretGizliHizmetPdf');  $('#downloadId').val('true'); break;
  }
  pdfFormId.target = popName;
  pdfFormId.submit();
  return false;
}
```

Form: `pdfGosterimForm` → `POST /EBildirgeV2/tahakkuk/pdfGosterim.action`

Miner yalnızca `TD`/`HD`/`SHD` (indir) varyantlarını hedefliyor — bunlar
`window.open` çağırmıyor. Odak çalan tek şey `target="_blank"` form POST'u.

İstek tamamen taklit edilebilir: 3 alan + formun mevcut gizli alanları.

## Tasarım

### 1. Site başına indirme tarifi (strategy)

Her `SITE_CONFIG`'e opsiyonel `buildRequest(element)` eklenir:

- Bir istek tarifi döner: `{ url, method, body }`
- Ya da `null` döner → **eski `el.click()` yoluna düşülür**

Bu sayede SGK bugün sessizleşir; GİB ve E-Beyanname bugünkü davranışını korur.
Portallar erişilebilir olduğunda onların tarifi de aynı yöntemle çıkarılıp eklenir.

### 2. SGK tarifi

`onclick` içinden `islem('TD','NNNNNN-YYYY-A')` parse edilir (referans no örnektir).
`EkForm` → `tip` eşlemesi:

| EkForm | tip |
|--------|-----|
| TD  | tahakkukonayliFisTahakkukPdf |
| HD  | tahakkukonayliFisHizmetPdf |
| SHD | tahakkukonayliFisUcretGizliHizmetPdf |

**Alan isimleri tahmin edilmez.** `#bildirgeRefNoId`, `#tipId`, `#downloadId`
elemanlarının `.name` değerleri sayfadan okunur. Formun mevcut tüm alanları
`new FormData(form)` ile kopyalanır, sadece bu üç alan override edilir.

**Sayfadaki form değiştirilmez** — kopya `URLSearchParams` üzerinde çalışılır.
Böylece kullanıcı aynı anda sayfayla etkileşse bile durum bozulmaz.

### 3. Veri akışı

```
content.js: buildRequest(el) -> {url, method, body}
          -> fetch(url, {method, body, credentials:'include'})
          -> HTTP durumu + content-type doğrula
          -> blob -> FileReader -> data URL
          -> background: {action:'saveFile', dataUrl, filename, basePath, folder}
background.js: chrome.downloads.download({url: dataUrl, filename: path})
```

Hiçbir aşamada pencere/sekme yaratılmaz.

### 4. Dosya adlandırma

Öncelik sırası:
1. Sunucunun `Content-Disposition` başlığındaki `filename` (RFC 5987 `filename*` dahil)
2. Fallback: `{docType}_{fileType}.pdf` (ör. `2025-10_Tahakkuk.pdf`)

Dosya adı sanitize edilir (`\ / : * ? " < > |` → `_`, max 120 karakter).
Klasörleme mantığı değişmez: `basePath/docType/dosya.pdf`.

### 5. Hata yönetimi (mevcut hatanın düzeltilmesi)

**Mevcut kod yalnızca `.click()` istisna fırlattı mı diye bakıyor.** Sunucu 503
dönse bile log `✓ başarılı` yazıyor — yani rapor yanıltıcı.

Fetch ile gerçek durum görülür. Başarısızlık sayılan durumlar:

- `resp.ok === false` (HTTP 4xx/5xx) → `HTTP 503` gibi
- `content-type` PDF değil (hata sayfası HTML döner)
- Blob boyutu 1000 byte altı (boş/hata yanıtı)
- `chrome.downloads.download` hatası

Her başarısızlık gerçek sebebiyle loglanır.

### 6. Hız ve nezaket

Pencere maliyeti kalktığı için beklemeler kısalabilir. Ancak oturum başındaki 503
tecrübesi nedeniyle temkinli davranılır:

- Normal: dosyalar arası `800ms`
- Sunucu `503` veya `429` dönerse: `slowMode` açılır, bekleme `8000ms`'e çıkar
- Başarılı bir istek `slowMode`'u kapatır

### 7. Değişmeyenler

Durdur butonu (sayfa içi overlay), klasör yapısı, log raporu, popup akışı ve
tıklama fallback'i aynı kalır. Sadece "tıkla" adımı "istek gönder"e dönüşür.

## Riskler

| Risk | Değerlendirme |
|------|---------------|
| Büyük PDF'lerde data URL limiti | Beyanname/tahakkuk PDF'leri küçük (~50-500KB). Aşılırsa artık **görünür hata** verir, sessizce kaybolmaz. |
| SGK form alan isimlerini değiştirirse | `buildRequest` `null` döner → otomatik olarak tıklama yöntemine düşer, kırılmaz. |
| GİB/E-Beyanname tarifi henüz yok | Kasıtlı. Bugünkü davranışlarını aynen korurlar. |

## Doğrulama

Otomatik test mümkün değil — canlı SGK oturumu gerekiyor. Manuel kabul kriterleri:

1. 2-3 belgelik seçimle indirme başlatılır
2. Başka uygulamaya geçilir → **Chrome öne gelmemeli**
3. Dosyalar doğru klasöre inmeli
4. Log raporu gerçeği yansıtmalı (başarısız varsa sebebiyle görünmeli)
