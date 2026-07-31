// Aynı frame'e ikinci kez enjekte edilirse (popup fallback veya reload) tekrar çalışmasın
if (window.__minerContentLoaded) {
    console.log("[Miner] content.js bu frame'de zaten yüklü, tekrar çalıştırılmıyor.");
} else {
window.__minerContentLoaded = true;

// ============ SİTE KONFİGÜRASYONLARI ============
const SITE_CONFIGS = {
    // GİB İnternet Vergi Dairesi
    gib: {
        name: "GİB Beyanname",
        // GİB'in indirme adresini (beyannameOid + token) sayfanın kendi JS'i tıklama
        // anında üretiyor; dışarıdan kuramayız. Bu yüzden SGK'daki gibi buildRequest
        // yazamıyoruz. Bunun yerine tıklıyoruz ama inject.js window.open'ı yakalayıp
        // pencereyi AÇTIRMIYOR, sadece adresi bize veriyor -> odak çalınmıyor.
        captureOnClick: true,
        match: () => document.querySelector('img[src*="pdfb.gif"]') || document.querySelector('img[title="Beyanname Görüntüle"]'),
        getTargets: () => {
            const byTitle = Array.from(document.querySelectorAll('img[title="Beyanname Görüntüle"]'));
            const bySrc = Array.from(document.querySelectorAll('img[src*="pdfb.gif"]'));
            return [...new Set([...byTitle, ...bySrc])];
        },
        getDocType: (element) => {
            try {
                let row = element.closest('tr');
                if (!row) return "Others";
                const cells = Array.from(row.querySelectorAll('td'));
                for (const cell of cells) {
                    const text = cell.innerText.trim();
                    const match = text.match(/^([A-Z0-9]+)_\d+(-\d+)?$/) || text.match(/^([A-Z0-9]+)_\d+/);
                    if (match) return match[1];
                }
            } catch (e) { }
            return "Others";
        }
    },

    // SGK E-Bildirge
    sgk: {
        name: "SGK E-Bildirge",
        match: () => document.querySelector('img[src*="pdf_dwn_icon.png"]'),
        getTargets: () => {
            // Sadece download ikonlarını al: TD (Tahakkuk) + HD (Hizmet).
            // SHD (S.Hizmet) KASITLI OLARAK DIŞARIDA: ücret bilgisi içermiyor, işe yaramıyor.
            // !!! popup.js icindeki sgkTargets secicisi ile BIREBIR AYNI kalmali;
            // aksi halde liste ile indirme sirasi kayar ve yanlis belge iner.
            const links = Array.from(document.querySelectorAll('a[onclick*="islem(\'TD\'"], a[onclick*="islem(\'HD\'"]'));
            return links;
        },
        getDocType: (element) => {
            try {
                // Dönem bilgisini al (satırdaki ilk td) - klasör adı bu olacak
                const row = element.closest('tr');
                if (row) {
                    const firstCell = row.querySelector('td');
                    if (firstCell) {
                        const period = firstCell.innerText.trim().replace('/', '-').replace(' ', ''); // 2025/10 -> 2025-10
                        return period;
                    }
                }
            } catch (e) { }
            return "Others";
        },
        // Dosya tipi (dosya adına eklenecek)
        getFileType: (element) => {
            const onclick = element.getAttribute('onclick') || '';
            if (onclick.includes("'TD'")) return "Tahakkuk";
            if (onclick.includes("'HD'")) return "Hizmet";
            if (onclick.includes("'SHD'")) return "SHizmet";
            return "Belge";
        },
        // Tıklamak yerine isteği doğrudan kurar -> pencere açılmaz, odak çalınmaz.
        // Sayfanın islem() fonksiyonunun yaptığı POST'un birebir aynısı.
        // Kuramazsa null döner ve eski tıklama yöntemine düşülür.
        buildRequest: (element) => {
            try {
                const onclick = element.getAttribute('onclick') || '';
                const m = onclick.match(/islem\(\s*'([A-Z]+)'\s*,\s*'([^']+)'\s*\)/);
                if (!m) return null;

                // Sadece indirme varyantları (görüntüleme varyantları popup açıyor)
                const TIP_MAP = {
                    TD: 'tahakkukonayliFisTahakkukPdf',
                    HD: 'tahakkukonayliFisHizmetPdf',
                    SHD: 'tahakkukonayliFisUcretGizliHizmetPdf'
                };
                const tip = TIP_MAP[m[1]];
                if (!tip) return null;

                // Sayfa JS'i formu "pdfFormId" ile çağırıyor, DOM'da adı "pdfGosterimForm".
                // İkisini de deniyoruz ki biri değişirse kırılmasın.
                const form = document.querySelector('form[name="pdfGosterimForm"]')
                    || document.querySelector('form#pdfFormId');
                const refInput = document.getElementById('bildirgeRefNoId');
                const tipInput = document.getElementById('tipId');
                const dlInput = document.getElementById('downloadId');
                if (!form || !refInput || !tipInput || !dlInput) return null;
                if (!refInput.name || !tipInput.name || !dlInput.name) return null;

                // Sayfadaki formu DEĞİŞTİRMEDEN mevcut alanları kopyala,
                // sadece islem()'in set ettiği 3 alanı override et.
                const params = new URLSearchParams();
                for (const [key, value] of new FormData(form).entries()) {
                    if (typeof value === 'string') params.set(key, value);
                }
                params.set(refInput.name, m[2]);
                params.set(tipInput.name, tip);
                params.set(dlInput.name, 'true');

                return { url: form.action, method: 'POST', body: params };
            } catch (e) {
                console.error("[Miner] buildRequest error:", e);
                return null;
            }
        }
    },

    // E-Beyanname Portalı
    ebeyanname: {
        name: "E-Beyanname Portal",
        // GİB ile aynı VEDOP kalıbı: beyannameGoruntule() adresi TOKEN + beyannameOid
        // ile tıklama anında kuruyor ve callMenuUrlPopUp ile açıyor. Dışarıdan
        // kuramayız; window.open'ı yakalayıp pencereyi açtırmadan adresi alıyoruz.
        // Yakalama tutmazsa otomatik olarak eski tıklama yöntemine düşülür.
        captureOnClick: true,
        match: () => document.querySelector('img[src*="pdf_b.gif"]') || document.querySelector('img[src*="pdf_t.gif"]'),
        getTargets: () => {
            // Satır bazlı sıralama: Her şirket için önce beyanname sonra tahakkuk
            // DOM sırasına göre al (satır satır ilerler)
            const allPdfIcons = Array.from(document.querySelectorAll('img[src*="pdf_b.gif"], img[src*="pdf_t.gif"]'));
            return allPdfIcons;
        },
        getDocType: (element) => {
            // Klasör yapısı: Firma/Dönem
            // PDF ikonları iç içe tabloda, ana satırı bulmak için id="row..." veya class="blAG" ara
            try {
                // Ana satırı bul (iç tablonun TR'si değil, dış TR)
                const row = element.closest('tr[id^="row"]') || element.closest('tr.blAG');
                if (row) {
                    // Sadece doğrudan çocuk TD'leri al (iç tablodakileri değil)
                    const cells = row.querySelectorAll(':scope > td');
                    let firma = "Firma";
                    let donem = "Diger";

                    // Sütun 3: Firma adı (title attribute'da tam unvan var)
                    if (cells[3]) {
                        // Önce title attribute'a bak (tam unvan), yoksa textContent
                        const firmaText = cells[3].getAttribute('title') || cells[3].textContent.trim();
                        if (firmaText && firmaText.length > 0) {
                            firma = firmaText.replace(/[\\/:*?"<>|]/g, '_').substring(0, 50);
                        }
                    }

                    // Sütun 5: Vergilendirme dönemi - "09/2025-09/2025" formatı
                    // İlk kısmı al: "09/2025"
                    if (cells[5]) {
                        const donemText = cells[5].textContent.trim();
                        if (donemText && donemText.length > 0) {
                            // "-" ile ayrılmış ise ilk kısmı al (başlangıç dönemi)
                            const parts = donemText.split('-');
                            let donemPart = parts[0].trim(); // "09/2025"
                            // "/" -> "-" dönüştür
                            donem = donemPart.replace('/', '-'); // "09-2025"
                        }
                    }

                    console.log("[Miner] Firma:", firma, "Dönem:", donem);
                    return `${firma}/${donem}`;
                }
            } catch (e) {
                console.error("[Miner] getDocType error:", e);
            }
            return "Others";
        },
        // Dosya adına eklenecek tür (Beyanname/Tahakkuk)
        getFileType: (element) => {
            const src = element.getAttribute('src') || '';
            if (src.includes('pdf_b.gif')) return "Beyanname";
            if (src.includes('pdf_t.gif')) return "Tahakkuk";
            return "Belge";
        },
        // Beyanname türü (KDV1, MUHSGK vb.) - Sütun 1
        getBeyannameType: (element) => {
            try {
                const row = element.closest('tr');
                if (row) {
                    const cells = row.querySelectorAll('td');
                    if (cells[1]) {
                        return cells[1].innerText.trim();
                    }
                }
            } catch (e) { }
            return "";
        }
    }
};

// Aktif site konfigürasyonunu tespit et
function detectSite() {
    for (const [key, config] of Object.entries(SITE_CONFIGS)) {
        if (config.match()) {
            console.log("[Miner] Site detected:", config.name);
            return config;
        }
    }
    console.log("[Miner] No matching site config, using default (GİB)");
    return SITE_CONFIGS.gib;
}

function getTargets() {
    const config = detectSite();
    return config.getTargets();
}

function findDocType(element) {
    const config = detectSite();
    return config.getDocType(element);
}

// Eklenti reload/update edildiğinde bu sayfadaki eski content.js bağlantısı ölür.
// chrome.runtime.id o an undefined olur; sendMessage çağırmadan önce bunu kontrol ediyoruz.
function isExtensionContextValid() {
    return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
}

function safeSendMessage(message, callback) {
    if (!isExtensionContextValid()) {
        console.warn("[Miner] Extension context invalidated, mesaj gönderilmedi. Sayfayı yenileyin.");
        return;
    }
    try {
        chrome.runtime.sendMessage(message, callback);
    } catch (e) {
        console.warn("[Miner] sendMessage başarısız (context invalidated?):", e.message);
    }
}

function log(msg) {
    console.log("[Miner] " + msg);
    safeSendMessage({ action: "updateStatus", message: msg });
}

function getTimestamp() {
    const now = new Date();
    return now.toLocaleString('tr-TR');
}

// ============ SESSİZ İNDİRME (FETCH) YARDIMCILARI ============
// Tıklamak yerine isteği kendimiz gönderiyoruz; böylece tarayıcı yeni
// pencere/sekme yaratmıyor ve odak çalınmıyor.

function sanitizeFilename(name) {
    return String(name).replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().substring(0, 120);
}

// Sunucunun önerdiği dosya adını Content-Disposition başlığından çıkar
function filenameFromDisposition(disposition) {
    if (!disposition) return null;
    let m = disposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
    if (m) {
        try { return sanitizeFilename(decodeURIComponent(m[1])); } catch (e) { /* bozuk encoding */ }
    }
    m = disposition.match(/filename\s*=\s*"([^"]+)"/i) || disposition.match(/filename\s*=\s*([^;]+)/i);
    if (m) return sanitizeFilename(m[1]);
    return null;
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Dosya belleğe okunamadı"));
        reader.readAsDataURL(blob);
    });
}

