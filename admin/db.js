const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'pelizzeri.db');
const db = new Database(DB_PATH);

// ── Enable WAL mode for performance ──
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ══════════════════════════════════════════════════════════════
// SCHEMA
// ══════════════════════════════════════════════════════════════
db.exec(`
  -- Users table (login credentials)
  CREATE TABLE IF NOT EXISTS users (
    id        INTEGER PRIMARY KEY,
    username  TEXT UNIQUE NOT NULL,
    password  TEXT NOT NULL,
    created   TEXT DEFAULT (datetime('now'))
  );

  -- Sessions table (replaces in-memory Map)
  CREATE TABLE IF NOT EXISTS sessions (
    token    TEXT PRIMARY KEY,
    user_id  INTEGER NOT NULL,
    expires  INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Image slots (about + contact named slots)
  CREATE TABLE IF NOT EXISTS image_slots (
    page     TEXT NOT NULL,
    slot     TEXT NOT NULL,
    filename TEXT,
    updated  TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (page, slot)
  );

  -- Site content (editable text blocks)
  CREATE TABLE IF NOT EXISTS content (
    key      TEXT PRIMARY KEY,
    value    TEXT NOT NULL,
    updated  TEXT DEFAULT (datetime('now'))
  );

  -- Exhibitions / Percorso items
  CREATE TABLE IF NOT EXISTS exhibitions (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    year     TEXT NOT NULL,
    title    TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
  );
`);

// ══════════════════════════════════════════════════════════════
// SEED defaults (only if tables are empty)
// ══════════════════════════════════════════════════════════════
function seed() {
    // Default admin user
    const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    if (userCount === 0) {
        const hash = crypto.createHash('sha256').update('pelizzeri2026').digest('hex');
        db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run('antonio', hash);
    }

    // Default about slots
    const slotCount = db.prepare('SELECT COUNT(*) AS c FROM image_slots').get().c;
    if (slotCount === 0) {
        const ins = db.prepare('INSERT OR IGNORE INTO image_slots (page, slot, filename) VALUES (?, ?, ?)');
        ins.run('about', 'hero', null);
        ins.run('about', 'portrait', null);
        ins.run('about', 'studio', null);
        ins.run('contact', 'hero', null);
        ins.run('contact', 'exhibition', null);
        ins.run('contact', 'studio', null);
    }

    // Default content
    const contentCount = db.prepare('SELECT COUNT(*) AS c FROM content').get().c;
    if (contentCount === 0) {
        const ins = db.prepare('INSERT OR IGNORE INTO content (key, value) VALUES (?, ?)');
        // About page
        ins.run('about_title', 'About');
        ins.run('about_name', 'Antonio Pelizzeri');
        ins.run('about_bio_1', "Architetto laureato presso la Facoltà di Architettura di Napoli nell'anno accademico 1982/1983. Già prima del conseguimento della laurea, ha maturato esperienze professionali collaborando con importanti studi di ingegneria di Napoli, partecipando alla progettazione di ville nel territorio campano.");
        ins.run('about_bio_2', "Nel maggio 1985 ha conseguito l'abilitazione professionale e si è iscritto all'Ordine degli Architetti delle Province di Napoli e Isernia. Ha vinto il concorso a cattedra nella Regione Campania per la disciplina di Costruzioni e Tecnologia delle Costruzioni. Nel 2018 ha conseguito la cattedra di Disegno e Rilievo, insegnando Disegno e Storia dell'Arte presso i licei.");
        ins.run('about_bio_3', "Parallelamente all'attività professionale, ha sempre coltivato un profondo interesse per la pittura, sviluppando una ricerca personale orientata verso il linguaggio grafico moderno e astratto. I segni geometrici si muovono nella solitudine di uno spazio vuoto, legati tra loro come lettere che comunicano agli altri il proprio io. Il colore è l'altro grande protagonista: effetti cromatici apparentemente contrapposti che danno origine a emozioni svariate.");
        // Contact / studio
        ins.run('studio_title', 'STUDIO — ANTONIO PELIZZERI');
        ins.run('studio_location', 'Lo studio è situato a Napoli, Italia.');
        ins.run('studio_cta', 'Per informazioni e appuntamenti:');
        ins.run('studio_email', 'info@antoniopelizzeri.it');
        // Home page
        ins.run('hero_subtitle', 'Architettura · Pittura · Napoli');
        ins.run('hero_name', 'ANTONIO PELIZZERI');
        ins.run('home_intro', "Architetto laureato presso la Facoltà di Architettura di Napoli, pittore e docente di Disegno e Storia dell'Arte. La sua pittura ha una forte e inconfondibile identità, fatta di segno e di colore. I suoi disegni nascono da un'improvvisa e irruente ricerca del segno — forme geometriche che avanzano in uno spazio vuoto, legate tra loro come parole di un discorso organico che comunica emozioni e stati d'animo.");
        ins.run('quote_text', "I miei disegni nascono spesso da un'improvvisa e irruente ricerca del segno.");
        ins.run('quote_author', 'Antonio Pelizzeri');
        // Exhibition
        ins.run('exhibition_label', 'Current Exhibition');
        ins.run('exhibition_title', 'Layers of Silence');
        ins.run('exhibition_details', 'Galerie Neue Kunst, Düsseldorf\n15 March — 30 May 2026');
        // Footer
        ins.run('footer_tagline', 'Architetto e pittore con sede a Napoli, Italia. Docente di Disegno e Storia dell\'Arte.');
    }

    // Default exhibitions
    const exhCount = db.prepare('SELECT COUNT(*) AS c FROM exhibitions').get().c;
    if (exhCount === 0) {
        const ins = db.prepare('INSERT INTO exhibitions (year, title, sort_order) VALUES (?, ?, ?)');
        ins.run('2018', 'Cattedra di Disegno e Rilievo — Docente di Disegno e Storia dell\'Arte presso i Licei, Campania', 1);
        ins.run('1985', 'Abilitazione Professionale — Ordine degli Architetti, Province di Napoli e Isernia', 2);
        ins.run('1985', 'Concorso a Cattedra, Regione Campania — Costruzioni e Tecnologia delle Costruzioni', 3);
        ins.run('1982–83', 'Laurea in Architettura — Facoltà di Architettura di Napoli', 4);
        ins.run('Tesi', 'Progettazione di un centro turistico a Marina di Tricase, relatore Arch. Antonio Rossetti', 5);
        ins.run('Ricerca', 'Pittura e design di arredo — ricerca personale nel linguaggio grafico moderno e astratto', 6);
    }
}
seed();

