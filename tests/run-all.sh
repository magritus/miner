#!/bin/bash
# Tum kontroller: sozdizimi + manifest + mantik testleri
# Kullanim:  bash tests/run-all.sh
cd "$(dirname "$0")/.." || exit 1

hata=0

echo "=== Sozdizimi ==="
for f in content.js inject.js background.js popup.js; do
    if node --check "$f" 2>/dev/null; then
        echo "  OK   $f"
    else
        echo "  FAIL $f"
        node --check "$f"
        hata=1
    fi
done

echo ""
echo "=== manifest.json ==="
if node -e "
const m = require('./manifest.json');
const cs = m.content_scripts;
if (!Array.isArray(cs) || cs.length < 2) throw new Error('content_scripts eksik');
const main = cs.find(c => c.world === 'MAIN');
if (!main) throw new Error('MAIN world content script yok (inject.js yuklenemez)');
if (main.run_at !== 'document_start') throw new Error('MAIN world document_start olmali');
// Chrome content_scripts icin taninmayan anahtari reddedebilir
const izinli = new Set(['matches','js','css','all_frames','world','run_at','match_about_blank','exclude_matches','include_globs','exclude_globs']);
cs.forEach((c,i) => {
  const fazla = Object.keys(c).filter(k => !izinli.has(k));
  if (fazla.length) throw new Error('content_scripts['+i+'] taninmayan anahtar: '+fazla);
});
console.log('  OK   gecerli JSON, MAIN world + document_start, taninmayan anahtar yok');
console.log('  surum: ' + m.version);
"; then :; else hata=1; fi

echo ""
echo "=== Mantik testleri ==="
for t in tests/test-logic.js tests/test-selectors.js tests/test-ebeyanname.js; do
    echo "--- $t"
    node "$t" || hata=1
done

echo ""
if [ "$hata" = "0" ]; then
    echo "TUM KONTROLLER GECTI"
else
    echo "BASARISIZ KONTROL VAR"
fi
exit $hata
