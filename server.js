// server.js — منصة سوبرسيل لإدخال ودمج تقارير خدمة العملاء
const express = require("express");
const cookieParser = require("cookie-parser");
const ExcelJS = require("exceljs");
const db = require("./db");
const { computeStats } = require("./stats");
const {
  hashPassword, verifyPassword, signToken, authMiddleware, requireRole,
  checkLoginRateLimit, recordLoginFailure, clearLoginFailures
} = require("./auth");

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === "production";

app.set("trust proxy", 1); // ضروري خلف أي بروكسي عكسي (Render/Nginx) لتعمل الكوكي الآمنة وعناوين IP بشكل صحيح

app.use(express.json());
app.use(cookieParser());
app.use(express.static(require("path").join(__dirname, "public")));

const COOKIE_OPTS = { httpOnly: true, sameSite: "lax", secure: isProd, maxAge: 12 * 60 * 60 * 1000 };

// ==================== المصادقة ====================

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ ok: false, error: "الرجاء إدخال اسم المستخدم وكلمة السر" });

  const rlKey = req.ip + ":" + username;
  const rl = checkLoginRateLimit(rlKey);
  if (!rl.allowed) {
    return res.status(429).json({ ok: false, error: `محاولات كثيرة، حاول بعد ${rl.retryAfterSec} ثانية` });
  }

  const user = db.prepare("SELECT * FROM users WHERE username = ? AND active = 1").get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    recordLoginFailure(rlKey);
    return res.status(401).json({ ok: false, error: "اسم المستخدم أو كلمة السر غير صحيحة" });
  }

  clearLoginFailures(rlKey);
  const token = signToken(user);
  res.cookie("token", token, COOKIE_OPTS);
  res.json({ ok: true, user: { role: user.role, full_name: user.full_name, office_id: user.office_id, username: user.username } });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

app.get("/api/auth/me", authMiddleware, (req, res) => {
  res.json({ ok: true, user: req.user });
});

app.post("/api/auth/change-password", authMiddleware, (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ ok: false, error: "كلمة السر الجديدة يجب أن تكون 6 أحرف على الأقل" });
  }
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!verifyPassword(current_password, user.password_hash)) {
    return res.status(401).json({ ok: false, error: "كلمة السر الحالية غير صحيحة" });
  }
  db.prepare("UPDATE users SET password_hash = $h WHERE id = $id").run({ $h: hashPassword(new_password), $id: req.user.id });
  res.json({ ok: true });
});

// ==================== المدير العام (Super Admin) ====================

const superAdminRouter = express.Router();
superAdminRouter.use(authMiddleware, requireRole("super_admin"));

superAdminRouter.get("/offices", (req, res) => {
  const offices = db.prepare("SELECT * FROM offices ORDER BY created_at DESC").all();
  res.json({ ok: true, offices });
});

superAdminRouter.post("/offices", (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ ok: false, error: "اسم المكتب مطلوب" });
  try {
    const info = db.prepare("INSERT INTO offices (name, created_at) VALUES ($name, $created_at)")
      .run({ $name: name.trim(), $created_at: new Date().toISOString() });
    res.json({ ok: true, office: { id: info.lastInsertRowid, name: name.trim() } });
  } catch (e) {
    res.status(400).json({ ok: false, error: "هذا الاسم مستخدم مسبقاً" });
  }
});