// Background'a gönderip diske yazdır; sonucu bekle
function saveFileViaBackground(payload) {
    return new Promise((resolve) => {
        if (!isExtensionContextValid()) {
            resolve({ ok: false, error: "Eklenti bağlantısı koptu" });
            return;
        }
        try {
            chrome.runtime.sendMessage({ action: "saveFile", ...payload }, (resp) => {
                if (chrome.runtime.lastError) {
                    resolve({ ok: false, error: chrome.runtime.lastError.message });
                    return;
                }
                resolve(resp || { ok: false, error: "Background yanıt vermedi" });
            });
        } catch (e) {
            resolve({ ok: false, error: e.message });
        }
    });
}

// Elemana tıkla ama açılacak pencereyi/form gönderimini inject.js engellesin;
// sadece isteğin tarifini al. Adresi kendi JS'i üreten siteler için (GİB, E-Beyanname).
// { url, method, body } döner - fetchPdfAndSave ile aynı biçim.
function captureRequestFromClick(el, timeoutMs) {
    return new Promise((resolve, reject) => {
        let bitti = false;
        let zamanlayici = null;

        const temizle = () => {
            window.removeEventListener('minerUrlCaptured', yakalandi);
            if (zamanlayici) clearTimeout(zamanlayici);
        };

        function yakalandi(e) {
            if (bitti) return;
            bitti = true;
            temizle();
            const d = e.detail || {};
            if (!d.url) {
                reject(new Error("Adres çözümlenemedi"));
                return;
            }
            // body string olarak geliyor; URLSearchParams'a çevirince fetch
            // Content-Type'ı (x-www-form-urlencoded) kendisi doğru ayarlıyor.
            resolve({
                url: d.url,
                method: d.method || 'GET',
                body: d.body ? new URLSearchParams(d.body) : undefined
            });
        }

        window.addEventListener('minerUrlCaptured', yakalandi);

        zamanlayici = setTimeout(() => {
            if (bitti) return;
            bitti = true;
            temizle();
            const hata = new Error(`İstek yakalanamadı (${timeoutMs}ms)`);
            hata.captureTimeout = true; // çağıran taraf eski yönteme düşsün
            reject(hata);
        }, timeoutMs);

        try {
            el.click();
        } catch (e) {
            if (!bitti) { bitti = true; temizle(); reject(new Error("Tıklama hatası: " + e.message)); }
        }
    });
}

