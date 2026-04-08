const express  = require('express');
const multer   = require('multer');
const fs       = require('fs');
const path     = require('path');
const crypto   = require('crypto');
const { exec } = require('child_process');
const { auth: dbAuth, slots: dbSlots, content: dbContent, exhibitions: dbExh } = require('./db');

const app     = express();
const PORT    = process.env.PORT || 4000;
const WEB_DIR = path.resolve(__dirname, '..');
const IMG_DIR = path.join(WEB_DIR, 'images');

// ── Auth middleware ───────────────────────────────────────────
function authMw(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (!token) return res.status(401).json({ error: 'No token' });
  if (!dbAuth.checkSession(token)) return res.status(401).json({ error: 'Session expired' });
  next();
}

// ── Sections ──────────────────────────────────────────────────
const SECTIONS     = ['work','installation','studio','about','contact'];
const SECTION_HTML = { work:'work.html', installation:'installation.html', studio:'studio.html', about:'about.html', contact:'index.html' };

function sectionDir(s) {
  if (!SECTIONS.includes(s)) return null;
  return path.join(IMG_DIR, s);
}
function safeImg(section, name) {
  if (!name || /[/\\]/.test(name)) return null;
  const dir = sectionDir(section);
  if (!dir) return null;
  const p = path.resolve(dir, name);
  if (!p.startsWith(dir + path.sep)) return null;
  return p;
}
function safeFile(name) {
  if (!name || /[/\\]/.test(name) || !name.endsWith('.html')) return null;
  const p = path.resolve(WEB_DIR, name);
  if (!p.startsWith(WEB_DIR + path.sep) && p !== WEB_DIR) return null;
  return p;
}

// ── Multer ────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination(req, file, cb) {
    const sec = SECTIONS.includes(req.params.section) ? req.params.section : 'work';
    const dir = path.join(IMG_DIR, sec);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    cb(null, file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_'));
  }
});
const upload = multer({
  storage,
  fileFilter(req, file, cb) {
    /\.(jpe?g|png|webp|gif|svg)$/i.test(file.originalname) ? cb(null, true) : cb(new Error('Images only'), false);
  },
  limits: { fileSize: 30 * 1024 * 1024 }
});

app.use(express.json({ limit: '60mb' }));

// ── CORS (website → admin) ────────────────────────────────────
app.use((req, res, next) => {
  const allowed = ['http://localhost:5500','http://127.0.0.1:5500','http://localhost:3000'];
  const origin = req.headers.origin;
  if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Static ────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(WEB_DIR, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'panel.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'panel.html')));
app.use('/images', express.static(IMG_DIR));
app.use('/site', express.static(WEB_DIR));
app.use(express.static(WEB_DIR));

// ══════════════════════════════════════════════════════════════
// AUTH (SQLite)
// ══════════════════════════════════════════════════════════════
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const hash = crypto.createHash('sha256').update(password || '').digest('hex');
  const user = dbAuth.verify(username, hash);
  if (user) {
    const token = dbAuth.createSession(user.id);
    return res.json({ token });
  }
  res.status(401).json({ error: 'Username ya password galat hai.' });
});
app.post('/api/logout', authMw, (req, res) => { dbAuth.deleteSession(req.headers['x-auth-token']); res.json({ ok: true }); });
app.get('/api/check', authMw, (req, res) => res.json({ ok: true }));

app.post('/api/change-password', authMw, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Saare fields required hain.' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'Naya password kam az kam 8 characters ka hona chahiye.' });
  const user = dbAuth.getByToken(req.headers['x-auth-token']);
  if (!user) return res.status(401).json({ error: 'Session invalid hai.' });
  const currentHash = crypto.createHash('sha256').update(currentPassword).digest('hex');
  if (user.password !== currentHash) return res.status(401).json({ error: 'Purana password galat hai.' });
  const newHash = crypto.createHash('sha256').update(newPassword).digest('hex');
  dbAuth.changePassword(user.username, newHash);
  dbAuth.invalidateOtherSessions(user.id, req.headers['x-auth-token']);
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════
// IMAGES (gallery sections — work, installation, studio)
// ══════════════════════════════════════════════════════════════
app.get('/api/images/:section', authMw, (req, res) => {
  const dir = sectionDir(req.params.section);
  if (!dir) return res.status(400).json({ error: 'Invalid section' });
  if (!fs.existsSync(dir)) return res.json([]);
  res.json(fs.readdirSync(dir).filter(f => /\.(jpe?g|png|webp|gif|svg)$/i.test(f)));
});
app.post('/api/upload/:section', authMw, upload.array('images', 30), (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: 'No files' });
  generateManifest();
  res.json({ uploaded: req.files.map(f => f.filename) });
});
app.delete('/api/images/:section/:name', authMw, (req, res) => {
  const p = safeImg(req.params.section, decodeURIComponent(req.params.name));
  if (!p) return res.status(400).json({ error: 'Invalid' });
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'Not found' });
  fs.unlinkSync(p);
  generateManifest();
  res.json({ ok: true });
});
app.post('/api/move-image', authMw, (req, res) => {
  const { section, name, target } = req.body || {};
  if (!name || !SECTIONS.includes(target)) return res.status(400).json({ error: 'Invalid' });
  const src = safeImg(section, name);
  if (!src || !fs.existsSync(src)) return res.status(404).json({ error: 'Not found' });
  const destDir = path.join(IMG_DIR, target);
  fs.mkdirSync(destDir, { recursive: true });
  fs.renameSync(src, path.join(destDir, name));
  generateManifest();
  res.json({ ok: true });
});