superAdminRouter.delete("/offices/:id", (req, res) => {
  db.prepare("DELETE FROM offices WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

superAdminRouter.get("/users", (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.username, u.full_name, u.role, u.office_id, u.active, o.name as office_name
    FROM users u LEFT JOIN offices o ON o.id = u.office_id
    ORDER BY u.created_at DESC
  `).all();
  res.json({ ok: true, users });
});

superAdminRouter.post("/users", (req, res) => {
  const { username, password, full_name, role, office_id, employee_type } = req.body || {};
  if (!username || !password || !full_name || !role) {
    return res.status(400).json({ ok: false, error: "جميع الحقول مطلوبة" });
  }
  if (!["office_admin", "monitor", "employee"].includes(role)) {
    return res.status(400).json({ ok: false, error: "الدور غير صالح لهذا المسار" });
  }
  if ((role === "office_admin" || role === "employee") && !office_id) {
    return res.status(400).json({ ok: false, error: "هذا الدور يجب ربطه بمكتب" });
  }
  const empType = (role === "employee" && employee_type === "service") ? "service" : "regular";
  try {
    const info = db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role, employee_type, office_id, active, created_at)
      VALUES ($username, $hash, $full_name, $role, $employee_type, $office_id, 1, $created_at)
    `).run({
      $username: username.trim(), $hash: hashPassword(password), $full_name: full_name.trim(),
      $role: role, $employee_type: empType, $office_id: (role === "office_admin" || role === "employee") ? office_id : null, $created_at: new Date().toISOString()
    });
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ ok: false, error: "اسم المستخدم مستخدم مسبقاً" });
  }
});

superAdminRouter.put("/users/:id/toggle", (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ ok: false, error: "غير موجود" });
  db.prepare("UPDATE users SET active = $a WHERE id = $id").run({ $a: user.active ? 0 : 1, $id: req.params.id });
  res.json({ ok: true });
});

superAdminRouter.put("/users/:id", (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ ok: false, error: "غير موجود" });
  const { username, password, full_name } = req.body || {};
  if (!username || !full_name) return res.status(400).json({ ok: false, error: "اسم المستخدم والاسم الكامل مطلوبان" });
  try {
    if (password && password.trim()) {
      db.prepare("UPDATE users SET username = $u, full_name = $f, password_hash = $h WHERE id = $id")
        .run({ $u: username.trim(), $f: full_name.trim(), $h: hashPassword(password), $id: req.params.id });
    } else {
      db.prepare("UPDATE users SET username = $u, full_name = $f WHERE id = $id")
        .run({ $u: username.trim(), $f: full_name.trim(), $id: req.params.id });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: "اسم المستخدم مستخدم مسبقاً من حساب آخر" });
  }
});

