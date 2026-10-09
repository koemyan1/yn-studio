import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const distPath = path.join(__dirname, '..', 'dist');

// Camera permission for the package scanner in the deployed app/PWA.
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(self)');
  next();
});
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use(express.static(distPath));
app.get('/{*splat}', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(distPath, 'index.html'));
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`YN Studio server listening on ${port}`));
