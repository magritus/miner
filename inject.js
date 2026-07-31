// Bu dosya main world'de çalışır - sitenin download'larını intercept eder
(function() {
    if (window.__minerInterceptSetup) return;
    window.__minerInterceptSetup = true;
    // NOT: __minerInterceptEnabled hiç açılmıyor (aşağıdaki XHR/Fetch/Blob/<a> intercept'leri
    // kasıtlı olarak devre dışı bırakıldı - content.js bu event'leri dinlemiyor, açılırsa
    // gerçek indirmeler sessizce yutulup kaybolabilir). Sadece window.open odak-koruması
    // ayrı bir bayrakla (__minerFocusGuardEnabled) kontrol ediliyor, bkz. aşağı.
    window.__minerInterceptEnabled = false;
    window.__minerFocusGuardEnabled = false;
    // Yakalama modu: window.open'i ACTIRMADAN adresi content script'e verir (GIB).
    window.__minerCaptureEnabled = false;

    console.log("[Miner Inject] Setting up intercept for GİB...");

    // Content script'ten gelen mesajları dinle
    window.addEventListener('message', (event) => {
        if (event.data?.type === 'MINER_ENABLE_FOCUS_GUARD') {
            window.__minerFocusGuardEnabled = true;
            console.log("[Miner Inject] Focus guard ENABLED");
        } else if (event.data?.type === 'MINER_DISABLE_FOCUS_GUARD') {
            window.__minerFocusGuardEnabled = false;
            console.log("[Miner Inject] Focus guard DISABLED");
        } else if (event.data?.type === 'MINER_ENABLE_CAPTURE') {
            window.__minerCaptureEnabled = true;
            console.log("[Miner Inject] Capture mode ENABLED");
            // Content script bunu BEKLIYOR. Onaylamazsak ilk tiklama yakalama
            // acilmadan gerceklesir (postMessage asenkron) ve yakalama hep kacar.
            window.postMessage({ type: 'MINER_CAPTURE_READY' }, window.location.origin);
        } else if (event.data?.type === 'MINER_DISABLE_CAPTURE') {
            window.__minerCaptureEnabled = false;
            console.log("[Miner Inject] Capture mode DISABLED");
        }
    });

    // Sayfa JS'i acilan pencerenin referansini kullanabilir (ornegin .focus()).
    // Pencereyi actirmadigimiz icin cagrilari yutan zararsiz bir taklit donduruyoruz.
    // Yakalanan istegi content script'e bildir
    function istekYakalandi(detay) {
        window.dispatchEvent(new CustomEvent('minerUrlCaptured', { detail: detay }));
    }

    // Form gonderimini istege cevir (SGK tarzi: target="_blank" ile POST)
    function formuYakala(form) {
        try {
            const alanlar = new URLSearchParams();
            for (const [k, v] of new FormData(form).entries()) {
                if (typeof v === 'string') alanlar.set(k, v);
            }
            istekYakalandi({
                url: form.action,
                method: (form.method || 'GET').toUpperCase(),
                body: alanlar.toString()
            });
        } catch (e) {
            console.error("[Miner Inject] Form yakalanamadi:", e);
            istekYakalandi({ url: null });
        }
    }

    function sahtePencere() {
        const bos = function () { };
        return {
            focus: bos, blur: bos, close: bos, print: bos, closed: false,
            document: { write: bos, writeln: bos, close: bos, open: bos },
            location: { href: '', replace: bos, assign: bos, reload: bos },
            opener: null, name: '', history: { back: bos, forward: bos }
        };
    }

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

    // ============ window.open INTERCEPT (odak çalmayı kaynağında azalt) ============
    // GİB/SGK/E-Beyanname PDF'i genelde window.open ile yeni pencere/sekmede açıyor,
    // tarayıcı da bunu otomatik öne getiriyor. Pencereyi engellemek yerine (site JS'i
    // referansı kullanıyor olabilir, kırılma riski var), açılır açılmaz odağı geri alıyoruz.
    const originalWindowOpen = window.open;
    window.open = function (url, ...rest) {
        // YAKALAMA MODU (GIB): pencereyi hic acma. Adresi content script'e ver,
        // o sessizce fetch etsin. Pencere yaratilmadigi icin odak da calinmaz.
        if (window.__minerCaptureEnabled) {
            try {
                // about:blank ile acilan pencere genelde sonradan form hedefi olur;
                // gercek istek o formun submit'inde gelir, burada bildirme.
                const ham = String(url || '');
                if (!ham || ham === 'about:blank') {
                    console.log("[Miner Inject] about:blank penceresi engellendi, form bekleniyor");
                    return sahtePencere();
                }
                const mutlak = new URL(ham, document.baseURI).href;
                console.log("[Miner Inject] URL yakalandi, pencere acilmadi:", mutlak);
                istekYakalandi({ url: mutlak, method: 'GET' });
            } catch (e) {
                console.error("[Miner Inject] URL yakalanamadi:", e);
                istekYakalandi({ url: null });
            }
            return sahtePencere();
        }

        const newWin = originalWindowOpen.call(this, url, ...rest);
        if (window.__minerFocusGuardEnabled && newWin) {
            try { newWin.blur(); } catch (e) { }
            try { window.focus(); } catch (e) { }
        }
        return newWin;
    };

    // ============ FORM SUBMIT INTERCEPT (yakalama modunda) ============
    // SGK/E-Beyanname tarzi siteler PDF'i target="_blank" form POST'u ile aciyor.
    // Yakalama modunda formu GONDERMIYORUZ; istegi content script fetch ediyor.
    const origFormSubmit = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function () {
        if (window.__minerCaptureEnabled) {
            console.log("[Miner Inject] form.submit() yakalandi, gonderilmedi:", this.action);
            formuYakala(this);
            return;
        }
        return origFormSubmit.apply(this, arguments);
    };

    document.addEventListener('submit', function (e) {
        if (!window.__minerCaptureEnabled) return;
        console.log("[Miner Inject] submit olayi yakalandi, engellendi:", e.target && e.target.action);
        e.preventDefault();
        e.stopImmediatePropagation();
        formuYakala(e.target);
    }, true);

    console.log("[Miner Inject] Setup complete - window.open + form submit yakalama hazir!");
})();
