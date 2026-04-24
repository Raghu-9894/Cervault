const express = require("express");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const app = express();
const PORT = process.env.PORT || 8080;

// --- DATABASE CONNECTION ---
const MONGODB_URI = "mongodb+srv://raghupathi9894_db_user:jA5K0bBITnhbmyB4@cluster0.cvzc0qm.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGODB_URI)
  .then(() => console.log("✅ Securely connected to MongoDB Atlas"))
  .catch(err => console.error("❌ Database Connection Error:", err));

// --- SCHEMAS (SECURITY OPTIMIZED) ---
const Admin = mongoose.model("Admin", new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
}));

const Event = mongoose.model("Event", new mongoose.Schema({
  id: String, name: String, date: String
}));

const Student = mongoose.model("Student", new mongoose.Schema({
  eventId: String, names: [String]
}));

const Template = mongoose.model("Template", new mongoose.Schema({
  eventId: String, filename: String, font_size: Number, font_color: String
}));

// --- INITIAL ADMIN CREATION (Only runs once) ---
async function setupAdmin() {
  const adminExists = await Admin.findOne({ username: "admin" });
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash("admin2026", 10);
    await Admin.create({ username: "admin", password: hashedPassword });
    console.log("🛡️ Admin Account Initialized: admin / admin2026");
  }
}
setupAdmin();

// --- MIDDLEWARE ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: "h1r3h4ck_2k26_pruv4t3_k3y",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 8 * 60 * 60 * 1000 } // 8 Hours Session
}));

// Serve static files
const uploadsPath = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath);
app.use("/uploads", express.static(uploadsPath));
app.use(express.static(path.join(__dirname, "public")));

// Security Middleware: Protect Admin Routes
function checkAuth(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: "Access Denied: Please Login" });
}

// --- API ROUTES ---

// Login with Bcrypt Security
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await Admin.findOne({ username });
  if (user && await bcrypt.compare(password, user.password)) {
    req.session.isAdmin = true;
    return res.json({ success: true });
  }
  res.status(401).json({ error: "Invalid Credentials" });
});

// Create Event (Protected)
app.post("/api/events", checkAuth, async (req, res) => {
  const { name, date } = req.body;
  const eventId = "ev_" + Date.now();
  await Event.create({ id: eventId, name, date });
  res.json({ success: true, id: eventId });
});

// Get Events (Public)
app.get("/api/events", async (req, res) => {
  const events = await Event.find().lean();
  const detailedEvents = await Promise.all(events.map(async (ev) => {
    const tpl = await Template.findOne({ eventId: ev.id });
    const students = await Student.findOne({ eventId: ev.id });
    return { ...ev, templateFile: tpl?.filename, studentCount: students?.names?.length || 0 };
  }));
  res.json(detailedEvents.reverse());
});

// Template Upload (Protected)
const upload = multer({ dest: "uploads/" });
app.post("/api/templates/:eventId", checkAuth, upload.single("template"), async (req, res) => {
  await Template.findOneAndUpdate(
    { eventId: req.params.eventId },
    { filename: req.file.filename, ...req.body },
    { upsert: true }
  );
  res.json({ success: true });
});

// Student Management (Protected)
app.post("/api/students/:eventId", checkAuth, async (req, res) => {
  await Student.findOneAndUpdate(
    { eventId: req.params.eventId },
    { names: req.body.names },
    { upsert: true }
  );
  res.json({ success: true });
});

// Search API (Public)
app.get("/api/search", async (req, res) => {
  const query = (req.query.q || "").toLowerCase();
  if (query.length < 2) return res.json([]);
  
  const studentRecords = await Student.find();
  let results = [];
  
  for (let record of studentRecords) {
    const matches = record.names.filter(n => n.toLowerCase().includes(query));
    if (matches.length > 0) {
      const ev = await Event.findOne({ id: record.eventId });
      const tpl = await Template.findOne({ eventId: record.eventId });
      matches.forEach(name => {
        results.push({ name, event_name: ev?.name, template_file: tpl?.filename });
      });
    }
  }
  res.json(results);
});

// Fallback to Index
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`🚀 CertVault running on port ${PORT}`));
