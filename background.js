let nextDownloadConfig = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
