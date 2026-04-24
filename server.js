// ─────────────────────────────────────────────────────────────
//  CertVault Server — MongoDB Version
//  Run: node server.js
//  Open: http://localhost:8080
// ─────────────────────────────────────────────────────────────

const express = require("express");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const app = express();
const PORT = process.env.PORT || 8080;

// ─────────────────────────────────────────────────────────────
//  MONGODB CONNECTION
// ─────────────────────────────────────────────────────────────
// MongoDB Connection
const MONGODB_URI = "mongodb://raghupathi9894_db_user:jA5K0bBITnhbmyB4@cluster0-shard-00-00.cvzc0qm.mongodb.net:27017,cluster0-shard-00-01.cvzc0qm.mongodb.net:27017,cluster0-shard-00-02.cvzc0qm.mongodb.net:27017/?ssl=true&replicaSet=atlas-cvzc0qm-shard-0&authSource=admin&retryWrites=true&w=majority";

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("✅ Connected to MongoDB Atlas!"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err));// ─────────────────────────────────────────────────────────────
//  MONGODB SCHEMAS
// ─────────────────────────────────────────────────────────────
const adminSchema = new mongoose.Schema({ username: String, password: String });

const eventSchema = new mongoose.Schema({
  id: String,
  name: String,
  date: String,
});

const studentSchema = new mongoose.Schema({
  eventId: String,
  names: [String],
});

const templateSchema = new mongoose.Schema({
  eventId: String,
  filename: String,
  name_x: Number,
  name_y: Number,
  font_size: Number,
  font_color: String,
  font_family: String,
  text_align: String,
});

const Admin = mongoose.model("Admin", adminSchema);
const Event = mongoose.model("Event", eventSchema);
const Student = mongoose.model("Student", studentSchema);
const Template = mongoose.model("Template", templateSchema);

// ─────────────────────────────────────────────────────────────
//  CREATE DEFAULT ADMIN (runs once if no admin exists)
// ─────────────────────────────────────────────────────────────
async function createDefaultAdmin() {
  try {
    const count = await Admin.countDocuments();
    if (count === 0) {
      const hashed = bcrypt.hashSync("admin2026", 10);
      await Admin.create({ username: "admin", password: hashed });
      console.log("🏆 Default Admin Created: admin | admin2026");
    }
  } catch (err) {
    console.error("Error creating default admin:", err);
  }
}
createDefaultAdmin();

// ─────────────────────────────────────────────────────────────
//  FILE UPLOAD SETUP
// ─────────────────────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) =>
    cb(
      null,
      Date.now() + "_" + file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_"),
    ),
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// ─────────────────────────────────────────────────────────────
//  MIDDLEWARE
// ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: "certvault_secret_2026",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 8 * 60 * 60 * 1000 }, // 8 hours
  }),
);
app.use("/uploads", express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, "public")));

// ─────────────────────────────────────────────────────────────
//  AUTH MIDDLEWARE — protects admin routes
// ─────────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.session && req.session.adminId) return next();
  res.status(401).json({ error: "Unauthorized" });
}

// ─────────────────────────────────────────────────────────────
//  AUTH ROUTES
// ─────────────────────────────────────────────────────────────

// Check if already logged in (called on page load)
app.get("/api/auth/me", (req, res) => {
  res.json({ loggedIn: !!(req.session && req.session.adminId) });
});

// Login
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  const admin = await Admin.findOne({ username: username || "admin" });
  if (!admin || !bcrypt.compareSync(password, admin.password))
    return res.status(401).json({ error: "Invalid credentials" });
  req.session.adminId = admin._id;
  res.json({ success: true });
});

