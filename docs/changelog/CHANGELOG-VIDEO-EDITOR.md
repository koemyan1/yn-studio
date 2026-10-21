# Admin video editor + doodle avatar
No SQL. Deploy, then Admin menu > Studio > Video Editor (/admin/video).
- Clips on a timeline: add many, trim start/end, split at the playhead, reorder, delete, speed 0.5-2x, volume, filters.
- Text, emoji and "My avatar" stickers with show/hide times, size, position, colour. Background music with volume.
- Aspect ratios 9:16, 1:1, 16:9. Export records the preview in real time and gives an MP4 (or WebM on browsers that cannot make MP4).
- public/avatar-doodle.svg is the doodle avatar (shown in the editor header and usable as a sticker).
Limits: runs in the browser, so long/4K videos are slow on phones; filters do not show on iPhone Safari; export needs the page kept open.

## Update: captions, transitions, green screen, avatar studio
- Auto captions (Make captions): speech-to-text runs in the browser (Whisper, downloaded from a CDN the first time, then cached). Languages: auto, English, Khmer, Chinese, Thai, Vietnamese. Every line is editable (text, start, end); style size/height/colour/box. Needs internet the first time and clips with sound.
- Transitions into each clip: fade through black, slide, zoom, wipe (length adjustable).
- Green screen per clip: pick the colour from the preview, strength, new background colour or picture.
- Avatar studio: change gesture (wave/thumbs-up/peace/point/OK), which hand, hand movement (wave/still/bounce/circle) and speed, expression, hair, skin, eyes, glasses, clothes, background. Saved in this browser. Save as PNG.
- The avatar is added to the whole video automatically (corner + size), talks with the voice, blinks, bounces, waves at the start and gives a thumbs-up at the end.
