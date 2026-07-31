let nextDownloadConfig = null;

// Tam yolu kendimiz belirlediğimiz indirmeler (fetch ile inen PDF'ler ve log dosyası).
// onDeterminingFilename bu yolu uygulamazsa Chrome varsayılana düşüp "download.pdf" diyor.
let pendingPath = null;

// İndirme döngüsü sürerken sitenin açtığı yeni pencere/sekmeler Chrome'u öne fırlatıyor.
// Bu durum bilgisi ile o pencereleri anında arka plana atıyoruz.
const focusGuard = {
    active: false,
    windowId: null,
    tabId: null
};

// Pencere/sekme arada kapanmış olabilir; lastError okunmazsa konsola uyarı düşer.
function ignoreLastError() {
    if (chrome.runtime.lastError) { /* pencere kapanmış olabilir, sorun değil */ }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Odak koruması: indirme başlarken aç, biterken kapat
    if (request.action === "startFocusGuard") {
        focusGuard.active = true;
        focusGuard.windowId = sender.tab ? sender.tab.windowId : null;
        focusGuard.tabId = sender.tab ? sender.tab.id : null;
        console.log("[Miner BG] Odak koruması AÇIK. Pencere:", focusGuard.windowId, "Sekme:", focusGuard.tabId);
        sendResponse({ success: true });
    }

    if (request.action === "stopFocusGuard") {
        focusGuard.active = false;
        focusGuard.windowId = null;
        focusGuard.tabId = null;
        console.log("[Miner BG] Odak koruması KAPALI");
        sendResponse({ success: true });
    }

    // Sessiz indirme: content script PDF'i belleğe aldı, biz diske yazıyoruz.
    // Yol pendingPath üzerinden onDeterminingFilename'de uygulanır.
    if (request.action === "saveFile") {
        // Tıklama yolundan kalmış eski bir config bu dosyayı yanlış klasöre yazmasın
        nextDownloadConfig = null;

        let path = `${request.basePath}/${request.folder}/${request.filename}`;
        path = path.replace(/\/+/g, '/');
        if (path.startsWith('/')) path = path.substring(1);

        // onDeterminingFilename bu yolu uygulasın (yoksa "download.pdf" olur)
        pendingPath = path;

        chrome.downloads.download({
            url: request.dataUrl,
            filename: path,
            saveAs: false,
            conflictAction: 'uniquify'
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                // İndirme hiç başlamadıysa onDeterminingFilename tetiklenmez;
                // bekleyen yol sonraki dosyaya yanlışlıkla uygulanmasın.
                pendingPath = null;
                console.error("[Miner BG] saveFile error:", chrome.runtime.lastError.message);
                sendResponse({ ok: false, error: chrome.runtime.lastError.message });
            } else {
                console.log("[Miner BG] Kaydedildi:", path);
                sendResponse({ ok: true, downloadId: downloadId });
            }
        });

        return true; // sendResponse asenkron çağrılacak, kanalı açık tut
    }

    if (request.action === "setNextDownloadConfig") {
        nextDownloadConfig = request.config;
        console.log("[Miner BG] Config set:", nextDownloadConfig);
        sendResponse({ success: true });

        // 10 saniye sonra temizle
        setTimeout(() => {
            if (nextDownloadConfig === request.config) {
                nextDownloadConfig = null;
            }
        }, 10000);
    }

    // Log dosyasını kaydet
    if (request.action === "saveLog") {
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
        const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '-'); // HH-MM-SS
        const filename = `${request.basePath}/miner_log_${dateStr}_${timeStr}.txt`;

        // Text içeriğini data URL'e çevir
        const dataUrl = 'data:text/plain;charset=utf-8,' + encodeURIComponent(request.logContent);

        // onDeterminingFilename bu yolu uygulasın (yoksa "download.txt" olur)
        pendingPath = filename;

        chrome.downloads.download({
            url: dataUrl,
            filename: filename,
            saveAs: false,
            conflictAction: 'uniquify'
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                console.error("[Miner BG] Log save error:", chrome.runtime.lastError.message);
            } else {
                console.log("[Miner BG] Log saved:", filename);
            }
        });
    }
});

// Download başladığında dosya adını değiştir
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
    // Yolu zaten biz belirledik (fetch ile inen PDF / log dosyası) -> aynen uygula.
    // DİKKAT: burada suggest()'i boş çağırmak Chrome'u varsayılana düşürür
    // ve download() ile verdiğimiz filename çöpe gider ("download.pdf" olur).
    if (pendingPath) {
        const path = pendingPath;
        pendingPath = null;
        console.log("[Miner BG] Yol uygulanıyor:", path);
        suggest({ filename: path, conflictAction: 'uniquify' });
        return;
    }

    if (nextDownloadConfig) {
        const { basePath, folder } = nextDownloadConfig;

        // Orijinal dosya adını al
        let filename = item.filename || 'download.pdf';

        // Yeni path oluştur: basePath/folder/filename
        let newPath = `${basePath}/${folder}/${filename}`;

        // Temizle
        newPath = newPath.replace(/\/+/g, '/');
        if (newPath.startsWith('/')) newPath = newPath.substring(1);

        console.log("[Miner BG] Renaming to:", newPath);

        suggest({
            filename: newPath,
            conflictAction: 'uniquify'
        });

        nextDownloadConfig = null;
    } else {
        suggest();
    }
});

// ============ ODAK KORUMASI ============
// GİB/SGK/E-Beyanname sayfaları PDF'i yeni pencerede (window.open / target="_blank") açıyor.
// Chrome yeni pencereyi otomatik öne getirdiği için her dosyada odak çalınıyor.
// İndirme sürerken açılan yeni pencereyi anında küçültüyoruz; indirme normal devam eder.
chrome.windows.onCreated.addListener((win) => {
    if (!focusGuard.active) return;
    if (focusGuard.windowId !== null && win.id === focusGuard.windowId) return;

    console.log("[Miner BG] Yeni pencere küçültülüyor (odak koruması):", win.id);
    chrome.windows.update(win.id, { state: "minimized" }, ignoreLastError);
});

// Yeni sekme aynı pencerede açılıyorsa aktif sekmeyi indirme sayfasına geri döndür.
// Aksi halde sayfa arka plana düşer, setTimeout'lar kısılır ve döngünün temposu bozulur.
chrome.tabs.onCreated.addListener((tab) => {
    if (!focusGuard.active || focusGuard.tabId === null) return;
    if (tab.id === focusGuard.tabId) return;
    if (focusGuard.windowId !== null && tab.windowId !== focusGuard.windowId) return;

    chrome.tabs.update(focusGuard.tabId, { active: true }, ignoreLastError);
});