superAdminRouter.delete("/users/:id", (req, res) => {
  db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

superAdminRouter.get("/monitor-access/:userId", (req, res) => {
  const rows = db.prepare("SELECT office_id FROM monitor_access WHERE user_id = ?").all(req.params.userId);
  res.json({ ok: true, office_ids: rows.map(r => r.office_id) });
});

superAdminRouter.post("/monitor-access", (req, res) => {
  const { user_id, office_ids } = req.body || {};
  if (!user_id || !Array.isArray(office_ids)) return res.status(400).json({ ok: false, error: "بيانات ناقصة" });
  db.prepare("DELETE FROM monitor_access WHERE user_id = ?").run(user_id);
  const stmt = db.prepare("INSERT INTO monitor_access (user_id, office_id) VALUES ($u, $o)");
  for (const officeId of office_ids) stmt.run({ $u: user_id, $o: officeId });
  res.json({ ok: true });
});

app.use("/api/superadmin", superAdminRouter);

// ==================== مدير المكتب (Office Admin) ====================

const officeAdminRouter = express.Router();
officeAdminRouter.use(authMiddleware, requireRole("office_admin"));

officeAdminRouter.get("/employees", (req, res) => {
  const rows = db.prepare("SELECT id, username, full_name, active, employee_type FROM users WHERE office_id = ? AND role = 'employee' ORDER BY created_at DESC")
    .all(req.user.office_id);
  res.json({ ok: true, employees: rows });
});

officeAdminRouter.post("/employees", (req, res) => {
  const { username, password, full_name, employee_type } = req.body || {};
  if (!username || !password || !full_name) return res.status(400).json({ ok: false, error: "جميع الحقول مطلوبة" });
  const empType = employee_type === "service" ? "service" : "regular";
  try {
    const info = db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role, employee_type, office_id, active, created_at)
      VALUES ($username, $hash, $full_name, 'employee', $employee_type, $office_id, 1, $created_at)
    `).run({
      $username: username.trim(), $hash: hashPassword(password), $full_name: full_name.trim(), $employee_type: empType,
      $office_id: req.user.office_id, $created_at: new Date().toISOString()
    });
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ ok: false, error: "اسم المستخدم مستخدم مسبقاً" });
  }
});

officeAdminRouter.put("/employees/:id/toggle", (req, res) => {
  const emp = db.prepare("SELECT * FROM users WHERE id = ? AND office_id = ? AND role = 'employee'").get(req.params.id, req.user.office_id);
  if (!emp) return res.status(404).json({ ok: false, error: "غير موجود" });
  db.prepare("UPDATE users SET active = $a WHERE id = $id").run({ $a: emp.active ? 0 : 1, $id: req.params.id });
  res.json({ ok: true });
});

officeAdminRouter.delete("/employees/:id", (req, res) => {
  db.prepare("DELETE FROM users WHERE id = ? AND office_id = ? AND role = 'employee'").run(req.params.id, req.user.office_id);
  res.json({ ok: true });
});

app.use("/api/office-admin", officeAdminRouter);

// ==================== المعاملات (موظف + مدير مكتب داخل نفس المكتب) ====================

const entriesRouter = express.Router();
entriesRouter.use(authMiddleware, requireRole("employee", "office_admin"));

function isMultipleOf5(v) {
  if (v === null || v === undefined || v === "") return true;
  const n = Number(v);
  return Number.isFinite(n) && n % 5 === 0;
}

entriesRouter.post("/", (req, res) => {
  const b = req.body || {};
  if (!b.customer_name || !b.date || !b.time) {
    return res.status(400).json({ ok: false, error: "الحقول الأساسية ناقصة (اسم العميل، التاريخ، الوقت)" });
  }
  if (!isMultipleOf5(b.price) || !isMultipleOf5(b.revenue_amount)) {
    return res.status(400).json({ ok: false, error: "السعر و Revenue Amount يجب أن يكونا من مضاعفات 5" });
  }
  const info = db.prepare(`
    INSERT INTO entries
      (office_id, user_id, employee_name, date, time, customer_name, phone_number, bg, visit_reason,
       price, item_name, ref_id, migrations_up, revenue_amount, status, notes, shop_name, created_at)
    VALUES
      ($office_id, $user_id, $employee_name, $date, $time, $customer_name, $phone_number, $bg, $visit_reason,
       $price, $item_name, $ref_id, $migrations_up, $revenue_amount, $status, $notes, $shop_name, $created_at)
  `).run({
    $office_id: req.user.office_id, $user_id: req.user.id, $employee_name: req.user.full_name,
    $date: b.date, $time: b.time, $customer_name: b.customer_name, $phone_number: b.phone_number || null,
    $bg: b.bg || null, $visit_reason: b.visit_reason || null, $price: b.price || null,
    $item_name: b.item_name || null, $ref_id: b.ref_id || null, $migrations_up: b.migrations_up || null,
    $revenue_amount: b.revenue_amount || null, $status: b.status || "Pending", $notes: b.notes || null,
    $shop_name: b.shop_name || null, $created_at: new Date().toISOString()
  });
  const entry = db.prepare("SELECT * FROM entries WHERE id = ?").get(info.lastInsertRowid);
  res.json({ ok: true, entry });
});

entriesRouter.get("/mine", (req, res) => {
  const date = req.query.date;
  const rows = db.prepare("SELECT * FROM entries WHERE office_id = ? AND user_id = ? AND date = ? ORDER BY created_at ASC")
    .all(req.user.office_id, req.user.id, date);
  res.json({ ok: true, entries: rows });
});

function canModify(entry, user) {
  if (!entry || entry.office_id !== user.office_id) return false;
  if (user.role === "office_admin") return true; // مدير المكتب يقدر يعدّل أي معاملة داخل مكتبه
  return entry.user_id === user.id; // الموظف يعدّل معاملاته فقط
}

entriesRouter.put("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM entries WHERE id = ?").get(req.params.id);
  if (!canModify(existing, req.user)) return res.status(403).json({ ok: false, error: "لا تملك صلاحية تعديل هذه المعاملة" });
  const b = req.body || {};
  if (!isMultipleOf5(b.price) || !isMultipleOf5(b.revenue_amount)) {
    return res.status(400).json({ ok: false, error: "السعر و Revenue Amount يجب أن يكونا من مضاعفات 5" });
  }
  db.prepare(`
    UPDATE entries SET
      date=$date, time=$time, customer_name=$customer_name, phone_number=$phone_number, bg=$bg,
      visit_reason=$visit_reason, price=$price, item_name=$item_name, ref_id=$ref_id,
      migrations_up=$migrations_up, revenue_amount=$revenue_amount, status=$status, notes=$notes,
      edited=1, edited_at=$edited_at
    WHERE id=$id
  `).run({
    $id: req.params.id,
    $date: b.date || existing.date, $time: b.time || existing.time,
    $customer_name: b.customer_name || existing.customer_name,
    $phone_number: b.phone_number ?? existing.phone_number, $bg: b.bg ?? existing.bg,
    $visit_reason: b.visit_reason ?? existing.visit_reason, $price: b.price ?? existing.price,
    $item_name: b.item_name ?? existing.item_name, $ref_id: b.ref_id ?? existing.ref_id,
    $migrations_up: b.migrations_up ?? existing.migrations_up, $revenue_amount: b.revenue_amount ?? existing.revenue_amount,
    $status: b.status || existing.status, $notes: b.notes ?? existing.notes,
    $edited_at: new Date().toTimeString().slice(0, 8)
  });
  res.json({ ok: true, entry: db.prepare("SELECT * FROM entries WHERE id = ?").get(req.params.id) });
});

entriesRouter.delete("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM entries WHERE id = ?").get(req.params.id);
  if (!canModify(existing, req.user)) return res.status(403).json({ ok: false, error: "لا تملك صلاحية حذف هذه المعاملة" });
  db.prepare("DELETE FROM entries WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

app.use("/api/entries", entriesRouter);

// ==================== الدمج والإحصائيات والتصدير (داخل نفس المكتب) ====================

const officeDataRouter = express.Router();
officeDataRouter.use(authMiddleware, requireRole("employee", "office_admin"));

officeDataRouter.get("/merged", (req, res) => {
  const date = req.query.date;
  const rows = db.prepare("SELECT * FROM entries WHERE office_id = ? AND date = ? ORDER BY created_at ASC")
    .all(req.user.office_id, date);
  res.json({ ok: true, entries: rows });
});

officeDataRouter.get("/stats", (req, res) => {
  const date = req.query.date;
  const rows = db.prepare("SELECT * FROM entries WHERE office_id = ? AND date = ?").all(req.user.office_id, date);
  res.json({ ok: true, stats: computeStats(rows) });
});

officeDataRouter.get("/export", async (req, res) => {
  const date = req.query.date;
  const rows = db.prepare("SELECT * FROM entries WHERE office_id = ? AND date = ? ORDER BY created_at ASC")
    .all(req.user.office_id, date);
  await sendExcel(res, rows, date);
});

// قائمة موظفي المكتب (للاستخدام في اختيار الشفتات بالحضور اليومي)
officeDataRouter.get("/roster", (req, res) => {
  const rows = db.prepare("SELECT id, full_name, employee_type FROM users WHERE office_id = ? AND role IN ('employee','office_admin') AND active = 1 ORDER BY (role='office_admin') DESC, full_name")
    .all(req.user.office_id);
  const office = db.prepare("SELECT name FROM offices WHERE id = ?").get(req.user.office_id);
  res.json({ ok: true, employees: rows, office_name: office ? office.name : "" });
});

// الحضور اليومي
officeDataRouter.get("/attendance", (req, res) => {
  const result = getAttendanceDay(req.user.office_id, req.query.date);
  res.json({ ok: true, ...result });
});

officeDataRouter.post("/attendance", (req, res) => {
  saveAttendanceDay(req.user.office_id, req.body || {});
  res.json({ ok: true });
});

app.use("/api/office", officeDataRouter);

// ==================== فريق المتابعة (Monitor — قراءة فقط) ====================

const monitorRouter = express.Router();
monitorRouter.use(authMiddleware, requireRole("monitor"));

function checkMonitorAccess(userId, officeId) {
  return !!db.prepare("SELECT 1 FROM monitor_access WHERE user_id = ? AND office_id = ?").get(userId, officeId);
}

monitorRouter.get("/offices", (req, res) => {
  const rows = db.prepare(`
    SELECT o.id, o.name FROM offices o
    JOIN monitor_access ma ON ma.office_id = o.id
    WHERE ma.user_id = ? ORDER BY o.name
  `).all(req.user.id);
  res.json({ ok: true, offices: rows });
});

monitorRouter.get("/offices/:officeId/merged", (req, res) => {
  if (!checkMonitorAccess(req.user.id, req.params.officeId)) return res.status(403).json({ ok: false, error: "لا تملك صلاحية الاطلاع على هذا المكتب" });
  const rows = db.prepare("SELECT * FROM entries WHERE office_id = ? AND date = ? ORDER BY created_at ASC")
    .all(req.params.officeId, req.query.date);
  res.json({ ok: true, entries: rows });
});

monitorRouter.get("/offices/:officeId/stats", (req, res) => {
  if (!checkMonitorAccess(req.user.id, req.params.officeId)) return res.status(403).json({ ok: false, error: "لا تملك صلاحية الاطلاع على هذا المكتب" });
  const rows = db.prepare("SELECT * FROM entries WHERE office_id = ? AND date = ?").all(req.params.officeId, req.query.date);
  res.json({ ok: true, stats: computeStats(rows) });
});

monitorRouter.get("/offices/:officeId/export", async (req, res) => {
  if (!checkMonitorAccess(req.user.id, req.params.officeId)) return res.status(403).json({ ok: false, error: "لا تملك صلاحية الاطلاع على هذا المكتب" });
  const rows = db.prepare("SELECT * FROM entries WHERE office_id = ? AND date = ? ORDER BY created_at ASC")
    .all(req.params.officeId, req.query.date);
  await sendExcel(res, rows, req.query.date);
});

monitorRouter.get("/offices/:officeId/attendance", (req, res) => {
  if (!checkMonitorAccess(req.user.id, req.params.officeId)) return res.status(403).json({ ok: false, error: "لا تملك صلاحية الاطلاع على هذا المكتب" });
  const result = getAttendanceDay(req.params.officeId, req.query.date);
  res.json({ ok: true, ...result });
});

app.use("/api/monitor", monitorRouter);

// ==================== دوال مشتركة للحضور اليومي ====================

function getAttendanceDay(officeId, date) {
  const day = db.prepare("SELECT * FROM attendance_days WHERE office_id = ? AND date = ?").get(officeId, date);
  const roster = db.prepare("SELECT id, full_name, employee_type FROM users WHERE office_id = ? AND role IN ('employee','office_admin') AND active = 1 ORDER BY (role='office_admin') DESC, full_name").all(officeId);
  const office = db.prepare("SELECT name FROM offices WHERE id = ?").get(officeId);
  let entries = [];
  if (day) {
    entries = db.prepare(`
      SELECT ae.id, ae.user_id, ae.shift_type, u.full_name
      FROM attendance_entries ae JOIN users u ON u.id = ae.user_id
      WHERE ae.attendance_day_id = ?
    `).all(day.id);
  }
  return { day: day || null, entries, roster, office_name: office ? office.name : "" };
}

function saveAttendanceDay(officeId, body) {
  if (!body.date) throw new Error("التاريخ مطلوب");
  let day = db.prepare("SELECT * FROM attendance_days WHERE office_id = ? AND date = ?").get(officeId, body.date);
  const now = new Date().toISOString();
  if (day) {
    db.prepare("UPDATE attendance_days SET day_name = $d, service_start = $ss, service_end = $se, updated_at = $u WHERE id = $id")
      .run({ $d: body.day_name || null, $ss: body.service_start || null, $se: body.service_end || null, $u: now, $id: day.id });
  } else {
    const info = db.prepare(`
      INSERT INTO attendance_days (office_id, date, day_name, service_start, service_end, updated_at)
      VALUES ($o, $dt, $d, $ss, $se, $u)
    `).run({ $o: officeId, $dt: body.date, $d: body.day_name || null, $ss: body.service_start || null, $se: body.service_end || null, $u: now });
    day = { id: info.lastInsertRowid };
  }
  db.prepare("DELETE FROM attendance_entries WHERE attendance_day_id = ?").run(day.id);
  const stmt = db.prepare("INSERT INTO attendance_entries (attendance_day_id, user_id, shift_type) VALUES ($d, $u, $s)");
  for (const e of (body.entries || [])) {
    if (e && e.user_id && e.shift_type) stmt.run({ $d: day.id, $u: e.user_id, $s: e.shift_type });
  }
}

// ==================== دالة مشتركة لتصدير Excel (مطابق لأعمدة Daily Report الرسمي) ====================

const MONTHS_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function officialRow(e, seq) {
  const [y, m, d] = e.date.split("-").map(Number);
  const monthAbbr = MONTHS_ABBR[m - 1];
  return {
    "#": seq,
    "Date": `${String(d).padStart(2,"0")}-${String(m).padStart(2,"0")}-${y}`,
    "Day": d, "Month - D": m, "Month - Text": monthAbbr, "Year": y,
    "Month - Year": `${y}-${monthAbbr.toUpperCase()}`, "Time": e.time,
    "Coustomer name": e.customer_name, "PhoneNumber": e.phone_number || "", "BG": e.bg || "",
    "Employee Name": e.employee_name, "Visit reason": e.visit_reason || "", "Price": e.price ?? "",
    "Item name": e.item_name || "", "ID": e.ref_id || "", "Migrations up": e.migrations_up || "",
    "Revenue Amount": e.revenue_amount ?? "", "Status": e.status || "", "Notes": e.notes || "",
    "Shop Name": e.shop_name || ""
  };
}

async function sendExcel(res, rows, date) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Daily Report");
  if (rows.length > 0) {
    const headers = Object.keys(officialRow(rows[0], 1));
    ws.columns = headers.map(key => ({ header: key, key }));
    rows.forEach((r, i) => ws.addRow(officialRow(r, i + 1)));

    // تنسيق صف العناوين: كتابة بيضاء على خلفية نيلي/كحلي داكن
    const headerRow = ws.getRow(1);
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E2A5E" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    headerRow.height = 20;

    // احتساب عرض كل عمود حسب أطول محتوى فيه فقط (بدون مسافات زائدة)
    ws.columns.forEach(column => {
      let maxLen = column.header ? String(column.header).length : 8;
      column.eachCell({ includeEmpty: false }, cell => {
        const len = cell.value === null || cell.value === undefined ? 0 : String(cell.value).length;
        if (len > maxLen) maxLen = len;
      });
      column.width = Math.min(maxLen + 2, 40);
    });
  } else {
    ws.addRow(["لا توجد بيانات لهذا اليوم"]);
  }
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="Daily_Report_${date || "all"}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}

app.listen(PORT, () => {
  console.log(`✔ المنصة تعمل الآن على المنفذ ${PORT}`);
  console.log(`  http://localhost:${PORT}`);
});
