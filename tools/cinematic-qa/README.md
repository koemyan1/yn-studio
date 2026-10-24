# Cinematic invitation: browser checks

A framework-free test page for `src/cinematic/*` (envelope, opening, cover, sections) plus the scripts used to check it
in a real headless Chromium: screenshots at 320×568, 390×844, 740×360 and 1280×800, the envelope opening as a frame
sequence (animation clock frozen at exact times), console errors, elements wider than the screen, and the cover
fitting one screen.

```bash
npm i -D puppeteer                         # not a dependency of the site
# compile the cinematic module for the test page (from the project root)
npx tsc --ignoreConfig --target ES2022 --module ES2022 --moduleResolution bundler --lib ES2022,DOM --strict --skipLibCheck \
  --outDir tools/cinematic-qa/js src/cinematic/art.ts src/cinematic/cinematic.ts src/cinematic/sections.ts src/cinematic/types.ts src/cinematic/text.ts
sed -i -E "s#from '\./(art|sections|text|types)'#from './\1.js'#g" tools/cinematic-qa/js/*.js
cp src/cinematic/cinematic.css tools/cinematic-qa/
node tools/cinematic-qa/one.js 390 844 en "photo=1"          # envelope + opening + cover, measurements
node tools/cinematic-qa/frames.js 390 844 "photo=1" seq       # opening as frames (/tmp/h/fr)
node tools/cinematic-qa/flow.js 390 844 "full=1&photo=1" f    # scroll every section
```

Query options for the page: `lang=km|en`, `full=1` (every section with placeholder content), `photo=1`, `pv=0` (guest view, no
placeholders), `nodate=1`, `nolunar=1`, `novenue=1`, `g=`/`b=` (short names), `guest=` (name on the envelope), `pal=jade|silk|rose|navy` (palette presets, default jade), `paper=%23hex`, `foil=gold|rose|silver`.
The scripts expect the page files in `/tmp/h` (edit the paths at the top if you keep them elsewhere).
