# SPIDEY secret theme
1. Run supabase-spidey-secret-theme.sql in the Supabase SQL Editor (creates the theme with code SPIDEY).
2. Deploy. Customers enter SPIDEY on the secret code field; admin screens are never themed.
3. In Admin > Secret code you can edit it like the Chiikawa theme (preset "Spidey web-slinger").
Edit src/spidey.src.css, then regenerate: H='html[data-secret-theme="on"][data-secret-preset="spidey"]'; sed -e "s|@T|$H[data-yn-theme]:root|g" -e "s|@H|$H|g" src/spidey.src.css > src/spidey.css
Not built or tested here (no network to npm install): run npm run build once to confirm.