// PDF'i belleğe indir ve diske yaz. { ok, error, status } döner.
async function fetchPdfAndSave(req, basePath, folder, fallbackName) {
    let resp;
    try {
        resp = await fetch(req.url, {
            method: req.method,
            body: req.body,
            credentials: 'include'
        });
    } catch (e) {
        return { ok: false, error: "Ağ hatası: " + e.message };
    }

    if (!resp.ok) {
        return { ok: false, error: `HTTP ${resp.status}`, status: resp.status };
    }

    const contentType = (resp.headers.get('content-type') || '').toLowerCase();
    const disposition = resp.headers.get('content-disposition');

    let blob;
    try {
        blob = await resp.blob();
    } catch (e) {
        return { ok: false, error: "Yanıt okunamadı: " + e.message };
    }

    // Hata sayfaları HTML döner; PDF beklerken HTML geldiyse bu bir başarısızlıktır
    if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) {
        return { ok: false, error: `PDF değil (${contentType || 'tip yok'})` };
    }
    if (blob.size < 1000) {
        return { ok: false, error: `Dosya çok küçük (${blob.size} byte)` };
    }

    const filename = filenameFromDisposition(disposition) || sanitizeFilename(fallbackName);

    let dataUrl;
    try {
        dataUrl = await blobToDataUrl(blob);
    } catch (e) {
        return { ok: false, error: e.message };
    }

    const saved = await saveFileViaBackground({ dataUrl, filename, basePath, folder });
    if (!saved.ok) {
        return { ok: false, error: saved.error || "Diske yazılamadı" };
    }
    return { ok: true };
}

