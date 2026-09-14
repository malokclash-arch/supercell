// db.js — قاعدة البيانات (node:sqlite المدمجة في Node.js 22+، بدون أي تصريف native)
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");
const bcrypt = require("bcryptjs");

const DATA_DIR = path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, "platform.db"));
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS offices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('super_admin','office_admin','employee','monitor')),
  office_id INTEGER REFERENCES offices(id) ON DELETE CASCADE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS monitor_access (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  office_id INTEGER NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, office_id)
);

CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id INTEGER NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_name TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  phone_number TEXT,
  bg TEXT,
  visit_reason TEXT,
  price REAL,
  item_name TEXT,
  ref_id TEXT,
  migrations_up TEXT,
  revenue_amount REAL,
  status TEXT,
  notes TEXT,
  shop_name TEXT,
  created_at TEXT NOT NULL,
  edited INTEGER NOT NULL DEFAULT 0,
  edited_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_entries_office_date ON entries(office_id, date);
`);

// إنشاء حساب المدير العام الأول تلقائياً إذا لم يوجد أي مدير عام بعد
const existingSuperAdmin = db.prepare("SELECT id FROM users WHERE role = 'super_admin' LIMIT 1").get();
if (!existingSuperAdmin) {
  const tempPassword = crypto.randomBytes(6).toString("base64url"); // كلمة سر عشوائية آمنة لمرة واحدة
  const hash = bcrypt.hashSync(tempPassword, 10);
  db.prepare(`
    INSERT INTO users (username, password_hash, full_name, role, office_id, active, created_at)
    VALUES ('admin', $hash, 'المدير العام', 'super_admin', NULL, 1, $created_at)
  `).run({ $hash: hash, $created_at: new Date().toISOString() });

  console.log("\n=========================================================");
  console.log(" تم إنشاء حساب المدير العام لأول مرة:");
  console.log("   اسم المستخدم: admin");
  console.log("   كلمة السر المؤقتة: " + tempPassword);
  console.log("   يجب تغييرها فوراً بعد أول تسجيل دخول (سجّلها الآن، لن تظهر ثانية)");
  console.log("=========================================================\n");
}

module.exports = db;
