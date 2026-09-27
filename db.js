// db.js — قاعدة البيانات (node:sqlite المدمجة في Node.js 22+، بدون أي تصريف native)
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");
const bcrypt = require("bcryptjs");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
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
  employee_type TEXT DEFAULT 'regular' CHECK(employee_type IN ('regular','service')),
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

CREATE TABLE IF NOT EXISTS attendance_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_id INTEGER NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  day_name TEXT,
  service_start TEXT,
  service_end TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(office_id, date)
);

CREATE TABLE IF NOT EXISTS attendance_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attendance_day_id INTEGER NOT NULL REFERENCES attendance_days(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shift_type TEXT NOT NULL CHECK(shift_type IN ('morning','evening','service','dayoff','vacation'))
);
CREATE INDEX IF NOT EXISTS idx_attendance_entries_day ON attendance_entries(attendance_day_id);
`);

// ==================== ترحيل آمن للأعمدة (Migrations) ====================
// CREATE TABLE IF NOT EXISTS لا يضيف أعمدة جديدة لجدول موجود مسبقاً،
// لذلك نضيف أي عمود ناقص عبر ALTER TABLE حتى تعمل قواعد البيانات القديمة على Railway.
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

ensureColumn("users", "employee_type", "TEXT DEFAULT 'regular'");
ensureColumn("users", "birth_date", "TEXT");
ensureColumn("users", "gender", "TEXT");
ensureColumn("users", "phone", "TEXT");
ensureColumn("users", "personal_email", "TEXT");
ensureColumn("users", "hire_date", "TEXT");
ensureColumn("users", "job_title", "TEXT");
ensureColumn("users", "avatar", "TEXT");
ensureColumn("users", "bio", "TEXT");
ensureColumn("users", "preferences", "TEXT");

db.exec(`
CREATE TABLE IF NOT EXISTS promotions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  note TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS greetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(from_user_id, event_key)
);
CREATE INDEX IF NOT EXISTS idx_greetings_to ON greetings(to_user_id, event_key);

CREATE TABLE IF NOT EXISTS celebration_log (
  event_key TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, id);

CREATE TABLE IF NOT EXISTS game_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game TEXT NOT NULL,
  score INTEGER NOT NULL,
  duration_ms INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_game_scores_game ON game_scores(game, user_id, score);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  color TEXT DEFAULT 'default',
  pinned INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  remind_at TEXT,
  reminded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_remind ON notes(reminded, remind_at);
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
