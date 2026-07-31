// content.js ve popup.js icindeki SGK secicileri BIREBIR AYNI olmali.
//
// NEDEN ONEMLI: popup.js listeyi kendi secicisiyle kuruyor, kullanici satir
// seciyor ve secilen INDEKSLER content.js'e gonderiliyor. content.js de kendi
// secicisiyle ayni listeyi kuruyor. Seciciler ayrisirsa indeksler kayar ve
// YANLIS BELGELER inir - sessizce, hata vermeden.
const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
const content = fs.readFileSync(path.join(KOK, 'content.js'), 'utf8');
const popup = fs.readFileSync(path.join(KOK, 'popup.js'), 'utf8');

// Secici icinde kacisli tirnak (\') var; onlari da yakalamak gerekiyor
const grab = (src, label) => {
    const m = src.match(/document\.querySelectorAll\('(a\[onclick\*="islem(?:[^'\\]|\\.)*)'\)/);
    if (!m) throw new Error(`${label}: SGK secici bulunamadi`);
    return m[1];
};

// Kaynak metinde sablon soyle: islem(\'TD\'  -> once '(' sonra kacisli tirnak
const types = (sel) => [...sel.matchAll(/islem\(\\'([A-Z]+)\\'/g)].map(m => m[1]).sort();

const cSel = grab(content, 'content.js');
const pSel = grab(popup, 'popup.js');

let fail = 0;
const check = (label, ok, detail) => {
    if (ok) console.log(`  OK   ${label}`);
    else { fail++; console.log(`  FAIL ${label}${detail ? '\n       ' + detail : ''}`); }
};

console.log('\n=== SGK secici senkronizasyonu ===');
console.log(`  content.js : ${cSel}`);
console.log(`  popup.js   : ${pSel}\n`);

check('iki secici birebir ayni', cSel === pSel,
    cSel !== pSel ? `content=${cSel}\n       popup  =${pSel}` : '');

const cTypes = types(cSel);
const pTypes = types(pSel);

check('hedeflenen belge tipleri ayni', JSON.stringify(cTypes) === JSON.stringify(pTypes),
    `content=${cTypes} popup=${pTypes}`);
// SHD (S.Hizmet) ucret bilgisi icermiyor, kasitli olarak haric tutuldu
check('SHD (S.Hizmet) haric tutulmus', !cTypes.includes('SHD') && !pTypes.includes('SHD'),
    `content=${cTypes} popup=${pTypes}`);
check('TD ve HD hedefleniyor', cTypes.includes('TD') && cTypes.includes('HD'),
    `bulunan=${cTypes}`);

console.log(`\n${fail === 0 ? 'GECTI' : 'BASARISIZ'} — ${fail} hata\n`);
process.exit(fail === 0 ? 0 : 1);
