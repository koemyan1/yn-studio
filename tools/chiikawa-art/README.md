# Chiikawa art generators
Everything in `public/chiikawa/` was drawn by these two scripts (no internet images, no licensed artwork).

    python3 gen_art.py        # mascots, food/drink icons, sky, grass  -> SVG
    python3 gen_banners.py    # 1600x500 banners -> PNG (needs: pip install playwright && playwright install chromium, and ImageMagick `convert`)

To change banner words (e.g. "9-10 DAYS"), edit the `text(...)` lines in `gen_banners.py` and re-run, or simply
upload your own picture in Admin -> Secret Code -> Look -> Home banner.
