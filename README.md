# Miner — Toplu PDF İndirici

Muhasebe ve mali müşavirlik ofisleri için Chrome eklentisi. GİB, SGK ve E-Beyanname
portallarından beyanname, tahakkuk ve hizmet belgelerini toplu indirir, otomatik klasörler.

**Sürüm 2.0** — belgeler artık arka planda **sessizce** iniyor: Chrome önünüze fırlamıyor,
indirme sürerken bilgisayarınızı normal kullanabiliyorsunuz.

---

## Sürüm 2.0'da ne değişti

### Sessiz indirme (ana özellik)

Eskiden Miner sayfadaki PDF ikonuna **tıklıyordu**. Portallar belgeyi yeni pencerede
açtığı için tarayıcı her dosyada pencere yaratıyor, işletim sistemi de o pencereyi öne
getiriyordu — yani indirme bitene kadar bilgisayarı kullanmak mümkün değildi.

Artık Miner tıklamıyor; belgeyi getiren isteği **kendisi gönderiyor**, PDF'i belleğe alıp
diske yazıyor. Pencere hiç yaratılmadığı için odak da çalınmıyor.

### Rapor artık doğruyu söylüyor

Eski sürüm yalnızca "tıklama hata verdi mi" diye bakıyordu. Sunucu 503 dönse, hata sayfası
gelse, dosya hiç inmese bile rapora **"✓ başarılı"** yazıyordu.

Gerçek bir ölçüm: bir çalışmada rapor `50/50 başarılı` dedi, diskte **28 PDF** vardı —
22 belge (%44) inmemişti ama başarılı görünüyordu.

Yeni sürüm HTTP durumunu, içerik tipini ve dosya boyutunu doğruluyor. Rapor üç durumu ayırıyor:

| Durum | Anlamı |
|---|---|
| **Doğrulanmış** | PDF gerçekten indi ve diske yazıldı |
| **Doğrulanamayan** | İstek gönderildi ama sonucu bilinmiyor (yedek yöntem) |
| **Başarısız** | Gerçek sebebiyle birlikte (`HTTP 503`, `PDF değil (text/html)` …) |

### Mükerrer indirme düzeltildi

Eklenti indirme komutunu iki kez gönderiyordu; her belge iki kez iniyordu. Düzeltildi.

### Sayfa içi "Durdur" butonu

İndirme başlayınca sayfanın sağ üstünde kırmızı bir **⏹ Miner'ı Durdur** butonu çıkıyor.
Eklenti penceresi (popup) odak değişiminde kapandığı için buton sayfaya taşındı — indirme
boyunca erişilebilir kalıyor.

### Diğer

- **S.Hizmet belgeleri artık indirilmiyor** (ücret bilgisi içermediği için gereksiz veri)
- Sunucu 503/429 dönerse tempo otomatik düşüyor (0,8 sn → 8 sn), düzelince geri çıkıyor
- Klasör ve dosya adlandırma hatası düzeltildi (her şey `download.pdf` oluyordu)
- Firma adı okunamayan satırlar artık tek klasöre yığılmıyor, VKN'ye göre ayrılıyor

---

## Desteklenen siteler

| Site | Yöntem | Durum |
|---|---|---|
| **SGK E-Bildirge** | İsteği doğrudan kurar, hiç tıklamaz | ✅ Doğrulandı |
| **E-Beyanname Portalı** | İsteği doğrudan kurar, hiç tıklamaz | ⏳ Test edilmedi |
| **GİB İnternet Vergi Dairesi** | Tıklar ama pencereyi açtırmaz, adresi yakalar | ⏳ Test edilmedi |

E-Beyanname ve GİB, sunucuları erişilebilir olmadığı dönemde yazıldığı için canlı ortamda
henüz doğrulanmadı. Bir sitede sessiz yöntem çalışmazsa eklenti **otomatik olarak eski
tıklama yöntemine düşer** — belge kaybı olmaz, sadece pencere açılır. Bu geçiş rapora yazılır.

