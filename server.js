// ─────────────────────────────────────────────────────────────
//  CertVault Server — JSON File Database (no external DB needed)
//  Run: node server.js
//  Open: http://localhost:8080
// ─────────────────────────────────────────────────────────────
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = process.env.PORT || 8080;

// ─────────────────────────────────────────────────────────────
//  JSON FILE DATABASE
// ─────────────────────────────────────────────────────────────
const DB_FILE = path.join(__dirname, "certvault_data.json");

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const empty = { admins: [], events: [], students: [], templates: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(empty, null, 2));
    return empty;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ─────────────────────────────────────────────────────────────
//  CREATE DEFAULT ADMIN
// ─────────────────────────────────────────────────────────────
const _db = loadDB();
if (_db.admins.length === 0) {
  _db.admins.push({ id: 1, username: "admin", password: bcrypt.hashSync("admin2026", 10) });
  saveDB(_db);
  console.log("🏆 Default Admin Created: admin | admin2026");
}
console.log("✅ Database ready! Data stored in certvault_data.json");

// ─────────────────────────────────────────────────────────────
//  FILE UPLOAD SETUP
// ─────────────────────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) =>
    cb(null, Date.now() + "_" + file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")),
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// ─────────────────────────────────────────────────────────────
//  MIDDLEWARE
// ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "certvault_secret_2026",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 8 * 60 * 60 * 1000 },
  })
);
app.use("/uploads", express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, "public")));

// ─────────────────────────────────────────────────────────────
//  AUTH MIDDLEWARE
// ─────────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.session && req.session.adminId) return next();
  res.status(401).json({ error: "Unauthorized" });
}

// ─────────────────────────────────────────────────────────────
//  AUTH ROUTES
// ─────────────────────────────────────────────────────────────
app.get("/api/auth/me", (req, res) => {
  res.json({ loggedIn: !!(req.session && req.session.adminId) });
});

