// CertVault Server - No Visual Studio needed!
const express = require("express");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOADS_DIR = path.join(__dirname, "uploads");
const DB_PATH = path.join(__dirname, "certvault.json");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function loadDB() {
  if (fs.existsSync(DB_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    } catch {}
  }
  return { admins: [], events: [], templates: {}, students: {}, downloads: [] };
}
function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

let DB = loadDB();
if (!DB.admins.length) {
  DB.admins.push({
    id: 1,
    username: "admin",
    password: bcrypt.hashSync("admin2026", 10),
  });
  saveDB(DB);
}

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) =>
    cb(
      null,
      Date.now() + "_" + file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_"),
    ),
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: "certvault_secret_2026",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 8 * 60 * 60 * 1000 },
  }),
);
app.use("/uploads", express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, "public")));

function requireAdmin(req, res, next) {
  if (req.session && req.session.adminId) return next();
  res.status(401).json({ error: "Unauthorized" });
}

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  const admin = DB.admins.find((a) => a.username === (username || "admin"));
  if (!admin || !bcrypt.compareSync(password, admin.password))
    return res.status(401).json({ error: "Invalid credentials" });
  req.session.adminId = admin.id;
  res.json({ success: true });
});
app.post("/api/auth/logout", (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});
app.get("/api/auth/me", (req, res) =>
  res.json({ loggedIn: !!req.session.adminId }),
);
app.post("/api/auth/change-password", requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6)
    return res.status(400).json({ error: "Password min 6 chars" });
  const admin = DB.admins.find((a) => a.id === req.session.adminId);
  if (!bcrypt.compareSync(currentPassword, admin.password))
    return res.status(401).json({ error: "Wrong current password" });
  admin.password = bcrypt.hashSync(newPassword, 10);
  saveDB(DB);
  res.json({ success: true });
});

app.get("/api/events", (req, res) => {
  const result = [...DB.events]
    .reverse()
    .map((ev) => ({
      ...ev,
      templateFile: DB.templates[ev.id]?.filename || null,
      nameConfig: DB.templates[ev.id] || null,
      studentCount: (DB.students[ev.id] || []).length,
    }));
  res.json(result);
});
app.post("/api/events", requireAdmin, (req, res) => {
  const { name, date } = req.body;
  if (!name?.trim())
    return res.status(400).json({ error: "Event name required" });
  const id = "ev_" + Date.now();
  DB.events.push({ id, name: name.trim(), date: date?.trim() || "—" });
  saveDB(DB);
  res.json({ success: true, id });
});
app.delete("/api/events/:id", requireAdmin, (req, res) => {
  const idx = DB.events.findIndex((e) => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  const tpl = DB.templates[req.params.id];
  if (tpl) {
    const fp = path.join(UPLOADS_DIR, tpl.filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    delete DB.templates[req.params.id];
  }
  delete DB.students[req.params.id];
  DB.events.splice(idx, 1);
  saveDB(DB);
  res.json({ success: true });
});

app.post(
  "/api/templates/:eventId",
  requireAdmin,
  upload.single("template"),
  (req, res) => {
    const { eventId } = req.params;
    if (!DB.events.find((e) => e.id === eventId))
      return res.status(404).json({ error: "Event not found" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const old = DB.templates[eventId];
    if (old) {
      const fp = path.join(UPLOADS_DIR, old.filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    const { name_x, name_y, font_size, font_color, font_family, text_align } =
      req.body;
    DB.templates[eventId] = {
      event_id: eventId,
      filename: req.file.filename,
      name_x: name_x ? parseFloat(name_x) : null,
      name_y: name_y ? parseFloat(name_y) : null,
      font_size: parseInt(font_size) || 72,
      font_color: font_color || "#1a1a2e",
      font_family: font_family || "Playfair Display",
      text_align: text_align || "center",
    };
    saveDB(DB);
    res.json({ success: true, filename: req.file.filename });
  },
);
app.put("/api/templates/:eventId/config", requireAdmin, (req, res) => {
  const { eventId } = req.params;
  if (!DB.templates[eventId])
    return res.status(404).json({ error: "No template" });
  const { name_x, name_y, font_size, font_color, font_family, text_align } =
    req.body;
  Object.assign(DB.templates[eventId], {
    name_x: name_x ? parseFloat(name_x) : null,
    name_y: name_y ? parseFloat(name_y) : null,
    font_size: parseInt(font_size) || 72,
    font_color: font_color || "#1a1a2e",
    font_family: font_family || "Playfair Display",
    text_align: text_align || "center",
  });
  saveDB(DB);
  res.json({ success: true });
});

app.get("/api/students/:eventId", (req, res) =>
  res.json(DB.students[req.params.eventId] || []),
);
app.post("/api/students/:eventId", requireAdmin, (req, res) => {
  const { eventId } = req.params;
  const { names } = req.body;
  if (!Array.isArray(names) || !names.length)
    return res.status(400).json({ error: "Names required" });
  if (!DB.events.find((e) => e.id === eventId))
    return res.status(404).json({ error: "Event not found" });
  DB.students[eventId] = [
    ...new Set(names.map((n) => String(n).trim()).filter(Boolean)),
  ];
  saveDB(DB);
  res.json({ success: true, count: DB.students[eventId].length });
});

app.get("/api/search", (req, res) => {
  const q = (req.query.q || "").trim().toLowerCase();
  if (!q || q.length < 2) return res.json([]);
  const results = [];
  DB.events.forEach((ev) => {
    const tpl = DB.templates[ev.id];
    (DB.students[ev.id] || []).forEach((name) => {
      if (name.toLowerCase().includes(q))
        results.push({
          name,
          event_id: ev.id,
          event_name: ev.name,
          event_date: ev.date,
          template_file: tpl?.filename || null,
          name_x: tpl?.name_x || null,
          name_y: tpl?.name_y || null,
          font_size: tpl?.font_size || 72,
          font_color: tpl?.font_color || "#1a1a2e",
          font_family: tpl?.font_family || "Playfair Display",
          text_align: tpl?.text_align || "center",
        });
    });
  });
  res.json(results.slice(0, 20));
});

app.get("/api/stats", (req, res) => {
  const allNames = Object.values(DB.students).flat();
  res.json({
    events: DB.events.length,
    certs: allNames.length,
    students: new Set(allNames).size,
  });
});

app.get("*", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html")),
);

app.listen(PORT, () => {
  console.log(`\n🏆  CertVault running at http://localhost:${PORT}`);
  console.log(`    Username: admin  |  Password: admin2026\n`);
});
