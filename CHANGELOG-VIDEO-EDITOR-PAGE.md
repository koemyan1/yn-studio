# Video Editor: own page in Admin
The editor lives at /admin/video (src/AdminVideoEditor.tsx). It is now:
- in the admin side menu right under Dashboard ("Video Editor"), no longer hidden in a Studio group
- a tile on the admin Dashboard
Edited: src/main.tsx
Not checked: npm run build (no network here). If the live site does not show it, the new build probably did not deploy: check the Render build log.