app.post("/api/auth/login", (req, res) => {
  const db = loadDB();
  const { username, password } = req.body;
  const admin = db.admins.find((a) => a.username === (username || "admin"));
  if (!admin || !bcrypt.compareSync(password, admin.password))
    return res.status(401).json({ error: "Invalid credentials" });
  req.session.adminId = admin.id;
  res.json({ success: true });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.post("/api/auth/change-password", requireAdmin, (req, res) => {
  const db = loadDB();
  const { currentPassword, newPassword } = req.body;
  const admin = db.admins.find((a) => a.id === req.session.adminId);
  if (!bcrypt.compareSync(currentPassword, admin.password))
    return res.status(401).json({ error: "Current password incorrect" });
  if (!newPassword || newPassword.length < 6)
    return res.status(400).json({ error: "Min 6 characters required" });
  admin.password = bcrypt.hashSync(newPassword, 10);
  saveDB(db);
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
//  STATS ROUTE
// ─────────────────────────────────────────────────────────────
app.get("/api/stats", (req, res) => {
  const db = loadDB();
  let total = 0;
  for (const ev of db.events) {
    const s = db.students.find((s) => s.eventId === ev.id);
    total += s?.names?.length || 0;
  }
  res.json({ events: db.events.length, certs: total, students: total });
});

// ─────────────────────────────────────────────────────────────
//  EVENT ROUTES
// ─────────────────────────────────────────────────────────────
app.get("/api/events", (req, res) => {
  const db = loadDB();
  const result = [...db.events].reverse().map((ev) => {
    const tpl = db.templates.find((t) => t.eventId === ev.id) || null;
    const stu = db.students.find((s) => s.eventId === ev.id);
    return { ...ev, templateFile: tpl?.filename || null, nameConfig: tpl, studentCount: stu?.names?.length || 0 };
  });
  res.json(result);
});

app.post("/api/events", requireAdmin, (req, res) => {
  const db = loadDB();
  const { name, date } = req.body;
  const id = "ev_" + Date.now();
  db.events.push({ id, name: name.trim(), date: date?.trim() || "—", created_at: new Date().toISOString() });
  saveDB(db);
  res.json({ success: true, id });
});

app.delete("/api/events/:id", requireAdmin, (req, res) => {
  const db = loadDB();
  const { id } = req.params;
  db.events = db.events.filter((e) => e.id !== id);
  db.students = db.students.filter((s) => s.eventId !== id);
  db.templates = db.templates.filter((t) => t.eventId !== id);
  saveDB(db);
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
//  TEMPLATE ROUTES
// ─────────────────────────────────────────────────────────────
app.post("/api/templates/:eventId", requireAdmin, upload.single("template"), (req, res) => {
  const db = loadDB();
  const { eventId } = req.params;
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const existing = db.templates.findIndex((t) => t.eventId === eventId);
  const tpl = {
    eventId,
    filename: req.file.filename,
    name_x: req.body.name_x || null,
    name_y: req.body.name_y || null,
    font_size: parseInt(req.body.font_size) || 72,
    font_color: req.body.font_color || "#1a1a2e",
    font_family: req.body.font_family || "Playfair Display",
    text_align: req.body.text_align || "center",
  };
  if (existing >= 0) db.templates[existing] = tpl;
  else db.templates.push(tpl);
  saveDB(db);
  res.json({ success: true, filename: req.file.filename });
});

app.put("/api/templates/:eventId/config", requireAdmin, (req, res) => {
  const db = loadDB();
  const idx = db.templates.findIndex((t) => t.eventId === req.params.eventId);
  if (idx >= 0) db.templates[idx] = { ...db.templates[idx], ...req.body };
  saveDB(db);
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
//  STUDENT ROUTES
// ─────────────────────────────────────────────────────────────
app.get("/api/students/:eventId", requireAdmin, (req, res) => {
  const db = loadDB();
  const s = db.students.find((s) => s.eventId === req.params.eventId);
  res.json(s?.names || []);
});

app.post("/api/students/:eventId", requireAdmin, (req, res) => {
  const db = loadDB();
  const { eventId } = req.params;
  const { names } = req.body;
  const cleaned = [...new Set(names.map((n) => String(n).trim()).filter(Boolean))];
  const idx = db.students.findIndex((s) => s.eventId === eventId);
  if (idx >= 0) db.students[idx].names = cleaned;
  else db.students.push({ eventId, names: cleaned });
  saveDB(db);
  res.json({ success: true, count: cleaned.length });
});

// ─────────────────────────────────────────────────────────────
//  SEARCH ROUTE
// ─────────────────────────────────────────────────────────────
app.get("/api/search", (req, res) => {
  const db = loadDB();
  const q = (req.query.q || "").trim().toLowerCase();
  if (q.length < 2) return res.json([]);
  const results = [];
  for (const group of db.students) {
    const ev = db.events.find((e) => e.id === group.eventId);
    const tpl = db.templates.find((t) => t.eventId === group.eventId);
    (group.names || []).forEach((name) => {
      if (name.toLowerCase().includes(q)) {
        results.push({
          name, event_name: ev?.name, event_date: ev?.date,
          template_file: tpl?.filename, name_x: tpl?.name_x, name_y: tpl?.name_y,
          font_size: tpl?.font_size || 72, font_color: tpl?.font_color || "#1a1a2e",
          font_family: tpl?.font_family || "Playfair Display", text_align: tpl?.text_align || "center",
        });
      }
    });
  }
  res.json(results.slice(0, 20));
});

// ─────────────────────────────────────────────────────────────
//  DOWNLOAD TRACKING
// ─────────────────────────────────────────────────────────────
app.post("/api/track-download", (req, res) => { res.json({ success: true }); });
app.get("/api/downloads", requireAdmin, (req, res) => { res.json([]); });
app.delete("/api/downloads", requireAdmin, (req, res) => { res.json({ success: true }); });

// ─────────────────────────────────────────────────────────────
//  CATCH-ALL — serve frontend
// ─────────────────────────────────────────────────────────────
app.use((req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);

// ─────────────────────────────────────────────────────────────
//  START SERVER
// ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
