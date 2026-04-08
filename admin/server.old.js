const express  = require('express');
const multer   = require('multer');
const fs       = require('fs');
const path     = require('path');
const crypto   = require('crypto');
const { exec } = require('child_process');

const app     = express();
const PORT    = 4000;
const WEB_DIR = path.resolve(__dirname, '..');
const IMG_DIR = path.join(WEB_DIR, 'images');

// ── Auth ──────────────────────────────────────────────────────
const ADMIN_USER = 'antonio';
const ADMIN_HASH = crypto.createHash('sha256').update('pelizzeri2026').digest('hex');
const sessions   = new Map();

function auth(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (!token) return res.status(401).json({ error: 'No token' });
  const exp = sessions.get(token);
  if (!exp || exp < Date.now()) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Session expired' });
  }
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
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'panel.html')));
app.use('/images', express.static(IMG_DIR));

// ── Login ─────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && crypto.createHash('sha256').update(password || '').digest('hex') === ADMIN_HASH) {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + 24 * 60 * 60 * 1000);
    return res.json({ token });
  }
  res.status(401).json({ error: 'Username ya password galat hai.' });
});
app.post('/api/logout', auth, (req, res) => { sessions.delete(req.headers['x-auth-token']); res.json({ ok: true }); });
app.get('/api/check', auth, (req, res) => res.json({ ok: true }));

// ── Images ────────────────────────────────────────────────────
app.get('/api/images/:section', auth, (req, res) => {
  const dir = sectionDir(req.params.section);
  if (!dir) return res.status(400).json({ error: 'Invalid section' });
  if (!fs.existsSync(dir)) return res.json([]);
  res.json(fs.readdirSync(dir).filter(f => /\.(jpe?g|png|webp|gif|svg)$/i.test(f)));
});
app.post('/api/upload/:section', auth, upload.array('images', 30), (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: 'No files' });
  generateManifest();
  res.json({ uploaded: req.files.map(f => f.filename) });
});
app.delete('/api/images/:section/:name', auth, (req, res) => {
  const p = safeImg(req.params.section, decodeURIComponent(req.params.name));
  if (!p) return res.status(400).json({ error: 'Invalid' });
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'Not found' });
  fs.unlinkSync(p);
  generateManifest();
  res.json({ ok: true });
});