// İndirme döngüsünün durumu (stop butonu bunu okuyup değiştirir)
const downloadState = {
    active: false,
    stopRequested: false,
    timerId: null
};

// ============ SAYFA İÇİ DURDUR BUTONU ============
// Popup, indirme sırasında pencere/sekme odağı değiştiği an Chrome tarafından
// otomatik kapatılabiliyor (bu yüzden butonu görmeye fırsat kalmıyordu).
// Bu yüzden Durdur butonunu popup yerine sayfanın kendisine, kalıcı olarak koyuyoruz.
const STOP_OVERLAY_ID = "miner-stop-overlay";

function requestStop() {
    if (downloadState.active) {
        downloadState.stopRequested = true;
        if (downloadState.timerId) {
            clearTimeout(downloadState.timerId);
            downloadState.timerId = null;
        }
        log("Durdurma talebi alındı, işlem sonlandırılıyor...");
    }
}

function showStopOverlay() {
    if (document.getElementById(STOP_OVERLAY_ID)) return;
    const btn = document.createElement("button");
    btn.id = STOP_OVERLAY_ID;
    btn.textContent = "⏹ Miner'ı Durdur";
    btn.style.cssText = "position:fixed; top:16px; right:16px; z-index:2147483647; " +
        "background:#e53935; color:#fff; border:none; border-radius:6px; " +
        "padding:12px 20px; font-size:14px; font-weight:bold; cursor:pointer; " +
        "box-shadow:0 2px 10px rgba(0,0,0,0.4); font-family:sans-serif;";
    btn.addEventListener("click", () => {
        requestStop();
        btn.textContent = "Durduruluyor...";
        btn.disabled = true;
        btn.style.opacity = "0.6";
    });
    (document.body || document.documentElement).appendChild(btn);
}

function hideStopOverlay() {
    const btn = document.getElementById(STOP_OVERLAY_ID);
    if (btn) btn.remove();
}

