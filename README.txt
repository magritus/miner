================================================================================
                    MINER - TOPLU PDF INDIRICI
                         Versiyon 2.0
================================================================================

TANIM
-----
Miner, muhasebe ve mali musavirlik ofisleri icin gelistirilmis bir Chrome
eklentisidir. GIB, SGK ve E-Beyanname portallarindan toplu PDF indirme
islemlerini otomatiklestirir ve dosyalari otomatik klasorler.


SURUM 2.0'DA NE DEGISTI
-----------------------
1. SESSIZ INDIRME (ana ozellik)

   Eski surum sayfadaki PDF ikonuna TIKLIYORDU. Portallar belgeyi yeni
   pencerede actigi icin tarayici her dosyada pencere yaratiyor, isletim
   sistemi de o pencereyi one getiriyordu. Yani indirme bitene kadar
   bilgisayari kullanmak mumkun degildi.

   Artik Miner tiklamiyor; belgeyi getiren istegi KENDISI gonderiyor,
   PDF'i bellege alip diske yaziyor. Pencere hic yaratilmadigi icin odak
   da calinmiyor. Indirme sirasinda baska uygulamalara gecebilirsiniz.

2. RAPOR ARTIK DOGRUYU SOYLUYOR

   Eski surum sadece "tiklama hata verdi mi" diye bakiyordu. Sunucu hata
   dondurse, dosya hic inmese bile rapora "basarili" yaziyordu.

   Gercek bir olcum: bir calismada rapor "50/50 basarili" dedi, diskte
   28 PDF vardi. 22 belge inmemisti ama basarili gorunuyordu.

   Yeni surum sunucunun cevabini dogruluyor. Rapor uc durumu ayiriyor:
     - Dogrulanmis   : PDF gercekten indi
     - Dogrulanamayan: istek gonderildi, sonucu bilinmiyor (yedek yontem)
     - Basarisiz     : gercek sebebiyle (HTTP 503, PDF degil, vb.)

3. MUKERRER INDIRME DUZELTILDI
   Eklenti indirme komutunu iki kez gonderiyordu; her belge iki kez
   iniyordu. Duzeltildi.

4. SAYFA ICI DURDUR BUTONU
   Indirme baslayinca sayfanin sag ustunde kirmizi "Miner'i Durdur"
   butonu cikiyor. Indirme boyunca erisilebilir kaliyor.

5. DIGER
   - S.Hizmet belgeleri artik indirilmiyor (ucret bilgisi icermiyor)
   - Sunucu yogunsa tempo otomatik dusuyor, duzelince geri cikiyor
   - Klasor/dosya adlandirma hatasi duzeltildi
   - Firma adi okunamayan satirlar VKN'ye gore ayri klasorlere gidiyor


DESTEKLENEN SITELER
-------------------
1. SGK E-Bildirge          - istegi dogrudan kurar, hic tiklamaz  [DOGRULANDI]
2. E-Beyanname Portali     - istegi dogrudan kurar, hic tiklamaz  [TEST EDILMEDI]
3. GIB Internet Vergi Dairesi - tiklar ama pencere actirmaz       [TEST EDILMEDI]

E-Beyanname ve GIB, sunucularina erisilemeyen bir donemde yazildigi icin
canli ortamda henuz dogrulanmadi. Bir sitede sessiz yontem calismazsa
eklenti OTOMATIK olarak eski tiklama yontemine duser: belge kaybi olmaz,
sadece pencere acilir. Bu gecis rapora yazilir.


KURULUM
-------
1. ZIP dosyasini bir klasore cikarin
2. Chrome'da "chrome://extensions/" adresine gidin
3. Sag ustten "Gelistirici modu"nu acin
4. "Paketlenmemis ogeyi yukle" - cikardiginiz klasoru secin

ONEMLI - GUNCELLEME YAPTIYSANIZ:
Eklentiyi chrome://extensions/ uzerinden RELOAD edin VE acik portal
sekmesini YENILEYIN. Ikisi de gerekli.


KULLANIM
--------
1. Desteklenen sitelerde belgelerin listelendigi sayfayi acin
2. Miner ikonuna tiklayin - sayfa taranir
3. Indirmek istediklerinizi secin (varsayilan: hepsi)
4. Hedef klasor yazin (ornek: Musteriler/2026)
5. "Download Selected" butonuna tiklayin

Indirme sirasinda baska uygulamalara gecebilirsiniz.
Durdurmak icin sayfadaki kirmizi "Miner'i Durdur" butonunu kullanin.


KLASOR YAPISI
-------------
SGK:                        E-Beyanname:
  HedefKlasor/                HedefKlasor/
  +-- 2025-10/                +-- ABC LTD STI/
  |   +-- tahakkuk.pdf        |   +-- 09-2025/
  |   +-- hizmet.pdf          |       +-- beyanname.pdf
  +-- 2025-11/                |       +-- tahakkuk.pdf
      +-- tahakkuk.pdf        +-- XYZ AS/
                                  +-- 09-2025/
GIB:                                  +-- beyanname.pdf
  HedefKlasor/
  +-- KDV1/
  +-- MUHSGK/

Firma adi okunamazsa klasor "VKN_1234567890" seklinde acilir.


LOG DOSYASI
-----------
Her indirmenin sonunda hedef klasore su dosya yazilir:
  miner_log_YYYY-MM-DD_HH-MM-SS.txt

Icerik: hangi belge nereye indi, hangileri basarisiz oldu ve NEDEN.

"Dogrulanamayan" satiri gorurseniz o belgeler yedek yontemle
gonderilmistir; klasorleri gozle kontrol edin.


SORUN GIDERME
-------------
1. Dosya bulunamadi
   Sayfanin tamamen yuklenmesini bekleyin, yenileyip tekrar deneyin.

2. Dosyalar inmiyor
   Chrome ayarlarinda "Her indirmeden once sor" kapali olmali.

3. Hala pencere aciliyor / odak caliniyor
   Eklentiyi reload edin VE sayfayi yenileyin.

4. Log'da "inject.js yanit vermedi" yaziyor
   Ayni sekilde: reload + sayfa yenileme.

5. "Extension context invalidated"
   Eklenti indirme sirasinda guncellendi. Sayfayi yenileyin.

6. Rapor "dogrulanamayan" diyor
   Sessiz yontem o sitede calismamis, yedege dusulmus.
   Klasorleri kontrol edin.

NOT: Sunucu kaynakli hatalar (HTTP 503, "SELECT permission denied" gibi)
portalin kendi arizasidir, eklentiyle ilgisi yoktur. Rapor bunlari artik
acikca yazar.


TEKNIK BILGILER
---------------
- Chrome Manifest Version: 3
- Minimum Chrome versiyonu: 111
- Gerekli izinler: activeTab, scripting, downloads, storage
- Ek sunucu/servis yok; her sey tarayicida, mevcut oturumunuzla calisir


DESTEK VE ILETISIM
------------------
  E-posta: nuh@ziyahanbasar.com

Lutfen su bilgileri belirtin:
- Hangi sitede sorun yasadiniz
- Hata mesaji varsa ekran goruntusu
- Log dosyasi (varsa)
- Chrome versiyonunuz ve isletim sisteminiz


YASAL UYARI
-----------
Bu eklenti sadece YETKILI OLDUGUNUZ hesaplardan belge indirmek icindir.
Kullanici, eklentiyi yasalara uygun sekilde kullanmakla yukumludur.


================================================================================
                    Miner v2.0 - 2026
                  nuh@ziyahanbasar.com
================================================================================
