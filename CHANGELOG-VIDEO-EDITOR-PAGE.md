# Video Editor: own page in Admin
The editor lives at /admin/video (src/AdminVideoEditor.tsx). It is now:
- in the admin side menu right under Dashboard ("Video Editor"), no longer hidden in a Studio group
- a tile on the admin Dashboard
Edited: src/main.tsx
Not checked: npm run build (no network here). If the live site does not show it, the new build probably did not deploy: check the Render build log.

## Build fix (Render TS2339 errors)
src/AdminVideoEditor.tsx line 22: the green-screen canvas context was typed as a generic RenderingContext, which broke `tsc -b` (clearRect / drawImage / getImageData / putImageData). It is now typed as CanvasRenderingContext2D. This was the reason the deploy failed and the old site stayed live.
