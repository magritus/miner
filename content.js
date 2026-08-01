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
        // Adresi kendimiz kurabiliyoruz -> hiç tıklamaya gerek yok (SGK gibi).
        // Sayfanın kendi kodu:
        //   getTOKEN()            -> document.getElementById('TOKEN').value
        //   beyannameGoruntule(oid) -> dispatch?cmd=IMAJ&subcmd=BEYANNAMEGORUNTULE
        //                              &TOKEN=..&beyannameOid=..&inline=true
        // TOKEN DOM'da bir elemanda durduğu için content script doğrudan okuyabiliyor.
        // Kuramazsak (token yok / onclick tanınmadı) null döner ve yakalama/tıklama
        // yoluna düşülür - bu yüzden captureOnClick yedek olarak açık kalıyor.
        captureOnClick: true,
        buildRequest: (element) => {
            try {
                const token = document.getElementById('TOKEN');
                if (!token || !token.value) return null;

                const onclick = element.getAttribute('onclick') || '';
                const tokenParam = '&TOKEN=' + encodeURIComponent(token.value);
                let params = null;

                // beyannameGoruntule(oid, arsivdenGoruntule, asAttachment)
                let m = onclick.match(/beyannameGoruntule\(\s*'([^']+)'\s*,\s*(true|false)\s*,/);
                if (m) {
                    // Arşiv kalıbını (getParameterForArsiv) bilmiyoruz -> yedeğe bırak
                    if (m[2] !== 'false') return null;
                    params = 'cmd=IMAJ&subcmd=BEYANNAMEGORUNTULE' + tokenParam
                        + '&beyannameOid=' + encodeURIComponent(m[1]);
                } else {
                    // tahakkukGoruntule(oid, tahakkukOid, arsivdenGoruntule, asAttachment)
                    m = onclick.match(/tahakkukGoruntule\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(true|false)\s*,/);
                    if (!m) return null;
                    if (m[3] !== 'false') return null;
                    params = 'cmd=IMAJ&subcmd=TAHAKKUKGORUNTULE' + tokenParam
                        + '&beyannameOid=' + encodeURIComponent(m[1])
                        + '&tahakkukOid=' + encodeURIComponent(m[2]);
                }

                const url = new URL('dispatch?' + params + '&inline=true', document.baseURI).href;
                return { url: url, method: 'GET' };
            } catch (e) {
                console.error("[Miner] ebeyanname buildRequest error:", e);
                return null;
            }
        },
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

                    // Firma adı okunamadıysa VKN/TCKN'ye düş (sütun 2).
                    // Aksi halde TÜM farklı firmalar tek bir "Firma" klasörüne yığılıyor
                    // ve hangi belgenin kime ait olduğu kayboluyor.
                    if (firma === "Firma") {
                        const vkn = cells[2] ? cells[2].textContent.trim().replace(/[\\/:*?"<>|]/g, '_') : '';
                        firma = vkn ? `VKN_${vkn}` : 'Bilinmeyen_Firma';
                        console.warn("[Miner] Firma adı okunamadı, klasör:", firma,
                            "| satır hücre sayısı:", cells.length,
                            "| tür:", cells[1] ? cells[1].textContent.trim() : '?');
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

// Yakalama modunu aç ve inject.js'in ONAYINI bekle.
// postMessage asenkron olduğu için onay beklemezsek ilk tıklama yakalama
// açılmadan gerçekleşir, kaçar ve yakalama kalıcı olarak devre dışı kalır.
// false dönerse inject.js sayfaya ulaşmamış demektir (CSP / eski Chrome / vs).
function enableCaptureMode(timeoutMs) {
    return new Promise((resolve) => {
        let bitti = false;
        let zamanlayici = null;

        function onayGeldi(e) {
            if (e.source !== window) return;
            if (!e.data || e.data.type !== 'MINER_CAPTURE_READY') return;
            if (bitti) return;
            bitti = true;
            window.removeEventListener('message', onayGeldi);
            clearTimeout(zamanlayici);
            resolve(true);
        }

        window.addEventListener('message', onayGeldi);

        zamanlayici = setTimeout(() => {
            if (bitti) return;
            bitti = true;
            window.removeEventListener('message', onayGeldi);
            resolve(false);
        }, timeoutMs);

        window.postMessage({ type: "MINER_ENABLE_CAPTURE" }, window.location.origin);
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

// PDF'i belleğe indir ve diske yaz. { ok, error, status, isHtmlError } döner.
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
        let htmlSnippet = '';
        try {
            const text = await blob.text();
            const titleMatch = text.match(/<title>(.*?)<\/title>/i);
            if (titleMatch && titleMatch[1]) {
                htmlSnippet = titleMatch[1].trim();
            } else {
                const cleanText = text.replace(/<script[\s\S]*?<\/script>/gi, '')
                                      .replace(/<style[\s\S]*?<\/style>/gi, '')
                                      .replace(/<[^>]+>/g, ' ')
                                      .replace(/\s+/g, ' ')
                                      .trim();
                if (cleanText.length > 0) {
                    htmlSnippet = cleanText.substring(0, 60);
                }
            }
        } catch (e) { }

        const detail = htmlSnippet ? htmlSnippet : (contentType || 'tip yok');
        return { ok: false, error: `PDF değil (${detail})`, isHtmlError: true, status: resp.status };
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

// Sunucu yoğunluğunda (HTML hatası, HTTP 503/429) otomatik yeniden deneme (retry) yapan sarmalayıcı
async function fetchPdfWithRetry(req, basePath, folder, fallbackName, maxRetries = 2) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const result = await fetchPdfAndSave(req, basePath, folder, fallbackName);
        if (result.ok) {
            return result;
        }

        // Eğer 5xx sunucu hatası (500, 502, 503 vb.), 429 veya HTML hatası ise bekleyip tekrar dene
        const isTemporaryError = result.isHtmlError || (result.status && result.status >= 500) || result.status === 429;
        if (attempt < maxRetries && isTemporaryError) {
            log(`Geçici yanıt alındı (${result.error}), ${attempt + 1}/${maxRetries} yeniden deneniyor...`);
            await new Promise(resolve => setTimeout(resolve, 3500));
        } else {
            return result;
        }
    }
}

// İndirme döngüsünün durumu (stop butonu bunu okuyup değiştirir)
const downloadState = {
    active: false,
    stopRequested: false,
    timerId: null
};

// ============ SAYFA İÇİ İLERLEME & BİLGİ PANELİ (OVERLAY) ============
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

function showStopOverlay(totalCount = 0) {
    let overlay = document.getElementById(STOP_OVERLAY_ID);
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = STOP_OVERLAY_ID;
        overlay.style.cssText = `
            position: fixed;
            top: 16px;
            right: 16px;
            z-index: 2147483647;
            width: 330px;
            background: #0f172a;
            color: #f8fafc;
            border-radius: 12px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
            padding: 14px 16px;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 13px;
            border: 1px solid rgba(255, 255, 255, 0.12);
            backdrop-filter: blur(8px);
            box-sizing: border-box;
        `;
        (document.body || document.documentElement).appendChild(overlay);
    }

    overlay.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
            <div style="display:flex; align-items:center; gap:8px;">
                <span id="miner-overlay-spinner" style="display:inline-block; width:10px; height:10px; border-radius:50%; background:#10b981; box-shadow:0 0 8px #10b981;"></span>
                <strong id="miner-overlay-title" style="font-size:14px; color:#f1f5f9; font-weight:600;">⚡ Miner İndirme</strong>
            </div>
            <button id="miner-overlay-stop-btn" style="
                background:#ef4444; color:#ffffff; border:none; border-radius:6px;
                padding:6px 12px; font-size:12px; font-weight:600; cursor:pointer;
                transition:all 0.2s ease; display:flex; align-items:center; gap:4px;
            ">⏹ Durdur</button>
        </div>

        <div style="margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between; font-size:12px; color:#94a3b8; margin-bottom:4px;">
                <span id="miner-overlay-status-title">Hazırlanıyor...</span>
                <span id="miner-overlay-percent" style="font-weight:600; color:#38bdf8;">0% (0/${totalCount})</span>
            </div>
            <div style="width:100%; height:8px; background:#1e293b; border-radius:4px; overflow:hidden;">
                <div id="miner-overlay-bar" style="width:0%; height:100%; background:linear-gradient(90deg, #3b82f6, #10b981); border-radius:4px; transition:width 0.3s ease;"></div>
            </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; gap:3px; margin-bottom:8px; font-size:10px;">
            <span style="background:rgba(16, 185, 129, 0.15); color:#34d399; padding:3px 6px; border-radius:5px; border:1px solid rgba(52, 211, 153, 0.3);" id="miner-badge-success">✓ 0 İndi</span>
            <span style="background:rgba(59, 130, 246, 0.15); color:#60a5fa; padding:3px 6px; border-radius:5px; border:1px solid rgba(96, 165, 250, 0.3);" id="miner-badge-skipped">⏩ 0 Atlandı</span>
            <span style="background:rgba(239, 68, 68, 0.15); color:#f87171; padding:3px 6px; border-radius:5px; border:1px solid rgba(248, 113, 113, 0.3);" id="miner-badge-fail">✗ 0 Hata</span>
            <span style="background:rgba(148, 163, 184, 0.15); color:#cbd5e1; padding:3px 6px; border-radius:5px; border:1px solid rgba(203, 213, 225, 0.3);" id="miner-badge-remaining">⌛ ${totalCount} Kalan</span>
        </div>

        <div id="miner-overlay-log" style="
            background:#020617; color:#94a3b8; border-radius:6px; padding:6px 8px;
            font-size:11px; font-family:monospace; height:42px; overflow-y:auto;
            border:1px solid rgba(255,255,255,0.05); line-height:1.4; word-break:break-all;
            margin-bottom:6px;
        ">İndirme başlatılıyor...</div>

        <div id="miner-overlay-actions" style="display:flex; gap:6px; justify-content:flex-end;"></div>
    `;

    const stopBtn = document.getElementById("miner-overlay-stop-btn");
    if (stopBtn) {
        stopBtn.addEventListener("click", () => {
            requestStop();
            stopBtn.textContent = "Durduruluyor...";
            stopBtn.disabled = true;
            stopBtn.style.opacity = "0.6";
        });
    }
}

function updateOverlayProgress({ current = 0, total = 0, success = 0, skipped = 0, fail = 0, statusMsg = "" }) {
    const overlay = document.getElementById(STOP_OVERLAY_ID);
    if (!overlay) return;

    const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
    const remaining = Math.max(0, total - current);

    const barEl = document.getElementById("miner-overlay-bar");
    const percentEl = document.getElementById("miner-overlay-percent");
    const statusTitle = document.getElementById("miner-overlay-status-title");
    const successBadge = document.getElementById("miner-badge-success");
    const skippedBadge = document.getElementById("miner-badge-skipped");
    const failBadge = document.getElementById("miner-badge-fail");
    const remainingBadge = document.getElementById("miner-badge-remaining");

    if (barEl) barEl.style.width = `${percent}%`;
    if (percentEl) percentEl.textContent = `${percent}% (${current}/${total})`;
    if (statusTitle && current > 0) statusTitle.textContent = `İndiriliyor... (${current}/${total})`;
    if (successBadge) successBadge.textContent = `✓ ${success} İndi`;
    if (skippedBadge) skippedBadge.textContent = `⏩ ${skipped} Atlandı`;
    if (failBadge) failBadge.textContent = `✗ ${fail} Hata`;
    if (remainingBadge) remainingBadge.textContent = `⌛ ${remaining} Kalan`;

    if (statusMsg) {
        const logEl = document.getElementById("miner-overlay-log");
        if (logEl) {
            logEl.textContent = statusMsg;
            logEl.scrollTop = logEl.scrollHeight;
        }
    }
}

function finishOverlayUI({ stoppedByUser, successCount, failCount, selectedCount, failedIndices, onRetry }) {
    const overlay = document.getElementById(STOP_OVERLAY_ID);
    if (!overlay) return;

    const spinner = document.getElementById("miner-overlay-spinner");
    if (spinner) {
        if (stoppedByUser) {
            spinner.style.background = "#f59e0b";
            spinner.style.boxShadow = "0 0 8px #f59e0b";
        } else if (failCount > 0) {
            spinner.style.background = "#ef4444";
            spinner.style.boxShadow = "0 0 8px #ef4444";
        } else {
            spinner.style.background = "#10b981";
            spinner.style.boxShadow = "0 0 8px #10b981";
        }
    }

    const statusTitle = document.getElementById("miner-overlay-status-title");
    if (statusTitle) {
        statusTitle.textContent = stoppedByUser ? "Durduruldu!" : "Tamamlandı!";
    }

    const stopBtn = document.getElementById("miner-overlay-stop-btn");
    if (stopBtn) stopBtn.style.display = "none";

    const actionsContainer = document.getElementById("miner-overlay-actions");
    if (actionsContainer) {
        actionsContainer.innerHTML = "";

        if (failedIndices && failedIndices.length > 0 && !stoppedByUser) {
            const retryBtn = document.createElement("button");
            retryBtn.style.cssText = `
                background: linear-gradient(135deg, #2563eb, #1d4ed8);
                color: #ffffff; border: none; border-radius: 6px;
                padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer;
                box-shadow: 0 2px 6px rgba(37, 99, 235, 0.4); flex: 1;
            `;
            retryBtn.textContent = `🔄 Eksikleri Yeniden İndir (${failedIndices.length})`;
            retryBtn.addEventListener("click", () => {
                if (onRetry) onRetry();
            });
            actionsContainer.appendChild(retryBtn);
        }

        const closeBtn = document.createElement("button");
        closeBtn.style.cssText = `
            background: #334155; color: #f8fafc; border: none; border-radius: 6px;
            padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer;
        `;
        closeBtn.textContent = "✕ Kapat";
        closeBtn.addEventListener("click", () => hideStopOverlay());
        actionsContainer.appendChild(closeBtn);
    }
}

function hideStopOverlay() {
    const overlay = document.getElementById(STOP_OVERLAY_ID);
    if (overlay) overlay.remove();
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

function hasMatchingExistingFile(existingMap, basePath, docType, fileType, fallbackName) {
    if (!existingMap) return false;

    if (fallbackName) {
        const exactPath = `${basePath}/${docType}/${fallbackName}`.replace(/\/+/g, '/').toLowerCase();
        if (existingMap[exactPath]) return true;
    }

    const folderPrefix = `${basePath}/${docType}/`.replace(/\/+/g, '/').toLowerCase();
    for (const rawPath in existingMap) {
        const path = rawPath.toLowerCase();
        if (path.includes(folderPrefix)) {
            if (fileType && fileType !== "Belge" && fileType !== "Beyanname") {
                if (path.includes(fileType.toLowerCase())) return true;
            } else if (path.endsWith('.pdf')) {
                return true;
            }
        }
    }
    return false;
}

function startDownloadProcess(request) {
    if (downloadState.active) {
        console.warn("[Miner] Zaten bir indirme sürüyor, yeni istek yok sayıldı.");
        return;
    }

    log("Download başladı");

    const config = detectSite();
    const allTargets = getTargets();
    let targetItems = [];

    if (request.indices && Array.isArray(request.indices)) {
        targetItems = request.indices
            .map(i => ({ element: allTargets[i], globalIndex: i }))
            .filter(item => item.element !== undefined);
    } else {
        targetItems = allTargets.map((el, i) => ({ element: el, globalIndex: i }));
    }

    log(`${targetItems.length} dosya indirilecek (${config.name})`);

    if (targetItems.length === 0) {
        safeSendMessage({ action: "updateStatus", message: "Dosya bulunamadı!", completed: true });
        return;
    }

    const basePath = request.basePath || "MinerDownloads";
    const skipExisting = request.skipExisting !== false;

    // Background'dan diske inen ve indirilenler geçmişini iste
    safeSendMessage({ action: "checkExistingFiles", basePath: basePath }, (resp) => {
        const existingMap = (resp && resp.existingMap) ? resp.existingMap : {};

        let index = 0;

        downloadState.active = true;
        downloadState.stopRequested = false;
        downloadState.timerId = null;

        let focusGuardOn = false;
        function enableFocusGuardOnce() {
            if (focusGuardOn) return;
            focusGuardOn = true;
            safeSendMessage({ action: "startFocusGuard" });
            window.postMessage({ type: "MINER_ENABLE_FOCUS_GUARD" }, window.location.origin);
        }

        // Sayfa içi İlerleme & Bilgi Panelini göster
        showStopOverlay(targetItems.length);

        // Site'e özel bekleme süreleri (ms)
        const isEbeyanname = config.name === "E-Beyanname Portal";

        const FETCH_DELAY = isEbeyanname ? 1800 : 800;
        const SLOW_FETCH_DELAY = 8000;
        const CAPTURE_TIMEOUT = 5000;
        let slowMode = false;
        let captureDisabled = false;
        const clickDelay = isEbeyanname ? 50 : 100;
        const afterClickDelay = isEbeyanname ? 200 : 1000;
        const betweenDelay = isEbeyanname ? 1500 : (request.delay || 2000);

        // Log kayıtları
        const downloadLog = [];
        const startTime = getTimestamp();
        const totalOnPage = allTargets.length;
        const selectedCount = targetItems.length;
        let successCount = 0;
        let skippedCount = 0;
        let failCount = 0;
        let unverifiedCount = 0;
        const downloadedItems = [];
        const failedItems = [];
        const failedTargetIndices = [];
        const unverifiedItems = [];

        downloadLog.push(`════════════════════════════════════════════════════════`);
        downloadLog.push(`                  MINER İNDİRME RAPORU`);
        downloadLog.push(`════════════════════════════════════════════════════════`);
        downloadLog.push(``);
        downloadLog.push(`Tarih/Saat    : ${startTime}`);
        downloadLog.push(`Site Türü     : ${config.name}`);
        downloadLog.push(`Sayfa URL     : ${window.location.href}`);
        downloadLog.push(`Hedef Klasör  : ${basePath}`);
        downloadLog.push(`Mükerrer Atla : ${skipExisting ? 'Evet' : 'Hayır'}`);
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
            if (!downloadState.active) return;

            const endTime = getTimestamp();

            downloadState.active = false;
            downloadState.stopRequested = false;
            downloadState.timerId = null;

            safeSendMessage({ action: "stopFocusGuard" });
            window.postMessage({ type: "MINER_DISABLE_FOCUS_GUARD" }, window.location.origin);
            window.postMessage({ type: "MINER_DISABLE_CAPTURE" }, window.location.origin);

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
            }
            if (stoppedByUser) {
                downloadLog.push(`İşlenmeyen (durduruldu): ${selectedCount - successCount - failCount}`);
            }
            downloadLog.push(``);

            if (downloadedItems.length > 0) {
                downloadLog.push(`✓ İNDİRİLEN / MEVCUT DOSYALAR (${downloadedItems.length}):`);
                downloadedItems.forEach(item => downloadLog.push(`  • ${item}`));
                downloadLog.push(``);
            }

            if (failedItems.length > 0) {
                downloadLog.push(`✗ BAŞARISIZ OLANLAR (${failedItems.length}):`);
                failedItems.forEach(item => downloadLog.push(`  • ${item}`));
                downloadLog.push(``);
            }

            downloadLog.push(`════════════════════════════════════════════════════════`);
            downloadLog.push(`                    RAPOR SONU`);
            downloadLog.push(`════════════════════════════════════════════════════════`);

            safeSendMessage({
                action: "saveLog",
                basePath: basePath,
                logContent: downloadLog.join('\n')
            });

            const ek = unverifiedCount > 0 ? `, ${unverifiedCount} doğrulanamadı` : '';
            const finalMessage = stoppedByUser
                ? `Durduruldu! (${successCount}/${selectedCount} doğrulandı${ek})`
                : `Tamamlandı! (${successCount}/${selectedCount} doğrulandı${ek})`;
            log(finalMessage);
            safeSendMessage({ action: "updateStatus", message: finalMessage, completed: true });

            finishOverlayUI({
                stoppedByUser,
                successCount,
                failCount,
                selectedCount,
                failedIndices: failedTargetIndices,
                onRetry: () => {
                    log(`Eksik olan ${failedTargetIndices.length} dosya yeniden indiriliyor...`);
                    startDownloadProcess({ indices: failedTargetIndices, basePath: basePath, skipExisting: skipExisting });
                }
            });
        }

        function processNext() {
            if (!isExtensionContextValid()) {
                downloadState.active = false;
                window.postMessage({ type: "MINER_DISABLE_CAPTURE" }, window.location.origin);
                window.postMessage({ type: "MINER_DISABLE_FOCUS_GUARD" }, window.location.origin);
                hideStopOverlay();
                return;
            }

            if (downloadState.stopRequested) {
                finishDownload(true);
                return;
            }

            if (index >= targetItems.length) {
                finishDownload(false);
                return;
            }

            const item = targetItems[index];
            const el = item.element;
            const globalIdx = item.globalIndex;
            const docType = findDocType(el);
            const timestamp = getTimestamp();
            const currentNum = index + 1;

            const fileType = config.getFileType ? config.getFileType(el) : "Belge";
            const fallbackName = `${docType}_${fileType}.pdf`;

            // Mükerrer Kontrolü: Dosya diske/geçmişe önceden inmişse 50ms'de sunucuya istek atmadan atla!
            if (skipExisting && hasMatchingExistingFile(existingMap, basePath, docType, fileType, fallbackName)) {
                el.style.border = "3px solid #3b82f6";
                recordResult(true, null, docType, timestamp, currentNum, false, globalIdx, true /* isSkipped */);
                scheduleNext(50);
                return;
            }

            updateOverlayProgress({
                current: currentNum,
                total: selectedCount,
                success: successCount,
                fail: failCount,
                statusMsg: `[${currentNum}/${selectedCount}] İndiriliyor: ${docType}`
            });

            el.style.border = "3px solid green";

            const req = config.buildRequest ? config.buildRequest(el) : null;

            if (req) {
                handleFetchItem(req, el, docType, timestamp, currentNum, globalIdx);
            } else if (config.captureOnClick && !captureDisabled) {
                handleCaptureItem(el, docType, timestamp, currentNum, globalIdx);
            } else {
                handleClickItem(el, docType, timestamp, currentNum, globalIdx);
            }
        }

        function recordResult(ok, errMsg, docType, timestamp, currentNum, unverified, globalIdx, isSkipped) {
            const itemPath = `${basePath}/${docType}/`;
            if (isSkipped) {
                skippedCount++;
                downloadedItems.push(`[${currentNum}] ${docType} (zaten var, atlandı)`);
                downloadLog.push(`[${timestamp}] ⏩ ${currentNum}. ${docType} -> ZATEN VAR (Atlandı)`);
            } else if (ok && unverified) {
                unverifiedCount++;
                unverifiedItems.push(`[${currentNum}] ${docType}`);
                downloadLog.push(`[${timestamp}] ? ${currentNum}. ${docType} -> ${itemPath} (gönderildi, sonuç doğrulanamadı)`);
            } else if (ok) {
                successCount++;
                downloadedItems.push(`[${currentNum}] ${docType}`);
                downloadLog.push(`[${timestamp}] ✓ ${currentNum}. ${docType} -> ${itemPath}`);
            } else {
                failCount++;
                if (globalIdx !== undefined) {
                    failedTargetIndices.push(globalIdx);
                }
                failedItems.push(`[${currentNum}] ${docType} (${errMsg || 'hata'})`);
                downloadLog.push(`[${timestamp}] ✗ ${currentNum}. ${docType} -> HATA: ${errMsg || 'bilinmiyor'}`);
            }

            updateOverlayProgress({
                current: currentNum,
                total: selectedCount,
                success: successCount,
                skipped: skippedCount,
                fail: failCount,
                statusMsg: isSkipped ? `⏩ Zaten var (Atlandı): ${docType}` : (ok ? `✓ İndi: ${docType}` : `✗ HATA: ${docType} (${errMsg || 'hata'})`)
            });
        }

        function scheduleNext(delay) {
            index++;
            if (downloadState.stopRequested) {
                finishDownload(true);
                return;
            }
            downloadState.timerId = setTimeout(processNext, delay);
        }

        function handleFetchItem(req, el, docType, timestamp, currentNum, globalIdx) {
            const fileType = config.getFileType ? config.getFileType(el) : "Belge";
            const fallbackName = `${docType}_${fileType}.pdf`;

            fetchPdfWithRetry(req, basePath, docType, fallbackName)
                .then((result) => {
                    recordResult(result.ok, result.error, docType, timestamp, currentNum, false, globalIdx);
                    el.style.border = result.ok ? "" : "3px solid red";

                    const isServerError = result.isHtmlError || (result.status && result.status >= 500) || result.status === 429;
                    if (isServerError) {
                        if (!slowMode) log("Sunucu hatası/yoğunluğu (HTTP 500/503/429/HTML), tempo düşürülüyor...");
                        slowMode = true;
                    } else if (result.ok) {
                        slowMode = false;
                    }

                    scheduleNext(slowMode ? SLOW_FETCH_DELAY : FETCH_DELAY);
                })
                .catch((err) => {
                    recordResult(false, err.message, docType, timestamp, currentNum, false, globalIdx);
                    el.style.border = "3px solid red";
                    scheduleNext(slowMode ? SLOW_FETCH_DELAY : FETCH_DELAY);
                });
        }

        function handleCaptureItem(el, docType, timestamp, currentNum, globalIdx) {
            const fileType = config.getFileType ? config.getFileType(el) : "Beyanname";
            const fallbackName = `${docType}_${fileType}_${currentNum}.pdf`;

            captureRequestFromClick(el, CAPTURE_TIMEOUT)
                .then((req) => fetchPdfWithRetry(req, basePath, docType, fallbackName))
                .then((result) => {
                    recordResult(result.ok, result.error, docType, timestamp, currentNum, false, globalIdx);
                    el.style.border = result.ok ? "" : "3px solid red";

                    const isServerError = result.isHtmlError || (result.status && result.status >= 500) || result.status === 429;
                    if (isServerError) {
                        if (!slowMode) log("Sunucu hatası/yoğunluğu (HTTP 500/503/429/HTML), tempo düşürülüyor...");
                        slowMode = true;
                    } else if (result.ok) {
                        slowMode = false;
                    }

                    scheduleNext(slowMode ? SLOW_FETCH_DELAY : FETCH_DELAY);
                })
                .catch((err) => {
                    if (err.captureTimeout && !captureDisabled) {
                        captureDisabled = true;
                        log("Sessiz yakalama tutmadı, klasik yönteme geçiliyor.");
                        window.postMessage({ type: "MINER_DISABLE_CAPTURE" }, window.location.origin);
                        downloadLog.push(`[${timestamp}] ! Sessiz yakalama tutmadı -> klasik tıklama yöntemine geçildi`);
                        handleClickItem(el, docType, timestamp, currentNum, globalIdx);
                        return;
                    }
                    recordResult(false, err.message, docType, timestamp, currentNum, false, globalIdx);
                    el.style.border = "3px solid red";
                    scheduleNext(slowMode ? SLOW_FETCH_DELAY : FETCH_DELAY);
                });
        }

        function handleClickItem(el, docType, timestamp, currentNum, globalIdx) {
            enableFocusGuardOnce();

            safeSendMessage({
                action: "setNextDownloadConfig",
                config: { basePath: basePath, folder: docType }
            }, () => {
                if (downloadState.stopRequested) {
                    finishDownload(true);
                    return;
                }

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

                    recordResult(clickSuccess, "tıklama hatası", docType, timestamp, currentNum, true, globalIdx);

                    downloadState.timerId = setTimeout(() => {
                        el.style.border = clickSuccess ? "" : "3px solid red";
                        const delay = isEbeyanname ? betweenDelay : (((index + 1) % 5 === 0) ? 5000 : betweenDelay);
                        scheduleNext(delay);
                    }, afterClickDelay);
                }, clickDelay);
            });
        }

        function startDownload() {
            if (!config.captureOnClick) {
                processNext();
                return;
            }
            enableCaptureMode(2000).then((hazir) => {
                if (!hazir) {
                    captureDisabled = true;
                    log("inject.js sayfaya ulaşmadı - klasik tıklama yöntemi kullanılacak");
                } else {
                    log("Sessiz yakalama hazır.");
                }
                processNext();
            });
        }

        startDownload();
    });
}

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
        if (downloadState.active) {
            console.warn("[Miner] Zaten bir indirme sürüyor, yeni istek yok sayıldı.");
            sendResponse({ started: false, reason: "already_running" });
            return;
        }
        sendResponse({ started: true });
        startDownloadProcess(request);
    }
});

} // window.__minerContentLoaded guard sonu
