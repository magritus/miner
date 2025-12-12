// Bu dosya main world'de çalışır - sitenin download'larını intercept eder
(function() {
    if (window.__minerInterceptSetup) return;
    window.__minerInterceptSetup = true;
    window.__minerInterceptEnabled = false;

    console.log("[Miner Inject] Setting up intercept for GİB...");

    // Content script'ten gelen mesajları dinle
    window.addEventListener('message', (event) => {
        if (event.data?.type === 'MINER_ENABLE_INTERCEPT') {
            window.__minerInterceptEnabled = true;
            console.log("[Miner Inject] Intercept ENABLED");
        } else if (event.data?.type === 'MINER_DISABLE_INTERCEPT') {
            window.__minerInterceptEnabled = false;
            console.log("[Miner Inject] Intercept DISABLED");
        }
    });

    function notifyBlobIntercepted(blob, filename) {
        console.log("[Miner Inject] Blob intercepted! Size:", blob.size);
        // Blob'u base64'e çevir ve content script'e gönder
        const reader = new FileReader();
        reader.onloadend = () => {
            window.dispatchEvent(new CustomEvent('minerBlobIntercepted', {
                detail: {
                    dataUrl: reader.result,
                    filename: filename || 'beyanname.pdf',
                    size: blob.size
                }
            }));
        };
        reader.readAsDataURL(blob);
    }

    // ============ XMLHttpRequest INTERCEPT ============
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._minerUrl = url;
        this._minerMethod = method;
        return originalXHROpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function(body) {
        if (window.__minerInterceptEnabled) {
            console.log("[Miner Inject] XHR request:", this._minerMethod, this._minerUrl);

            this.addEventListener('load', function() {
                // PDF response mu kontrol et
                const contentType = this.getResponseHeader('content-type') || '';
                console.log("[Miner Inject] XHR response type:", contentType, "Status:", this.status);

                if (contentType.includes('pdf') || contentType.includes('octet-stream')) {
                    console.log("[Miner Inject] PDF response detected!");
                    if (this.response instanceof Blob) {
                        notifyBlobIntercepted(this.response, 'beyanname.pdf');
                    } else if (this.responseType === 'arraybuffer') {
                        const blob = new Blob([this.response], { type: 'application/pdf' });
                        notifyBlobIntercepted(blob, 'beyanname.pdf');
                    }
                }
            });
        }
        return originalXHRSend.call(this, body);
    };

    // ============ FETCH INTERCEPT ============
    const originalFetch = window.fetch;
    window.fetch = function(url, options) {
        if (window.__minerInterceptEnabled) {
            console.log("[Miner Inject] Fetch request:", url);

            return originalFetch.call(this, url, options).then(response => {
                const contentType = response.headers.get('content-type') || '';
                console.log("[Miner Inject] Fetch response type:", contentType);

                if (contentType.includes('pdf') || contentType.includes('octet-stream')) {
                    console.log("[Miner Inject] PDF fetch detected!");
                    // Clone response çünkü body sadece bir kez okunabilir
                    return response.clone().blob().then(blob => {
                        notifyBlobIntercepted(blob, 'beyanname.pdf');
                        return response; // Orijinal response'u da döndür
                    });
                }
                return response;
            });
        }
        return originalFetch.call(this, url, options);
    };

    // ============ URL.createObjectURL INTERCEPT ============
    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = function(blob) {
        const url = originalCreateObjectURL.call(this, blob);
        if (window.__minerInterceptEnabled && blob instanceof Blob) {
            console.log("[Miner Inject] createObjectURL called, blob size:", blob.size, "type:", blob.type);
            if (blob.type.includes('pdf') || blob.size > 10000) { // PDF genelde büyük
                notifyBlobIntercepted(blob, 'beyanname.pdf');
            }
        }
        return url;
    };

    // ============ <a download> INTERCEPT ============
    const originalAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {
        if (window.__minerInterceptEnabled && (this.download || this.href?.startsWith('blob:'))) {
            console.log("[Miner Inject] Anchor click intercepted:", this.href);
            window.dispatchEvent(new CustomEvent('minerDownloadIntercepted', {
                detail: { url: this.href, filename: this.download || 'file.pdf' }
            }));
            return; // Engelle
        }
        return originalAnchorClick.call(this);
    };

    // Focus çalmayı engelle
    window.focus = function() {};

    console.log("[Miner Inject] Setup complete - XHR, Fetch, Blob intercepts ready!");
})();
