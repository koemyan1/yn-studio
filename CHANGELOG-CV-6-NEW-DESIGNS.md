# CV maker: 6 new designs (13 in total)

New designs (picked on the first screen of the CV maker, shown blank like the others):
| key | name in the picker | based on |
|---|---|---|
| sacha | Navy curve | navy sidebar with a curved edge, photo blob, timeline |
| olivia | Crimson diagonal | red panel with a diagonal top, round photo, references |
| sanchez | Slate arch | slate header, capsule with photo + contact, pill headings |
| thomas | Teal rounded | big teal panel, "Curriculum Vitae" tab, duties list |
| adam | Charcoal band | dark band with round photo, grey side column, icon headings |
| john | Sky blue wave | blue header, capsule photo, light-blue column, wave |

Details
- New section **Interests** (used by "Navy curve"): customers add interests in the form like soft skills. Stored as `interests` in the CV data (no database change).
- "Teal rounded": the job descriptions the customer types under Work experience are shown on the right under "Duties and responsibilities" (the left side lists company, role and years). Education has the optional Note field (for example GPA).
- "Charcoal band" and the two designs above also use the Note field of Education (GPA etc).
- English + Khmer headings for every new heading; "Curiculum Vitae" in the picture is spelled correctly as "Curriculum Vitae".
- Fonts: Anton, Playfair Display and Inter are added to the CV font loader (CvMaker.tsx `ensureCvFonts`).
- Auto-fit still works on every design. New: a column can set its own bottom limit (`data-limit`), used so the left side of "Teal rounded" always stays inside its teal panel.
- If a customer chooses Achievements instead of Work experience, it works on the new designs too (title on the bold line where the design has the job title first).
- Services page tag says "13 designs".

Files: src/cvTemplates.tsx, src/cvTemplates.css, src/CvMaker.tsx, src/Services.tsx, server/index.js (allowed template list), supabase-cv-maker.sql (comment only).

IMPORTANT: redeploy the SERVER too (server/index.js). Until it is redeployed the server would save any new design as the first one (rosa).
No SQL needs to be run.