app.post('/api/move-image', auth, (req, res) => {
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
app.get('/api/page-images/:section', auth, (req, res) => {
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
app.post('/api/apply-image', auth, (req, res) => {
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

// ── Files ─────────────────────────────────────────────────────
app.get('/api/files', auth, (req, res) => {
  res.json(fs.readdirSync(WEB_DIR).filter(f => f.endsWith('.html') && f !== 'panel.html'));
});
app.get('/api/files/:name', auth, (req, res) => {
  const p = safeFile(req.params.name);
  if (!p || !fs.existsSync(p)) return res.status(404).json({ error: 'Not found' });
  res.json({ content: fs.readFileSync(p, 'utf-8') });
});
app.post('/api/files/:name', auth, (req, res) => {
  const p = safeFile(req.params.name);
  if (!p || typeof req.body.content !== 'string') return res.status(400).json({ error: 'Invalid' });
  fs.writeFileSync(p, req.body.content, 'utf-8');
  res.json({ ok: true });
});

// ── Deploy SSE ────────────────────────────────────────────────
app.post('/api/deploy', auth, (req, res) => {
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
const ABOUT_SLOTS_FILE = path.join(IMG_DIR, 'about-slots.json');
function readAboutSlots() {
  try { return JSON.parse(fs.readFileSync(ABOUT_SLOTS_FILE, 'utf-8')); }
  catch { return { hero: null, portrait: null, studio: null }; }
}
function writeAboutSlots(slots) {
  fs.writeFileSync(ABOUT_SLOTS_FILE, JSON.stringify(slots, null, 2));
}

const CONTACT_SLOTS_FILE = path.join(IMG_DIR, 'contact-slots.json');
function readContactSlots() {
  try { return JSON.parse(fs.readFileSync(CONTACT_SLOTS_FILE, 'utf-8')); }
  catch { return { hero: null, exhibition: null, studio: null }; }
}
function writeContactSlots(slots) {
  fs.writeFileSync(CONTACT_SLOTS_FILE, JSON.stringify(slots, null, 2));
}

function generateManifest() {
  const manifest = {};
  SECTIONS.forEach(s => {
    const dir = path.join(IMG_DIR, s);
    manifest[s] = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter(f => /\.(jpe?g|png|webp|gif|svg)$/i.test(f))
      : [];
  });
  manifest.aboutSlots = readAboutSlots();
  manifest.contactSlots = readContactSlots();
  fs.writeFileSync(path.join(IMG_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

// ── About Slots (hero / portrait / studio) ────────────────────
const ABOUT_SLOT_NAMES = ['hero', 'portrait', 'studio'];
const aboutSlotUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const dir = path.join(IMG_DIR, 'about');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(req, file, cb) {
      const slot = req.params.slot;
      const ext = path.extname(file.originalname);
      cb(null, `about-${slot}${ext}`);
    }
  }),
  fileFilter(req, file, cb) {
    /\.(jpe?g|png|webp|gif|svg)$/i.test(file.originalname) ? cb(null, true) : cb(new Error('Images only'), false);
  },
  limits: { fileSize: 30 * 1024 * 1024 }
});

app.post('/api/about-slot/:slot', auth, aboutSlotUpload.single('image'), (req, res) => {
  const slot = req.params.slot;
  if (!ABOUT_SLOT_NAMES.includes(slot)) return res.status(400).json({ error: 'Invalid slot' });
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const slots = readAboutSlots();
  // Delete old file for this slot if different
  if (slots[slot] && slots[slot] !== req.file.filename) {
    const old = path.join(IMG_DIR, 'about', slots[slot]);
    if (fs.existsSync(old)) fs.unlinkSync(old);
  }
  slots[slot] = req.file.filename;
  writeAboutSlots(slots);
  generateManifest();
  res.json({ ok: true, filename: req.file.filename });
});
app.delete('/api/about-slot/:slot', auth, (req, res) => {
  const slot = req.params.slot;
  if (!ABOUT_SLOT_NAMES.includes(slot)) return res.status(400).json({ error: 'Invalid slot' });
  const slots = readAboutSlots();
  if (slots[slot]) {
    const p = path.join(IMG_DIR, 'about', slots[slot]);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    slots[slot] = null;
    writeAboutSlots(slots);
    generateManifest();
  }
  res.json({ ok: true });
});
app.get('/api/about-slots', auth, (req, res) => {
  res.json(readAboutSlots());
});

// ── Contact Slots (hero / exhibition / studio) ────────────────
const CONTACT_SLOT_NAMES = ['hero', 'exhibition', 'studio'];
const contactSlotUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const dir = path.join(IMG_DIR, 'contact');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(req, file, cb) {
      const slot = req.params.slot;
      const ext = path.extname(file.originalname);
      cb(null, `contact-${slot}${ext}`);
    }
  }),
  fileFilter(req, file, cb) {
    /\.(jpe?g|png|webp|gif|svg)$/i.test(file.originalname) ? cb(null, true) : cb(new Error('Images only'), false);
  },
  limits: { fileSize: 30 * 1024 * 1024 }
});

app.post('/api/contact-slot/:slot', auth, contactSlotUpload.single('image'), (req, res) => {
  const slot = req.params.slot;
  if (!CONTACT_SLOT_NAMES.includes(slot)) return res.status(400).json({ error: 'Invalid slot' });
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const slots = readContactSlots();
  if (slots[slot] && slots[slot] !== req.file.filename) {
    const old = path.join(IMG_DIR, 'contact', slots[slot]);
    if (fs.existsSync(old)) fs.unlinkSync(old);
  }
  slots[slot] = req.file.filename;
  writeContactSlots(slots);
  generateManifest();
  res.json({ ok: true, filename: req.file.filename });
});
app.delete('/api/contact-slot/:slot', auth, (req, res) => {
  const slot = req.params.slot;
  if (!CONTACT_SLOT_NAMES.includes(slot)) return res.status(400).json({ error: 'Invalid slot' });
  const slots = readContactSlots();
  if (slots[slot]) {
    const p = path.join(IMG_DIR, 'contact', slots[slot]);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    slots[slot] = null;
    writeContactSlots(slots);
    generateManifest();
  }
  res.json({ ok: true });
});
app.get('/api/contact-slots', auth, (req, res) => {
  res.json(readContactSlots());
});

// ── Init ──────────────────────────────────────────────────────
SECTIONS.forEach(s => fs.mkdirSync(path.join(IMG_DIR, s), { recursive: true }));
generateManifest();
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║   A. PELIZZERI  —  Admin Panel Ready     ║
║   http://localhost:${PORT}                    ║
║   Username : antonio                     ║
║   Password : pelizzeri2026               ║
╚══════════════════════════════════════════╝`);
});
