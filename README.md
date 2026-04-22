# 🏆 CertVault — Fullstack Certificate Portal

## ✅ Quick Setup (3 Commands!)

```bash
# 1. Install packages
npm install

# 2. Run server
node server.js

# 3. Open in browser
http://localhost:3000
```

---

## 📁 Project Structure

```
certvault/
├── server.js          ← Backend (Node.js + Express + SQLite)
├── package.json       ← Dependencies
├── certvault.db       ← Database (auto-created on first run)
├── uploads/           ← Certificate templates (auto-created)
└── public/
    └── index.html     ← Frontend (all pages)
```

---

## 🔐 Default Admin Login

| Field    | Value      |
|----------|------------|
| Username | `admin`    |
| Password | `admin2026`|

**Password change பண்ண:** Admin Panel → "Change Admin Password" section

---

## 🌐 Multi-User Access

- **Local Network:** `http://YOUR_IP:3000`
  - Windows: `ipconfig` → IPv4 address
  - Mac/Linux: `ifconfig` → inet address
  - Example: `http://192.168.1.10:3000`

- **Internet (Public):** Use ngrok:
  ```bash
  npm install -g ngrok
  ngrok http 3000
  ```
  → Public URL கிடைக்கும். யாரும் access பண்ணலாம்!

---

## 📋 How to Use

### Admin (Step by step):
1. `http://localhost:3000` → ⚙️ Admin tab
2. Login with `admin` / `admin2026`
3. **Step 1:** Create Event (name + date)
4. **Step 2:** Upload certificate template image → Set name X, Y position → Save
5. **Step 3:** Add student names → Save Students
6. Preview & Download certificates!

### Students:
1. `http://localhost:3000` → 🎓 Portal tab
2. Name search பண்ணுங்க
3. Certificate கண்டுபிடிக்கும் → Download!

---

## 🔧 Configuration

### Change Port:
```bash
PORT=8080 node server.js
```

### Production (Always-on):
```bash
npm install -g pm2
pm2 start server.js --name certvault
pm2 save
pm2 startup
```

---

## 📦 Dependencies

| Package         | Purpose                    |
|-----------------|----------------------------|
| express         | Web server                 |
| better-sqlite3  | Fast local database        |
| multer          | File upload handling       |
| express-session | Admin login sessions       |
| bcryptjs        | Password hashing (secure)  |

---

## 🛡️ Security Features

- ✅ Password hashed with bcrypt (not plain text)
- ✅ Session-based authentication
- ✅ File type validation (images only)
- ✅ 20MB file size limit
- ✅ SQL injection protection (prepared statements)
- ✅ XSS protection (HTML escaping)

---

## ❓ Troubleshooting

**Port already in use:**
```bash
PORT=4000 node server.js
```

**Module not found:**
```bash
npm install
```

**Database error:**
- Delete `certvault.db` and restart (data will be reset)

---

*Built with ❤️ — CertVault Fullstack v2.0*