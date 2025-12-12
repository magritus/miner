function log(msg) {
    const statusDiv = document.getElementById('status');
    // statusDiv.textContent = msg; // Simple mode
    // Debug mode: Append to list temporarily if needed, or just update status
    statusDiv.innerHTML += `<br><small>${msg}</small>`;
    console.log(msg);
}

document.addEventListener('DOMContentLoaded', () => {
    const statusDiv = document.getElementById('status');
    const listDiv = document.getElementById('list');
    const downloadBtn = document.getElementById('downloadBtn');
    const basePathInput = document.getElementById('basePath');

    // Load saved settings
    chrome.storage.local.get(['basePath'], (result) => {
        if (result.basePath) {
            basePathInput.value = result.basePath;
        }
    });

    let currentActiveTabId = null;
    let targetFrameId = 0;

    // Direct Scan via Content Script (Mechanism 1)
    function scanViaMessage(tabId) {
        log("Trying Message Scan...");
        return new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(tabId, { action: "scan" }, (response) => {
                if (chrome.runtime.lastError) {
                    log("Msg Scan error: " + chrome.runtime.lastError.message);
                    resolve(null);
                } else {
                    resolve(response);
                }
            });
        });
    }

    // In-Page Script Scan (Mechanism 2)
    function scanInPage() {
        // GİB için
        const gibTargets = Array.from(document.querySelectorAll('img[title="Beyanname Görüntüle"], img[src*="pdfb.gif"]'));

        // SGK için
        const sgkTargets = Array.from(document.querySelectorAll('a[onclick*="islem(\'TD\'"], a[onclick*="islem(\'HD\'"], a[onclick*="islem(\'SHD\'"]'));

        let targets = [];
        let siteType = 'unknown';

        if (sgkTargets.length > 0) {
            siteType = 'sgk';
            targets = sgkTargets;
        } else if (gibTargets.length > 0) {
            siteType = 'gib';
            targets = [...new Set(gibTargets)];
        }

        if (targets.length === 0) return [];

        return targets.map(t => {
            let type = "Unknown";
            let subType = "";

            try {
                if (siteType === 'sgk') {
                    // SGK: Dönem ve tip bilgisi
                    const onclick = t.getAttribute('onclick') || '';
                    if (onclick.includes("'TD'")) subType = "Tahakkuk";
                    else if (onclick.includes("'HD'")) subType = "Hizmet";
                    else if (onclick.includes("'SHD'")) subType = "SHizmet";

                    const row = t.closest('tr');
                    if (row) {
                        const firstCell = row.querySelector('td');
                        if (firstCell) {
                            const period = firstCell.innerText.trim().replace('/', '-').replace(' ', '');
                            type = period + " - " + subType;
                        }
                    }
                } else {
                    // GİB
                    let row = t.closest('tr');
                    if (row) {
                        const cells = Array.from(row.querySelectorAll('td'));
                        for (const cell of cells) {
                            const text = cell.innerText.trim();
                            const match = text.match(/^([A-Z0-9]+)_\d+(-\d+)?$/) || text.match(/^([A-Z0-9]+)_\d+/);
                            if (match) {
                                type = match[1];
                                break;
                            }
                        }
                    }
                }
            } catch (e) { }
            return { title: t.title || subType, type: type };
        });
    }

    function scanViaScripting(tabId) {
        log("Trying Scripting Scan (All Frames)...");
        return new Promise((resolve) => {
            chrome.scripting.executeScript({
                target: { tabId: tabId, allFrames: true },
                func: scanInPage
            }, (results) => {
                if (chrome.runtime.lastError) {
                    log("Script Scan error: " + chrome.runtime.lastError.message);
                    resolve(null);
                    return;
                }

                // results is array of {frameId, result}
                let foundItems = [];
                let foundFrame = 0;

                if (results) {
                    for (const res of results) {
                        if (res.result && res.result.length > 0) {
                            foundItems = res.result;
                            foundFrame = res.frameId;
                            break;
                        }
                    }
                }

                if (foundItems.length > 0) {
                    resolve({ count: foundItems.length, items: foundItems, frameId: foundFrame });
                } else {
                    resolve({ count: 0, items: [] });
                }
            });
        });
    }

    // Main Scan Flow
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        const activeTab = tabs[0];
        currentActiveTabId = activeTab.id;
        statusDiv.textContent = "Scanning...";

        let result = await scanViaScripting(activeTab.id);

        if (!result || result.count === 0) {
            log("Scripting found nothing. Trying Message (Fallback)...");
            result = await scanViaMessage(activeTab.id);
        }

        if (result && result.count > 0) {
            targetFrameId = result.frameId || 0;
            statusDiv.innerHTML = `Found ${result.count} items <br><small>(Frame: ${targetFrameId})</small>`;

            // Render list with checkboxes
            listDiv.innerHTML = `<div style="padding-bottom:5px;border-bottom:1px solid #ddd;margin-bottom:5px;">
                <label><input type="checkbox" id="selectAll" checked> Select All</label>
            </div>` + result.items.map((item, index) =>
                `<div class="item">
                    <label>
                        <input type="checkbox" class="file-check" data-index="${index}" checked>
                        ${index + 1}. ${item.type || "Unknown"}
                    </label>
                </div>`
            ).join('');

            downloadBtn.disabled = false;

            // Handle "Select All"
            const selectAll = document.getElementById('selectAll');
            const fileChecks = document.querySelectorAll('.file-check');

            selectAll.addEventListener('change', (e) => {
                fileChecks.forEach(cb => cb.checked = e.target.checked);
                updateDownloadButton();
            });

            fileChecks.forEach(cb => {
                cb.addEventListener('change', updateDownloadButton);
            });

            function updateDownloadButton() {
                const count = document.querySelectorAll('.file-check:checked').length;
                downloadBtn.textContent = `Download Selected (${count})`;
                downloadBtn.disabled = count === 0;
            }

            updateDownloadButton();

        } else {
            statusDiv.textContent = "No items found.";
            log("Check if page is fully loaded.");
        }
    });

    // Handle download click
    downloadBtn.addEventListener('click', () => {
        const basePath = basePathInput.value || "MinerDownloads";
        chrome.storage.local.set({ basePath: basePath });

        // Get selected indices
        const checkboxes = document.querySelectorAll('.file-check:checked');
        const selectedIndices = Array.from(checkboxes).map(cb => parseInt(cb.dataset.index));

        if (selectedIndices.length === 0) return;

        downloadBtn.disabled = true;
        statusDiv.textContent = "Downloading...";

        if (currentActiveTabId) {
            chrome.tabs.sendMessage(currentActiveTabId, {
                action: "download",
                delay: 2000,
                basePath: basePath,
                indices: selectedIndices // Send specific indices
            }, { frameId: targetFrameId }, (response) => {
                if (chrome.runtime.lastError) {
                    log("Frame Msg Error: " + chrome.runtime.lastError.message + ". Retrying globally...");
                    // Fallback: The content script might not be injected in that frame or connection broke.
                    // Force inject content.js again to all frames to be sure, then send message.
                    chrome.scripting.executeScript({
                        target: { tabId: currentActiveTabId, allFrames: true },
                        files: ['content.js']
                    }, () => {
                        if (chrome.runtime.lastError) {
                            log("Injection Error: " + chrome.runtime.lastError.message);
                            return;
                        }
                        // Give it a split second to initialize listeners
                        setTimeout(() => {
                            log("Retrying download command after injection...");
                            chrome.tabs.sendMessage(currentActiveTabId, {
                                action: "download",
                                delay: 2000,
                                basePath: basePath,
                                indices: selectedIndices
                            });
                        }, 500);
                    });
                }
            });
        }
    });

    // Listen for progress updates
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "updateStatus") {
            // Keep the latest status at top
            statusDiv.textContent = request.message;

            // Also append to list so user can see history of DEBUG messages
            // Clear list first time we start downloading if it has items
            if (downloadBtn.disabled && listDiv.querySelector('.file-check')) {
                listDiv.innerHTML = '<div style="font-size:10px; font-family:monospace; color:#333; border-top:1px solid #eee; padding-top:5px;"><strong>Log:</strong></div>';
            }

            if (request.message.startsWith("DEBUG:")) {
                listDiv.innerHTML += `<div style="font-size:10px; font-family:monospace; color:#555;">${request.message}</div>`;
            }

            if (request.completed) {
                downloadBtn.disabled = false;
                downloadBtn.textContent = "Done (Click to Retry)";
            }
        }
    });
});