// ── Page Images & Apply ───────────────────────────────────────
app.get('/api/page-images/:section', authMw, (req, res) => {
  const htmlFile = SECTION_HTML[req.params.section];
  if (!htmlFile) return res.status(400).json({ error: 'Invalid section' });
  const p = path.join(WEB_DIR, htmlFile);
  if (!fs.existsSync(p)) return res.json({ file: htmlFile, srcs: [] });
  const content = fs.readFileSync(p, 'utf-8');
  const srcs = [...new Set(
    [...content.matchAll(/src="([^"]+)"/g)].map(m => m[1]).filter(s => /\.(jpe?g|png|webp|gif|svg)/i.test(s))
  )];
  res.json({ file: htmlFile, srcs });
});
app.post('/api/apply-image', authMw, (req, res) => {
  const { section, newImage, oldSrc } = req.body || {};
  const htmlFile = SECTION_HTML[section];
  if (!htmlFile || !newImage || !oldSrc) return res.status(400).json({ error: 'Missing params' });
  const p = path.join(WEB_DIR, htmlFile);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'File not found' });
  const content = fs.readFileSync(p, 'utf-8');
  const esc = oldSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const updated = content.replace(new RegExp(`src="${esc}"`, 'g'), `src="images/${section}/${newImage}"`);
  if (updated === content) return res.status(400).json({ error: 'Image not found in page' });
  fs.writeFileSync(p, updated, 'utf-8');
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════
// IMAGE SLOTS (SQLite — about & contact named slots)
// ══════════════════════════════════════════════════════════════
const SLOT_PAGES = {
  about:   ['hero', 'portrait', 'studio'],
  contact: ['hero', 'exhibition', 'studio']
};

function makeSlotUpload(page) {
  return multer({
    storage: multer.diskStorage({
      destination(req, file, cb) {
        const dir = path.join(IMG_DIR, page);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename(req, file, cb) {
        const ext = path.extname(file.originalname);
        cb(null, `${page}-${req.params.slot}${ext}`);
      }
    }),
    fileFilter(req, file, cb) {
      /\.(jpe?g|png|webp|gif|svg)$/i.test(file.originalname) ? cb(null, true) : cb(new Error('Images only'), false);
    },
    limits: { fileSize: 30 * 1024 * 1024 }
  });
}

// Generic slot endpoints for both about & contact
['about', 'contact'].forEach(page => {
  const slotNames = SLOT_PAGES[page];
  const slotUpload = makeSlotUpload(page);

  app.get(`/api/${page}-slots`, authMw, (req, res) => {
    res.json(dbSlots.get(page));
  });

  app.post(`/api/${page}-slot/:slot`, authMw, slotUpload.single('image'), (req, res) => {
    const slot = req.params.slot;
    if (!slotNames.includes(slot)) return res.status(400).json({ error: 'Invalid slot' });
    if (!req.file) return res.status(400).json({ error: 'No file' });
    // Delete old file if different
    const current = dbSlots.get(page);
    if (current[slot] && current[slot] !== req.file.filename) {
      const old = path.join(IMG_DIR, page, current[slot]);
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }
    dbSlots.set(page, slot, req.file.filename);
    generateManifest();
    res.json({ ok: true, filename: req.file.filename });
  });

  app.delete(`/api/${page}-slot/:slot`, authMw, (req, res) => {
    const slot = req.params.slot;
    if (!slotNames.includes(slot)) return res.status(400).json({ error: 'Invalid slot' });
    const current = dbSlots.get(page);
    if (current[slot]) {
      const p = path.join(IMG_DIR, page, current[slot]);
      if (fs.existsSync(p)) fs.unlinkSync(p);
      dbSlots.clear(page, slot);
      generateManifest();
    }
    res.json({ ok: true });
  });
});

// ══════════════════════════════════════════════════════════════
// CONTENT API (SQLite — editable text)
// ══════════════════════════════════════════════════════════════
app.get('/api/content', authMw, (req, res) => {
  res.json(dbContent.getAll());
});
app.post('/api/content', authMw, (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== 'object') return res.status(400).json({ error: 'Invalid data' });
  dbContent.setMany(updates);
  generateManifest();
  res.json({ ok: true });
});
// Public endpoint for website pages (no auth)
app.get('/api/public/content', (req, res) => {
  res.json(dbContent.getAll());
});