// inject.js'i main world'e enjekte et (window.open intercept için).
// Content script'ler chrome.scripting API'sini çağıramaz; script tag ekleyerek
// main world'de çalıştırmak standart yöntemdir.
function injectMainWorldScript() {
    if (document.getElementById("miner-inject-script")) return;
    const script = document.createElement("script");
    script.id = "miner-inject-script";
    script.src = chrome.runtime.getURL("inject.js");
    script.onload = function () { this.remove(); };
    (document.head || document.documentElement).appendChild(script);
}
injectMainWorldScript();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "scan") {
        const targets = getTargets();
        const items = targets.map(t => ({ title: t.title, type: findDocType(t) }));
        sendResponse({ count: targets.length, items: items });
    }
    else if (request.action === "stop") {
        requestStop();
        sendResponse({ stopped: true });
    }
    else if (request.action === "download") {
        // Zaten bir indirme sürüyorsa ikinciyi başlatma (mükerrer indirmeye karşı emniyet)
        if (downloadState.active) {
            console.warn("[Miner] Zaten bir indirme sürüyor, yeni istek yok sayıldı.");
            sendResponse({ started: false, reason: "already_running" });
            return;
        }

        // ÖNEMLİ: Hemen yanıt ver. Yanıt vermezsek Chrome kanalı kapatıp
        // popup'ta lastError üretir; popup bunu hata sanıp indirmeyi TEKRAR
        // başlatır ve her dosya iki kez iner.
        sendResponse({ started: true });

        log("Download başladı");

        const config = detectSite();
        const allTargets = getTargets();
        let targets = [];
        if (request.indices && Array.isArray(request.indices)) {
            targets = request.indices.map(i => allTargets[i]).filter(t => t !== undefined);
        } else {
            targets = allTargets;
        }

        log(`${targets.length} dosya indirilecek (${config.name})`);

        if (targets.length === 0) {
            safeSendMessage({ action: "updateStatus", message: "Dosya bulunamadı!", completed: true });
            return;
        }

        const basePath = request.basePath || "MinerDownloads";
        let index = 0;

        downloadState.active = true;
        downloadState.stopRequested = false;
        downloadState.timerId = null;

        // Odak koruması SADECE tıklama yoluna düşüldüğünde açılır (bkz. enableFocusGuardOnce).
        // Fetch yolunda hiç pencere açılmadığı için korumaya gerek yok; açık kalsaydı
        // kullanıcının kendi açtığı sekmeyi de geri çekerdi.
        let focusGuardOn = false;
        function enableFocusGuardOnce() {
            if (focusGuardOn) return;
            focusGuardOn = true;
            safeSendMessage({ action: "startFocusGuard" });
            window.postMessage({ type: "MINER_ENABLE_FOCUS_GUARD" }, window.location.origin);
        }

        // Sayfa içi Durdur butonunu göster (popup kapansa bile burada kalır)
        showStopOverlay();

        // Sessiz (fetch) yol için bekleme süreleri (ms).
        // Pencere açma maliyeti olmadığı için kısa; ama sunucuyu zorlamamak için sıfır değil.
        const FETCH_DELAY = 800;
        const SLOW_FETCH_DELAY = 8000; // 503/429 sonrası nezaket modu
        const CAPTURE_TIMEOUT = 5000;  // İsteğin yakalanması için bekleme süresi
        let slowMode = false;
        let captureDisabled = false;   // yakalama tutmazsa eski yönteme kalıcı geçiş

        // GİB gibi adresi tıklama anında üreten siteler: inject.js window.open'ı
        // yakalasın, pencere açılmasın. Sadece bu modda gerekli.
        if (config.captureOnClick) {
            window.postMessage({ type: "MINER_ENABLE_CAPTURE" }, window.location.origin);
        }

        // Site'e özel bekleme süreleri (ms)
        const isEbeyanname = config.name === "E-Beyanname Portal";
        const clickDelay = isEbeyanname ? 50 : 100;        // Tıklama öncesi
        const afterClickDelay = isEbeyanname ? 200 : 1000; // Tıklama sonrası
        const betweenDelay = isEbeyanname ? 1500 : (request.delay || 2000); // Dosyalar arası (E-Beyanname 1.5sn)

        // Log kayıtları
        const downloadLog = [];
        const startTime = getTimestamp();
        const totalOnPage = allTargets.length;
        const selectedCount = targets.length;
        let successCount = 0;
        let failCount = 0;
        let unverifiedCount = 0; // tıklama yolu: sonucu bilemediklerimiz
        const downloadedItems = [];
        const failedItems = [];
        const unverifiedItems = [];

        // Tüm hedeflerin listesini oluştur
        const allTargetInfo = targets.map((t, i) => ({
            index: i,
            docType: findDocType(t),
            status: 'bekliyor'
        }));

        downloadLog.push(`════════════════════════════════════════════════════════`);
        downloadLog.push(`                  MINER İNDİRME RAPORU`);
        downloadLog.push(`════════════════════════════════════════════════════════`);
        downloadLog.push(``);
        downloadLog.push(`Tarih/Saat    : ${startTime}`);
        downloadLog.push(`Site Türü     : ${config.name}`);
        downloadLog.push(`Sayfa URL     : ${window.location.href}`);
        downloadLog.push(`Hedef Klasör  : ${basePath}`);
        downloadLog.push(``);
        downloadLog.push(`────────────────────────────────────────────────────────`);
        downloadLog.push(`                      ÖZET BİLGİLER`);
        downloadLog.push(`────────────────────────────────────────────────────────`);
        downloadLog.push(`Sayfadaki Toplam Link : ${totalOnPage}`);
        downloadLog.push(`Seçilen Link Sayısı   : ${selectedCount}`);
        downloadLog.push(``);
        downloadLog.push(`────────────────────────────────────────────────────────`);
        downloadLog.push(`                   İNDİRME LİSTESİ`);
        downloadLog.push(`────────────────────────────────────────────────────────`);

        function finishDownload(stoppedByUser) {
            // Uçuştaki bir istek durdurma sonrası dönerse iki kez çağrılabilir; rapor tek olsun
            if (!downloadState.active) return;

            // İndirme bitti (veya durduruldu), özet raporu oluştur
            const endTime = getTimestamp();

            downloadState.active = false;
            downloadState.stopRequested = false;
            downloadState.timerId = null;

            // Odak koruması sadece indirme sürerken açık kalmalı
            safeSendMessage({ action: "stopFocusGuard" });
            window.postMessage({ type: "MINER_DISABLE_FOCUS_GUARD" }, window.location.origin);
            // Yakalama modu kapatılmazsa kullanıcının kendi tıkladığı linkler de açılmaz!
            window.postMessage({ type: "MINER_DISABLE_CAPTURE" }, window.location.origin);
            hideStopOverlay();

            downloadLog.push(``);
            downloadLog.push(`────────────────────────────────────────────────────────`);
            downloadLog.push(`                      SONUÇ RAPORU`);
            downloadLog.push(`────────────────────────────────────────────────────────`);
            if (stoppedByUser) {
                downloadLog.push(`Durum                 : KULLANICI TARAFINDAN DURDURULDU`);
            }
            downloadLog.push(`Bitiş Zamanı          : ${endTime}`);
            downloadLog.push(`Doğrulanmış İndirme   : ${successCount} / ${selectedCount}`);
            downloadLog.push(`Başarısız             : ${failCount}`);
            if (unverifiedCount > 0) {
                downloadLog.push(`Doğrulanamayan        : ${unverifiedCount}  <-- DİKKAT`);
                downloadLog.push(``);
                downloadLog.push(`  Bu belgeler klasik tıklama yöntemiyle gönderildi. Tarayıcı indirmeyi`);
                downloadLog.push(`  kendi yürüttüğü için sunucunun ne döndüğünü göremiyoruz: dosya inmemiş`);
                downloadLog.push(`  olabilir. Klasörleri kontrol edin.`);
            }
            if (stoppedByUser) {
                downloadLog.push(`İşlenmeyen (durduruldu): ${selectedCount - successCount - failCount}`);
            }
            downloadLog.push(``);

            if (downloadedItems.length > 0) {
                downloadLog.push(`✓ İNDİRİLEN DOSYALAR (${downloadedItems.length}):`);
                downloadedItems.forEach(item => {
                    downloadLog.push(`  • ${item}`);
                });
                downloadLog.push(``);
            }

            if (unverifiedItems.length > 0) {
                downloadLog.push(`? SONUCU DOĞRULANAMAYANLAR (${unverifiedItems.length}) - klasörleri kontrol edin:`);
                unverifiedItems.forEach(item => {
                    downloadLog.push(`  • ${item}`);
                });
                downloadLog.push(``);
            }

            if (failedItems.length > 0) {
                downloadLog.push(`✗ BAŞARISIZ OLANLAR (${failedItems.length}):`);
                failedItems.forEach(item => {
                    downloadLog.push(`  • ${item}`);
                });
                downloadLog.push(``);
            }

            downloadLog.push(`════════════════════════════════════════════════════════`);
            downloadLog.push(`                    RAPOR SONU`);
            downloadLog.push(`════════════════════════════════════════════════════════`);

            // Log dosyasını background'a gönder
            safeSendMessage({
                action: "saveLog",
                basePath: basePath,
                logContent: downloadLog.join('\n')
            });

            // Doğrulanamayanları ayrı göster; "başarılı" diye yutmak yanıltıcı olur.
            const ek = unverifiedCount > 0 ? `, ${unverifiedCount} doğrulanamadı` : '';
            const finalMessage = stoppedByUser
                ? `Durduruldu! (${successCount}/${selectedCount} doğrulandı${ek})`
                : `Tamamlandı! (${successCount}/${selectedCount} doğrulandı${ek})`;
            log(finalMessage);
            safeSendMessage({ action: "updateStatus", message: finalMessage, completed: true });
        }

        function processNext() {
            if (!isExtensionContextValid()) {
                console.warn("[Miner] Extension context invalidated, indirme durduruluyor. Sayfayı yenileyip tekrar deneyin.");
                downloadState.active = false;
                // Yakalama modu acik kalirsa kullanicinin kendi tikladigi linkler de
                // acilmaz. Sayfayi bu halde birakma.
                window.postMessage({ type: "MINER_DISABLE_CAPTURE" }, window.location.origin);
                window.postMessage({ type: "MINER_DISABLE_FOCUS_GUARD" }, window.location.origin);
                hideStopOverlay();
                return;
            }

            if (downloadState.stopRequested) {
                finishDownload(true);
                return;
            }

            if (index >= targets.length) {
                finishDownload(false);
                return;
            }

            const el = targets[index];
            const docType = findDocType(el);
            const timestamp = getTimestamp();
            const currentNum = index + 1;

            log(`İndiriliyor ${currentNum}/${targets.length} (${docType})`);

            el.style.border = "3px solid green";

            // Site için sessiz indirme tarifi var mı? Varsa hiç tıklamıyoruz.
            const req = config.buildRequest ? config.buildRequest(el) : null;

            if (req) {
                handleFetchItem(req, el, docType, timestamp, currentNum);
            } else if (config.captureOnClick && !captureDisabled) {
                handleCaptureItem(el, docType, timestamp, currentNum);
            } else {
                handleClickItem(el, docType, timestamp, currentNum);
            }
        }

        // Sonucu rapora işle.
        // unverified=true -> tıklama yolu: isteği tarayıcı yürüttüğü için sunucunun
        // ne döndüğünü BİLMİYORUZ. "Başarılı" demek yalan olur, ayrı sayıyoruz.
        function recordResult(ok, errMsg, docType, timestamp, currentNum, unverified) {
            const itemPath = `${basePath}/${docType}/`;
            if (ok && unverified) {
                unverifiedCount++;
                unverifiedItems.push(`[${currentNum}] ${docType}`);
                downloadLog.push(`[${timestamp}] ? ${currentNum}. ${docType} -> ${itemPath} (gönderildi, sonuç doğrulanamadı)`);
            } else if (ok) {
                successCount++;
                downloadedItems.push(`[${currentNum}] ${docType}`);
                downloadLog.push(`[${timestamp}] ✓ ${currentNum}. ${docType} -> ${itemPath}`);
            } else {
                failCount++;
                failedItems.push(`[${currentNum}] ${docType} (${errMsg || 'hata'})`);
                downloadLog.push(`[${timestamp}] ✗ ${currentNum}. ${docType} -> HATA: ${errMsg || 'bilinmiyor'}`);
            }
        }

        function scheduleNext(delay) {
            index++;
            if (downloadState.stopRequested) {
                finishDownload(true);
                return;
            }
            downloadState.timerId = setTimeout(processNext, delay);
        }

        // ---- Sessiz yol: isteği kendimiz gönder, pencere açılmaz ----
        function handleFetchItem(req, el, docType, timestamp, currentNum) {
            const fileType = config.getFileType ? config.getFileType(el) : "Belge";
            const fallbackName = `${docType}_${fileType}.pdf`;

            fetchPdfAndSave(req, basePath, docType, fallbackName)
                .then((result) => {
                    recordResult(result.ok, result.error, docType, timestamp, currentNum);
                    el.style.border = result.ok ? "" : "3px solid red";

                    // Sunucu zorlanıyorsa yavaşla, düzelirse normale dön
                    if (result.status === 503 || result.status === 429) {
                        if (!slowMode) log("Sunucu yoğun (503/429), tempo düşürülüyor...");
                        slowMode = true;
                    } else if (result.ok) {
                        slowMode = false;
                    }

                    scheduleNext(slowMode ? SLOW_FETCH_DELAY : FETCH_DELAY);
                })
                .catch((err) => {
                    recordResult(false, err.message, docType, timestamp, currentNum);
                    el.style.border = "3px solid red";
                    scheduleNext(slowMode ? SLOW_FETCH_DELAY : FETCH_DELAY);
                });
        }

        // ---- Sessiz yol 2 (GİB): tıkla ama pencereyi açtırma, isteği yakala ----
        function handleCaptureItem(el, docType, timestamp, currentNum) {
            const fileType = config.getFileType ? config.getFileType(el) : "Beyanname";
            const fallbackName = `${docType}_${fileType}_${currentNum}.pdf`;

            captureRequestFromClick(el, CAPTURE_TIMEOUT)
                .then((req) => fetchPdfAndSave(req, basePath, docType, fallbackName))
                .then((result) => {
                    recordResult(result.ok, result.error, docType, timestamp, currentNum);
                    el.style.border = result.ok ? "" : "3px solid red";

                    if (result.status === 503 || result.status === 429) {
                        if (!slowMode) log("Sunucu yoğun (503/429), tempo düşürülüyor...");
                        slowMode = true;
                    } else if (result.ok) {
                        slowMode = false;
                    }

                    scheduleNext(slowMode ? SLOW_FETCH_DELAY : FETCH_DELAY);
                })
                .catch((err) => {
                    // Yakalama tutmadıysa (site ne window.open ne form kullanıyor)
                    // bu siteyi eski yönteme devret. En kötü ihtimalle bugünkü davranış.
                    if (err.captureTimeout && !captureDisabled) {
                        captureDisabled = true;
                        log("Sessiz yakalama tutmadı, klasik yönteme geçiliyor.");
                        window.postMessage({ type: "MINER_DISABLE_CAPTURE" }, window.location.origin);
                        downloadLog.push(`[${timestamp}] ! Sessiz yakalama tutmadı -> klasik tıklama yöntemine geçildi`);
                        handleClickItem(el, docType, timestamp, currentNum);
                        return;
                    }
                    recordResult(false, err.message, docType, timestamp, currentNum);
                    el.style.border = "3px solid red";
                    scheduleNext(slowMode ? SLOW_FETCH_DELAY : FETCH_DELAY);
                });
        }

        // ---- Eski yol: tıklama (tarifi olmayan siteler için) ----
        function handleClickItem(el, docType, timestamp, currentNum) {
            enableFocusGuardOnce(); // bu yol pencere açtırıyor, koruma şimdi gerekli

            safeSendMessage({
                action: "setNextDownloadConfig",
                config: {
                    basePath: basePath,
                    folder: docType
                }
            }, () => {
                if (downloadState.stopRequested) {
                    finishDownload(true);
                    return;
                }

                // Config ayarlandı, şimdi tıkla
                downloadState.timerId = setTimeout(() => {
                    if (downloadState.stopRequested) {
                        finishDownload(true);
                        return;
                    }

                    let clickSuccess = false;
                    try {
                        el.click();
                        clickSuccess = true;
                    } catch(e) {
                        console.error("[Miner] Click error:", e);
                        clickSuccess = false;
                    }

                    // clickSuccess sadece "tıklama fırlatmadı" demek; sunucu 503 dönse
                    // veya hiç dosya inmese bile burada göremeyiz -> doğrulanmadı say.
                    recordResult(clickSuccess, "tıklama hatası", docType, timestamp, currentNum, true);

                    // Sonraki dosyaya geç
                    downloadState.timerId = setTimeout(() => {
                        el.style.border = clickSuccess ? "" : "3px solid red";
                        // Her 5 dosyada bir biraz daha bekle (E-Beyanname hariç)
                        const delay = isEbeyanname ? betweenDelay : (((index + 1) % 5 === 0) ? 5000 : betweenDelay);
                        scheduleNext(delay);
                    }, afterClickDelay);
                }, clickDelay);
            });
        }

        processNext();
    }
});

} // window.__minerContentLoaded guard sonu