---

## Kurulum

1. Bu depoyu indirin veya klonlayın
2. Chrome'da `chrome://extensions/` adresine gidin
3. Sağ üstten **Geliştirici modu**nu açın
4. **Paketlenmemiş öğeyi yükle** → klasörü seçin

> **Güncelleme yaptıysanız:** Eklentiyi `chrome://extensions/` üzerinden **reload** edin
> **ve** açık portal sekmesini **yenileyin**. İkisi de gerekli.

---

## Kullanım

1. Desteklenen sitelerden birinde belgelerin listelendiği sayfayı açın
2. Miner ikonuna tıklayın — sayfa taranır
3. İndirmek istediklerinizi seçin (varsayılan: hepsi)
4. **Hedef klasör** yazın (örn. `Musteriler/2026`)
5. **Download Selected**

İndirme sırasında başka uygulamalara geçebilirsiniz. Durdurmak isterseniz sayfadaki
kırmızı **⏹ Miner'ı Durdur** butonunu kullanın.

---

## Klasör yapısı

```
SGK:                          E-Beyanname:
HedefKlasor/                  HedefKlasor/
├── 2025-10/                  ├── ABC LTD ŞTİ/
│   ├── tahakkuk.pdf          │   └── 09-2025/
│   └── hizmet.pdf            │       ├── beyanname.pdf
└── 2025-11/                  │       └── tahakkuk.pdf
    └── tahakkuk.pdf          └── XYZ A.Ş./
                                  └── 09-2025/
GİB:                                  └── beyanname.pdf
HedefKlasor/
├── KDV1/
└── MUHSGK/
```

Firma adı okunamazsa klasör `VKN_1234567890` şeklinde açılır — belgeler karışmaz.

---

## Log dosyası

Her indirmenin sonunda hedef klasöre `miner_log_YYYY-MM-DD_HH-MM-SS.txt` yazılır:
hangi belge nereye indi, hangileri başarısız oldu ve **neden**.

`Doğrulanamayan` satırı görürseniz o belgeler yedek yöntemle gönderilmiştir; klasörleri
gözle kontrol edin.

---

## Sorun giderme

| Belirti | Çözüm |
|---|---|
| Dosya bulunamadı | Sayfanın tamamen yüklenmesini bekleyin, yenileyip tekrar deneyin |
| Dosyalar inmiyor | Chrome ayarlarında "Her indirmeden önce sor" kapalı olmalı |
| Hâlâ pencere açılıyor | Eklentiyi reload edin **ve sayfayı yenileyin** |
| Log'da `inject.js yanıt vermedi` | Aynı şekilde: reload + sayfa yenileme |
| `Extension context invalidated` | Eklenti indirme sırasında güncellendi; sayfayı yenileyin |
| Rapor "doğrulanamayan" diyor | Sessiz yöntem o sitede çalışmamış, yedeğe düşülmüş. Klasörleri kontrol edin |

Sunucu kaynaklı hatalar (`HTTP 503`, `SELECT permission denied` gibi) portalın kendi
arızasıdır, eklentiyle ilgisi yoktur — rapor bunları artık açıkça yazar.

---

## Teknik

- Chrome Manifest V3, minimum Chrome 111 (`world: "MAIN"` gereksinimi)
- İzinler: `activeTab`, `scripting`, `downloads`, `storage`
- Ek sunucu/servis yok; her şey tarayıcıda, mevcut oturumunuzla çalışır
- Tasarım notları: [`docs/superpowers/specs/`](docs/superpowers/specs/)

---

## Yasal uyarı

Bu eklenti yalnızca **yetkili olduğunuz** hesaplardan belge indirmek içindir.
Kullanıcı, eklentiyi yasalara uygun kullanmakla yükümlüdür.

---

**Destek:** nuh@ziyahanbasar.com
(hangi site, hata mesajı/ekran görüntüsü, Chrome sürümü, işletim sistemi)
