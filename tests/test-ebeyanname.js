// E-Beyanname adres kurma testleri.
// content.js icindeki GERCEK regexleri kaynaktan cekip test eder.
//
// Sayfanin kendi kodu (referans):
//   beyannameGoruntule(oid, arsivdenGoruntule, asAttachment)
//     -> dispatch?cmd=IMAJ&subcmd=BEYANNAMEGORUNTULE&TOKEN=..&beyannameOid=..
//   tahakkukGoruntule(oid, tahakkukOid, arsivdenGoruntule, asAttachment)
//     -> dispatch?cmd=IMAJ&subcmd=TAHAKKUKGORUNTULE&TOKEN=..&beyannameOid=..&tahakkukOid=..
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

function regexCek(ad) {
    const satir = src.split('\n').find(s => s.includes('onclick.match(/' + ad));
    if (!satir) throw new Error(ad + ' regex satiri bulunamadi');
    const m = satir.match(/onclick\.match\((\/.*\/)\)/);
    if (!m) throw new Error(ad + ' regex ayiklanamadi');
    return eval(m[1]);
}

const beyRe = regexCek('beyannameGoruntule');
const tahRe = regexCek('tahakkukGoruntule');

const TOKEN = 'TKN123';

// buildRequest'in karar mantigi (regexler gercek kaynaktan geliyor)
function kur(onclick) {
    let m = onclick.match(beyRe);
    if (m) {
        // Arsiv kalibi (getParameterForArsiv) bilinmiyor -> yedege birak
        if (m[2] !== 'false') return null;
        return `subcmd=BEYANNAMEGORUNTULE&TOKEN=${TOKEN}&beyannameOid=${m[1]}`;
    }
    m = onclick.match(tahRe);
    if (!m) return null;
    if (m[3] !== 'false') return null;
    return `subcmd=TAHAKKUKGORUNTULE&TOKEN=${TOKEN}&beyannameOid=${m[1]}&tahakkukOid=${m[2]}`;
}

let f = 0;
const c = (l, a, e) => {
    const ok = a === e;
    console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${l}`);
    if (!ok) { f++; console.log(`       beklenen: ${e}\n       gelen   : ${a}`); }
};

console.log('\n=== Adres kurma (canli portal onclick verileri) ===');
c('beyanname',
    kur("beyannameGoruntule('aaaa1111bbbb22',false,false)"),
    `subcmd=BEYANNAMEGORUNTULE&TOKEN=${TOKEN}&beyannameOid=aaaa1111bbbb22`);
c('tahakkuk (iki oid)',
    kur("tahakkukGoruntule('aaaa1111bbbb22','eeee5555ffff66',false,false)"),
    `subcmd=TAHAKKUKGORUNTULE&TOKEN=${TOKEN}&beyannameOid=aaaa1111bbbb22&tahakkukOid=eeee5555ffff66`);
c('beyanname bosluklu',
    kur("beyannameGoruntule( 'cccc3333dddd44' , false , false )"),
    `subcmd=BEYANNAMEGORUNTULE&TOKEN=${TOKEN}&beyannameOid=cccc3333dddd44`);

console.log('\n=== Yedege birakilmasi gerekenler (null donmeli) ===');
c('beyanname arsivden', kur("beyannameGoruntule('aaaa1111bbbb22',true,false)"), null);
c('tahakkuk arsivden', kur("tahakkukGoruntule('aaaa1111bbbb22','eeee5555ffff66',true,false)"), null);
c('taninmayan fonksiyon', kur("baskaBirSey('abc',false,false)"), null);
c('bos onclick', kur(""), null);

console.log(`\n${f === 0 ? 'GECTI' : 'BASARISIZ'} — ${f} hata\n`);
process.exit(f === 0 ? 0 : 1);
