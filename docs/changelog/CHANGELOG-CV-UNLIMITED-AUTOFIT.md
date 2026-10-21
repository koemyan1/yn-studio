# CV maker: unlimited items + auto-fit

- Education, experience, skills, soft skills, languages, certificates, achievements and references: no more limit (the old caps were 2-8). References were also cut to 2 on the page; now all show.
- Summary / About / descriptions / school / company etc: no character limits (name, job title and contact lines keep their limits because they sit in the fixed header).
- Auto-fit: when a column is longer than the page, its contents shrink just enough to fit (down to 20%). Works in the editor, the preview and the PDF.
- The red "goes past the bottom" warning now only shows if it would not fit even at the smallest size.

## Work experience or Achievements
In the CV maker form, designs that have a work-experience section now show two buttons: **Work experience** / **Achievements**. The customer picks one; the CV shows that section (heading changes to "Achievements") in the same spot and layout. Achievements have a title, years and a description. The other one is kept but not shown, so they can switch back. The "Modern arch" design already has its own achievements section, so it has no switch.

## Save as PDF = real download
"Save as PDF" now downloads a PDF file straight away (no print dialog) containing only the CV page. New file `src/pdfSave.ts`, new dependency `html-to-image` (run `npm install`; Render does it on deploy). The PDF is a picture of the page (sharp, 2.5x), so text in it can't be selected. If a device cannot do the direct save, it falls back to the old print dialog.

## Server
`server/index.js`: /api now answers cross-origin calls (CORS), so payments work from ynstudio.site as well as the old onrender.com address.