// ══════════════════════════════════════════════════════════════
// AUTH helpers
// ══════════════════════════════════════════════════════════════
const auth = {
    verify(username, passwordHash) {
        const u = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, passwordHash);
        return u || null;
    },
    createSession(userId) {
        const token = crypto.randomBytes(32).toString('hex');
        const expires = Date.now() + 24 * 60 * 60 * 1000;
        db.prepare('INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)').run(token, userId, expires);
        return token;
    },
    checkSession(token) {
        if (!token) return false;
        const s = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
        if (!s || s.expires < Date.now()) {
            db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
            return false;
        }
        return true;
    },
    deleteSession(token) {
        db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    },
    cleanExpired() {
        db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
    },
    changePassword(username, newHash) {
        db.prepare('UPDATE users SET password = ? WHERE username = ?').run(newHash, username);
    },
    getByToken(token) {
        const s = db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token);
        if (!s) return null;
        return db.prepare('SELECT * FROM users WHERE id = ?').get(s.user_id);
    },
    invalidateOtherSessions(userId, keepToken) {
        db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(userId, keepToken);
    }
};

// ══════════════════════════════════════════════════════════════
// IMAGE SLOTS helpers
// ══════════════════════════════════════════════════════════════
const slots = {
    get(page) {
        const rows = db.prepare('SELECT slot, filename FROM image_slots WHERE page = ?').all(page);
        const obj = {};
        rows.forEach(r => obj[r.slot] = r.filename);
        return obj;
    },
    set(page, slot, filename) {
        db.prepare(`INSERT INTO image_slots (page, slot, filename, updated) VALUES (?, ?, ?, datetime('now'))
                ON CONFLICT(page, slot) DO UPDATE SET filename = excluded.filename, updated = excluded.updated`)
            .run(page, slot, filename);
    },
    clear(page, slot) {
        db.prepare('UPDATE image_slots SET filename = NULL, updated = datetime(\'now\') WHERE page = ? AND slot = ?').run(page, slot);
    }
};

// ══════════════════════════════════════════════════════════════
// CONTENT helpers
// ══════════════════════════════════════════════════════════════
const content = {
    get(key) {
        const row = db.prepare('SELECT value FROM content WHERE key = ?').get(key);
        return row ? row.value : null;
    },
    getAll() {
        const rows = db.prepare('SELECT key, value FROM content').all();
        const obj = {};
        rows.forEach(r => obj[r.key] = r.value);
        return obj;
    },
    set(key, value) {
        db.prepare(`INSERT INTO content (key, value, updated) VALUES (?, ?, datetime('now'))
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated = excluded.updated`)
            .run(key, value);
    },
    setMany(updates) {
        const stmt = db.prepare(`INSERT INTO content (key, value, updated) VALUES (?, ?, datetime('now'))
                             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated = excluded.updated`);
        const tx = db.transaction((items) => {
            for (const [k, v] of Object.entries(items)) {
                stmt.run(k, v);
            }
        });
        tx(updates);
    }
};

// ══════════════════════════════════════════════════════════════
// EXHIBITIONS helpers
// ══════════════════════════════════════════════════════════════
const exhibitions = {
    getAll() {
        return db.prepare('SELECT * FROM exhibitions ORDER BY sort_order ASC').all();
    },
    add(year, title) {
        const max = db.prepare('SELECT COALESCE(MAX(sort_order),0) + 1 AS n FROM exhibitions').get().n;
        return db.prepare('INSERT INTO exhibitions (year, title, sort_order) VALUES (?, ?, ?)').run(year, title, max);
    },
    update(id, year, title) {
        db.prepare('UPDATE exhibitions SET year = ?, title = ? WHERE id = ?').run(year, title, id);
    },
    remove(id) {
        db.prepare('DELETE FROM exhibitions WHERE id = ?').run(id);
    },
    reorder(ids) {
        const stmt = db.prepare('UPDATE exhibitions SET sort_order = ? WHERE id = ?');
        const tx = db.transaction((list) => {
            list.forEach((id, i) => stmt.run(i + 1, id));
        });
        tx(ids);
    }
};

module.exports = { db, auth, slots, content, exhibitions };
