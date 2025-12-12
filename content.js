// ============ SİTE KONFİGÜRASYONLARI ============
const SITE_CONFIGS = {
    // GİB İnternet Vergi Dairesi
    gib: {
        name: "GİB Beyanname",
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
            // Sadece download ikonlarını al (TD, HD, SHD)
            const links = Array.from(document.querySelectorAll('a[onclick*="islem(\'TD\'"], a[onclick*="islem(\'HD\'"], a[onclick*="islem(\'SHD\'"]'));
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
        }
    },

    // E-Beyanname Portalı
    ebeyanname: {
        name: "E-Beyanname Portal",
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

function log(msg) {
    console.log("[Miner] " + msg);
    chrome.runtime.sendMessage({ action: "updateStatus", message: msg });
}

function getTimestamp() {
    const now = new Date();
    return now.toLocaleString('tr-TR');
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "scan") {
        const targets = getTargets();
        const items = targets.map(t => ({ title: t.title, type: findDocType(t) }));
        sendResponse({ count: targets.length, items: items });
    }
    else if (request.action === "download") {
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
            chrome.runtime.sendMessage({ action: "updateStatus", message: "Dosya bulunamadı!", completed: true });
            return;
        }

        const basePath = request.basePath || "MinerDownloads";
        let index = 0;

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
        const downloadedItems = [];
        const failedItems = [];

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

        function processNext() {
            if (index >= targets.length) {
                // İndirme bitti, özet raporu oluştur
                const endTime = getTimestamp();

                downloadLog.push(``);
                downloadLog.push(`────────────────────────────────────────────────────────`);
                downloadLog.push(`                      SONUÇ RAPORU`);
                downloadLog.push(`────────────────────────────────────────────────────────`);
                downloadLog.push(`Bitiş Zamanı          : ${endTime}`);
                downloadLog.push(`Başarılı İndirme      : ${successCount} / ${selectedCount}`);
                downloadLog.push(`Başarısız             : ${failCount}`);
                downloadLog.push(``);

                if (downloadedItems.length > 0) {
                    downloadLog.push(`✓ İNDİRİLEN DOSYALAR (${downloadedItems.length}):`);
                    downloadedItems.forEach(item => {
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
                chrome.runtime.sendMessage({
                    action: "saveLog",
                    basePath: basePath,
                    logContent: downloadLog.join('\n')
                });

                log(`Tamamlandı! (${successCount}/${selectedCount} başarılı)`);
                chrome.runtime.sendMessage({ action: "updateStatus", message: `Tamamlandı! (${successCount}/${selectedCount})`, completed: true });
                return;
            }

            const el = targets[index];
            const docType = findDocType(el);
            const timestamp = getTimestamp();
            const currentNum = index + 1;

            log(`İndiriliyor ${currentNum}/${targets.length} (${docType})`);

            el.style.border = "3px solid green";

            // Önce config'i ayarla, sonra tıkla
            chrome.runtime.sendMessage({
                action: "setNextDownloadConfig",
                config: {
                    basePath: basePath,
                    folder: docType
                }
            }, () => {
                // Config ayarlandı, şimdi tıkla
                setTimeout(() => {
                    let clickSuccess = false;
                    try {
                        el.click();
                        clickSuccess = true;
                    } catch(e) {
                        console.error("[Miner] Click error:", e);
                        clickSuccess = false;
                    }

                    // Log kaydı ekle
                    const itemPath = `${basePath}/${docType}/`;
                    if (clickSuccess) {
                        successCount++;
                        downloadedItems.push(`[${currentNum}] ${docType}`);
                        downloadLog.push(`[${timestamp}] ✓ ${currentNum}. ${docType} -> ${itemPath}`);
                    } else {
                        failCount++;
                        failedItems.push(`[${currentNum}] ${docType} (tıklama hatası)`);
                        downloadLog.push(`[${timestamp}] ✗ ${currentNum}. ${docType} -> HATA`);
                    }

                    // Sonraki dosyaya geç
                    setTimeout(() => {
                        el.style.border = clickSuccess ? "" : "3px solid red";
                        index++;
                        // Her 5 dosyada bir biraz daha bekle (E-Beyanname hariç)
                        const delay = isEbeyanname ? betweenDelay : ((index % 5 === 0) ? 5000 : betweenDelay);
                        setTimeout(processNext, delay);
                    }, afterClickDelay);
                }, clickDelay);
            });
        }

        processNext();
    }
});
