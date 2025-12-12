================================================================================
                    MINER - TOPLU PDF INDIRICI
                         Versiyon 1.1
================================================================================

TANIM
-----
Miner, muhasebe ve mali musavirlik ofisleri icin gelistirilmis bir Chrome
eklentisidir. GIB, SGK ve E-Beyanname portallarindan toplu PDF indirme
islemlerini otomatiklestirerek zaman kazandirir.


DESTEKLENEN SITELER
-------------------
1. GIB Internet Vergi Dairesi
   - Beyanname PDF'leri
   - Klasor yapisi: Beyanname turune gore (KDV1, MUHSGK, vb.)

2. SGK E-Bildirge
   - Tahakkuk, Hizmet, SHizmet belgeleri
   - Klasor yapisi: Doneme gore (2025-10, 2025-11, vb.)

3. E-Beyanname Portali
   - Beyanname ve Tahakkuk PDF'leri
   - Klasor yapisi: Firma/Donem (ABC LTD/09-2025)


KURULUM
-------
1. miner-extension.zip dosyasini bilgisayariniza indirin
2. ZIP dosyasini bir klasore cikarin
3. Chrome tarayicisini acin
4. Adres cubuguna "chrome://extensions/" yazin ve Enter'a basin
5. Sag ust koseden "Gelistirici modu"nu acin (toggle'i saga kaydin)
6. "Paketlenmemis ogeyi yukle" butonuna tiklayin
7. ZIP'ten cikardiginiz klasoru secin
8. Eklenti yuklendi! Adres cubugunun yaninda Miner ikonunu goreceksiniz


KULLANIM
--------
1. Desteklenen sitelerden birine gidin (GIB, SGK E-Bildirge, E-Beyanname)
2. Indirmek istediginiz belgelerin oldugu sayfayi acin
3. Chrome'da Miner eklenti ikonuna tiklayin
4. Eklenti sayfadaki indirilebilir dosyalari otomatik tarayacak
5. Indirmek istediginiz dosyalari secin (varsayilan: hepsi secili)
6. "Hedef Klasor" alanina indirme yolunu yazin (ornek: Musteriler/2025)
7. "Download Selected" butonuna tiklayin
8. Dosyalar otomatik olarak indirilecek ve klasorlenecek


KLASOR YAPISI
-------------
Indirilen dosyalar su sekilde organize edilir:

GIB:
  HedefKlasor/
  +-- KDV1/
  |   +-- beyanname1.pdf
  |   +-- beyanname2.pdf
  +-- MUHSGK/
      +-- beyanname3.pdf

SGK:
  HedefKlasor/
  +-- 2025-10/
  |   +-- tahakkuk.pdf
  |   +-- hizmet.pdf
  +-- 2025-11/
      +-- tahakkuk.pdf

E-Beyanname:
  HedefKlasor/
  +-- ABC SIRKETI LTD STI/
  |   +-- 09-2025/
  |       +-- beyanname.pdf
  |       +-- tahakkuk.pdf
  +-- XYZ ANONIM SIRKETI/
      +-- 09-2025/
          +-- beyanname.pdf


LOG DOSYASI
-----------
Her indirme isleminin sonunda otomatik olarak bir log dosyasi olusturulur:
- Dosya adi: miner_log_YYYY-MM-DD_HH-MM-SS.txt
- Konum: Hedef klasorun icinde
- Icerik: Indirilen dosyalar, basarisiz olanlar, ozet bilgiler


SORUN GIDERME
-------------
1. "Dosya bulunamadi" hatasi:
   - Sayfanin tamamen yuklenmesini bekleyin
   - Sayfayi yenileyip tekrar deneyin

2. Dosyalar inmiyor:
   - Chrome indirme ayarlarinizi kontrol edin
   - "Her indirmeden once sor" secenegi kapali olmali

3. Yanlis klasore iniyor:
   - Hedef klasor yolunu kontrol edin
   - Ozel karakterler kullanmayin (/, \, :, *, ?, ", <, >, |)

4. Eklenti calismiyor:
   - chrome://extensions/ adresinden eklentiyi devre disi birakip tekrar aktif edin
   - Tarayiciyi kapatip tekrar acin


TEKNIK BILGILER
---------------
- Chrome Manifest Version: 3
- Gerekli izinler: activeTab, scripting, downloads, storage
- Minimum Chrome versiyonu: 88+


DESTEK VE ILETISIM
------------------
Sorun, oneri veya sorulariniz icin:

  E-posta: nuh@ziyahanbasar.com

Lutfen e-postanizda su bilgileri belirtin:
- Hangi sitede sorun yasadiniz
- Hata mesaji varsa ekran goruntusu
- Chrome versiyonunuz
- Isletim sisteminiz (Windows/Mac)


YASAL UYARI
-----------
Bu eklenti sadece yetkili oldugunuz hesaplardan belge indirmek icindir.
Kullanici, eklentiyi yasalara uygun sekilde kullanmakla yukumludur.


================================================================================
                    Miner v1.1 - 2025
                  nuh@ziyahanbasar.com
================================================================================