// Logout
app.post("/api/auth/logout", (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Change password
app.post("/api/auth/change-password", requireAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const admin = await Admin.findById(req.session.adminId);
    if (!bcrypt.compareSync(currentPassword, admin.password))
      return res.status(401).json({ error: "Current password incorrect" });
    if (!newPassword || newPassword.length < 6)
      return res.status(400).json({ error: "Min 6 characters required" });
    admin.password = bcrypt.hashSync(newPassword, 10);
    await admin.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
//  STATS ROUTE — shows event/student counts on home page
// ─────────────────────────────────────────────────────────────
app.get("/api/stats", async (req, res) => {
  try {
    const events = await Event.find();
    let total = 0;
    for (const ev of events) {
      const s = await Student.findOne({ eventId: ev.id });
      total += s?.names?.length || 0;
    }
    res.json({ events: events.length, certs: total, students: total });
  } catch (err) {
    res.json({ events: 0, certs: 0, students: 0 });
  }
});

// ─────────────────────────────────────────────────────────────
//  EVENT ROUTES
// ─────────────────────────────────────────────────────────────

// Get all events (with template + student count)
app.get("/api/events", async (req, res) => {
  const events = await Event.find();
  const result = await Promise.all(
    events.map(async (ev) => {
      const tpl = await Template.findOne({ eventId: ev.id });
      const students = await Student.findOne({ eventId: ev.id });
      return {
        ...ev.toObject(),
        templateFile: tpl?.filename || null,
        nameConfig: tpl || null,
        studentCount: students?.names?.length || 0,
      };
    }),
  );
  res.json(result.reverse()); // newest first
});

// Create event
app.post("/api/events", requireAdmin, async (req, res) => {
  const { name, date } = req.body;
  const id = "ev_" + Date.now();
  await Event.create({ id, name: name.trim(), date: date?.trim() || "—" });
  res.json({ success: true, id });
});

// Delete event (also removes its template + students)
app.delete("/api/events/:id", requireAdmin, async (req, res) => {
  await Event.deleteOne({ id: req.params.id });
  await Student.deleteOne({ eventId: req.params.id });
  await Template.deleteOne({ eventId: req.params.id });
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
//  TEMPLATE ROUTES
// ─────────────────────────────────────────────────────────────

// Upload new template image + config
app.post(
  "/api/templates/:eventId",
  requireAdmin,
  upload.single("template"),
  async (req, res) => {
    const { eventId } = req.params;
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    await Template.findOneAndUpdate(
      { eventId },
      {
        filename: req.file.filename,
        name_x: req.body.name_x || null,
        name_y: req.body.name_y || null,
        font_size: parseInt(req.body.font_size) || 72,
        font_color: req.body.font_color || "#1a1a2e",
        font_family: req.body.font_family || "Playfair Display",
        text_align: req.body.text_align || "center",
      },
      { upsert: true },
    );
    res.json({ success: true, filename: req.file.filename });
  },
);

// Update template config only (no image re-upload)
app.put("/api/templates/:eventId/config", requireAdmin, async (req, res) => {
  await Template.findOneAndUpdate({ eventId: req.params.eventId }, req.body);
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
//  STUDENT ROUTES
// ─────────────────────────────────────────────────────────────

// Get student names for an event
app.get("/api/students/:eventId", requireAdmin, async (req, res) => {
  const s = await Student.findOne({ eventId: req.params.eventId });
  res.json(s?.names || []);
});

// Save/replace student names for an event
app.post("/api/students/:eventId", requireAdmin, async (req, res) => {
  const { eventId } = req.params;
  const { names } = req.body;
  const cleaned = [
    ...new Set(names.map((n) => String(n).trim()).filter(Boolean)),
  ];
  await Student.findOneAndUpdate(
    { eventId },
    { names: cleaned },
    { upsert: true },
  );
  res.json({ success: true, count: cleaned.length });
});

// ─────────────────────────────────────────────────────────────
//  SEARCH ROUTE — used by students on the portal page
// ─────────────────────────────────────────────────────────────
app.get("/api/search", async (req, res) => {
  const q = (req.query.q || "").trim().toLowerCase();
  if (q.length < 2) return res.json([]);

  const allGroups = await Student.find();
  const results = [];

  for (const group of allGroups) {
    const ev = await Event.findOne({ id: group.eventId });
    const tpl = await Template.findOne({ eventId: group.eventId });

    group.names.forEach((name) => {
      if (name.toLowerCase().includes(q)) {
        results.push({
          name,
          event_name: ev?.name,
          event_date: ev?.date,
          template_file: tpl?.filename,
          name_x: tpl?.name_x,
          name_y: tpl?.name_y,
          font_size: tpl?.font_size || 72,
          font_color: tpl?.font_color || "#1a1a2e",
          font_family: tpl?.font_family || "Playfair Display",
          text_align: tpl?.text_align || "center",
        });
      }
    });
  }
  res.json(results.slice(0, 20));
});

// ─────────────────────────────────────────────────────────────
//  DOWNLOAD TRACKING (optional — logs who downloaded what)
// ─────────────────────────────────────────────────────────────
app.post("/api/track-download", async (req, res) => {
  // You can save to DB here if needed
  res.json({ success: true });
});

app.get("/api/downloads", requireAdmin, async (req, res) => {
  res.json([]); // extend this if you want real tracking
});

app.delete("/api/downloads", requireAdmin, async (req, res) => {
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
//  CATCH-ALL — serves index.html for all other routes
// ─────────────────────────────────────────────────────────────
app.get("*", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html")),
);

// ─────────────────────────────────────────────────────────────
//  START SERVER
// ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
