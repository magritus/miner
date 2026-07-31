// SGK mantik testleri.
// content.js icindeki SAF fonksiyonlari GERCEK kaynak dosyadan cekip test eder
// (kopyasini degil) - boylece kod degisince test de onunla birlikte degisir.
const fs = require('fs');
const path = require('path');

const CONTENT = path.join(__dirname, '..', 'content.js');
const src = fs.readFileSync(CONTENT, 'utf8');

// Verilen isimli fonksiyonun tam govdesini kaynaktan ayikla
function extractFn(name) {
    const start = src.indexOf(`function ${name}(`);
    if (start === -1) throw new Error(`${name} bulunamadi`);
    let i = src.indexOf('{', start), depth = 0, end = -1;
    for (let j = i; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') { depth--; if (depth === 0) { end = j + 1; break; } }
    }
    return src.slice(start, end);
}

eval(extractFn('sanitizeFilename'));
eval(extractFn('filenameFromDisposition'));

// buildRequest icindeki gercek onclick regex'ini cek
const reMatch = src.match(/const m = onclick\.match\((\/islem.*?\/)\);/);
if (!reMatch) throw new Error('SGK onclick regex bulunamadi');
const ONCLICK_RE = eval(reMatch[1]);

const TIP_MAP = {
    TD: 'tahakkukonayliFisTahakkukPdf',
    HD: 'tahakkukonayliFisHizmetPdf',
    SHD: 'tahakkukonayliFisUcretGizliHizmetPdf'
};

let pass = 0, fail = 0;
const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) { pass++; console.log(`  OK   ${label}`); }
    else {
        fail++;
        console.log(`  FAIL ${label}`);
        console.log(`       beklenen: ${JSON.stringify(expected)}`);
        console.log(`       gelen   : ${JSON.stringify(actual)}`);
    }
};

console.log('\n=== SGK onclick parse (canli portal verisi) ===');
const parse = (oc) => {
    const m = oc.match(ONCLICK_RE);
    if (!m) return null;
    const tip = TIP_MAP[m[1]];
    if (!tip) return null;
    return { ekForm: m[1], ref: m[2], tip };
};

check("TD indirme", parse("return islem('TD','123456-2024-1')"),
    { ekForm: 'TD', ref: '123456-2024-1', tip: 'tahakkukonayliFisTahakkukPdf' });
check("HD indirme", parse("return islem('HD','123456-2024-1')"),
    { ekForm: 'HD', ref: '123456-2024-1', tip: 'tahakkukonayliFisHizmetPdf' });
check("SHD indirme", parse("return islem('SHD','123456-2024-1')"),
    { ekForm: 'SHD', ref: '123456-2024-1', tip: 'tahakkukonayliFisUcretGizliHizmetPdf' });
// Goruntuleme varyantlari popup aciyor -> null donup tiklama yoluna dusmeli
check("T goruntuleme -> null", parse("return islem('T','123456-2024-1')"), null);
check("H goruntuleme -> null", parse("return islem('H','123456-2024-1')"), null);
check("SH goruntuleme -> null", parse("return islem('SH','123456-2024-1')"), null);
check("alakasiz onclick -> null", parse("alert('merhaba')"), null);
check("bos onclick -> null", parse(""), null);
check("bosluklu yazim", parse("return islem( 'TD' , '123456-2024-1' )"),
    { ekForm: 'TD', ref: '123456-2024-1', tip: 'tahakkukonayliFisTahakkukPdf' });

console.log('\n=== Content-Disposition dosya adi ===');
check("duz filename", filenameFromDisposition('attachment; filename="tahakkuk.pdf"'), 'tahakkuk.pdf');
check("tirnaksiz", filenameFromDisposition('attachment; filename=tahakkuk.pdf'), 'tahakkuk.pdf');
check("UTF-8 kodlu (Turkce)", filenameFromDisposition("attachment; filename*=UTF-8''tahakkuk%20fi%C5%9Fi.pdf"), 'tahakkuk fişi.pdf');
check("baslik yok -> null", filenameFromDisposition(null), null);
check("filename yok -> null", filenameFromDisposition('attachment'), null);
check("tehlikeli karakter temizlenir", filenameFromDisposition('attachment; filename="a/b:c*d.pdf"'), 'a_b_c_d.pdf');

console.log('\n=== Dosya adi sanitize ===');
check("slash temizlenir", sanitizeFilename('ABC/DEF LTD'), 'ABC_DEF LTD');
check("uzun ad kirpilir (<=120)", sanitizeFilename('x'.repeat(200)).length, 120);
check("fallback ad", sanitizeFilename('2025-10_Tahakkuk.pdf'), '2025-10_Tahakkuk.pdf');

console.log(`\n${fail === 0 ? 'GECTI' : 'BASARISIZ'} — ${pass} gecti, ${fail} kaldi\n`);
process.exit(fail === 0 ? 0 : 1);
