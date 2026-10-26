# CV maker: free AI helper for the intro text

- New button under "Short intro (About me)" and "Summary / Profile / About me": **Improve with AI (free)**. If the box is empty it says "Write it for me with AI" and writes a short profile from the job title.
- The customer sees the suggestion and chooses **Use this**, **Try again** or **Keep mine** (nothing changes until they tap Use this).
- Works for English and Khmer CVs (follows the CV language).
- Server: new `POST /api/cv/improve` (signed-in users only, 8 tries/minute and 40/hour per user). It calls Google Gemini's FREE tier.
- Setup (free, 2 minutes): get a key at https://aistudio.google.com/apikey and add `GEMINI_API_KEY` in Render > Environment, then redeploy the server. Optional `AI_MODEL`.
- No key, or free quota used up: the button still works with a basic clean-up (capital letters, spacing, full stop) and tells the customer the AI is resting. Nothing is ever charged.
- Only the intro text and job title are sent to the AI, never name, phone, email or photo.
Files: server/index.js, src/CvMaker.tsx, src/cv.css, .env.server.example
