# CV maker: short CVs now fill the page

Before: auto-fit only shrank long content. A CV with little experience/education left a big empty gap at the bottom.
Now: auto-fit also grows. If a column is shorter than the page, its contents (text, spacing, bars) are enlarged, up to 130%, as far as they still fit above the bottom margin. Long CVs still shrink as before (down to 20%).
- Only real content columns grow (not the name/title header, the photo or small boxes).
- Works in the editor, the preview and the PDF (same code).
File: src/cvTemplates.tsx (CvSheet, `GROW`). Change `GROW = 1.3` to make it grow more/less.