// ══════════════════════════════════════════════════════════════
// EXHIBITIONS API (SQLite)
// ══════════════════════════════════════════════════════════════
app.get('/api/exhibitions', authMw, (req, res) => {
  res.json(dbExh.getAll());
});
app.post('/api/exhibitions', authMw, (req, res) => {
  const { year, title } = req.body || {};
  if (!year || !title) return res.status(400).json({ error: 'Year and title required' });
  const result = dbExh.add(year, title);
  res.json({ ok: true, id: result.lastInsertRowid });
});
app.put('/api/exhibitions/:id', authMw, (req, res) => {
  const { year, title } = req.body || {};
  if (!year || !title) return res.status(400).json({ error: 'Year and title required' });
  dbExh.update(Number(req.params.id), year, title);
  res.json({ ok: true });
});
app.delete('/api/exhibitions/:id', authMw, (req, res) => {
  dbExh.remove(Number(req.params.id));
  res.json({ ok: true });
});
// Public exhibitions
app.get('/api/public/exhibitions', (req, res) => {
  res.json(dbExh.getAll());
});

// ── Files ─────────────────────────────────────────────────────
app.get('/api/files', authMw, (req, res) => {
  res.json(fs.readdirSync(WEB_DIR).filter(f => f.endsWith('.html') && f !== 'panel.html'));
});
app.get('/api/files/:name', authMw, (req, res) => {
  const p = safeFile(req.params.name);
  if (!p || !fs.existsSync(p)) return res.status(404).json({ error: 'Not found' });
  res.json({ content: fs.readFileSync(p, 'utf-8') });
});
app.post('/api/files/:name', authMw, (req, res) => {
  const p = safeFile(req.params.name);
  if (!p || typeof req.body.content !== 'string') return res.status(400).json({ error: 'Invalid' });
  fs.writeFileSync(p, req.body.content, 'utf-8');
  res.json({ ok: true });
});

// ── Deploy SSE ────────────────────────────────────────────────
app.post('/api/deploy', authMw, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  const proc = exec('netlify deploy --prod --dir .', { cwd: WEB_DIR, env: { ...process.env } });
  const push = d => d.split('\n').forEach(l => { if (l.trim()) res.write(`data: ${l.replace(/\r/g,'')}\n\n`); });
  proc.stdout.on('data', push);
  proc.stderr.on('data', push);
  proc.on('close', code => { res.write(`data: __DONE__:${code}\n\n`); res.end(); });
});

// ── Manifest ─────────────────────────────────────────────────
function generateManifest() {
  const manifest = {};
  SECTIONS.forEach(s => {
    const dir = path.join(IMG_DIR, s);
    manifest[s] = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter(f => /\.(jpe?g|png|webp|gif|svg)$/i.test(f))
      : [];
  });
  manifest.aboutSlots = dbSlots.get('about');
  manifest.contactSlots = dbSlots.get('contact');
  manifest.content = dbContent.getAll();
  manifest.exhibitions = dbExh.getAll();
  fs.writeFileSync(path.join(IMG_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

// ── Init ──────────────────────────────────────────────────────
SECTIONS.forEach(s => fs.mkdirSync(path.join(IMG_DIR, s), { recursive: true }));
dbAuth.cleanExpired();
generateManifest();
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║   A. PELIZZERI  —  Admin Panel + SQLite DB       ║
║   http://localhost:${PORT}                            ║
║   Database : admin/pelizzeri.db                  ║
╚══════════════════════════════════════════════════╝`);
});
