// features.js — الميزات الإضافية: البروفايل، الثيمات، المعايدات، الإشعارات، لوحة الصدارة، الألعاب، الملاحظات
const express = require("express");

const TZ = process.env.APP_TZ || "Asia/Baghdad";

// ---------- أدوات التاريخ (بتوقيت العراق) ----------
function localDate(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function addDays(ymd, n) {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
// يطابق يوم وشهر تاريخ مناسبة مع اليوم (29 فبراير يُحتفل به 28 فبراير في السنوات غير الكبيسة)
function matchesToday(dateStr, today) {
  if (!dateStr || dateStr.length < 10) return false;
  const md = dateStr.slice(5, 10);
  const todayMd = today.slice(5, 10);
  if (md === todayMd) return true;
  const y = Number(today.slice(0, 4));
  return md === "02-29" && todayMd === "02-28" && !isLeap(y);
}

// ---------- ثوابت التحقق ----------
const THEMES = ["supercell", "ocean", "emerald", "royal", "sunset", "graphite", "teal"];
const STYLES = ["classic", "soft", "glass", "compact"];
const MODES = ["light", "dark", "auto"];
const NOTE_COLORS = ["default", "red", "orange", "yellow", "green", "blue", "purple"];
const GAMES = {
  math:     { name: "الحساب السريع",   max: 3000, minMs: 50000 },
  memory:   { name: "ذاكرة البطاقات",  max: 1000, minMs: 6000 },
  sequence: { name: "تسلسل الألوان",   max: 3000, minMs: 3000 },
  pattern:  { name: "أكمل السلسلة",    max: 1200, minMs: 8000 }
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9]{7,15}$/;

function cleanStr(v, max) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
}
function validDate(s) {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}
// صيغة العدد الصحيحة بالعربية للسنوات
function yearsAr(n) {
  if (n === 1) return "سنة";
  if (n === 2) return "سنتان";
  if (n >= 3 && n <= 10) return `${n} سنوات`;
  return `${n} سنة`;
}
function parsePrefs(raw) {
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

module.exports = function mountFeatures(app, db, { authMiddleware, requireRole }) {

  // ---------- دوال مساعدة ----------
  function notify(userId, type, title, body) {
    db.prepare("INSERT INTO notifications (user_id, type, title, body, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(userId, type, title, body || null, new Date().toISOString());
  }
  function getUser(id) {
    return db.prepare(`
      SELECT u.*, o.name AS office_name FROM users u LEFT JOIN offices o ON o.id = u.office_id WHERE u.id = ?
    `).get(id);
  }
  // هل يملك المستخدم الحالي صلاحية إدارة ملف هذا الشخص؟
  function canManage(actor, target) {
    if (!target) return false;
    if (actor.role === "super_admin") return true;
    if (actor.role === "office_admin") return target.office_id === actor.office_id && target.role === "employee";
    return false;
  }
  function publicCard(u, full) {
    const card = {
      id: u.id, full_name: u.full_name, role: u.role, office_name: u.office_name || null,
      avatar: u.avatar || null, job_title: u.job_title || null, bio: u.bio || null,
      hire_year: u.hire_date ? Number(u.hire_date.slice(0, 4)) : null, employee_type: u.employee_type || "regular"
    };
    if (full) Object.assign(card, {
      username: u.username, birth_date: u.birth_date || null, gender: u.gender || null,
      phone: u.phone || null, personal_email: u.personal_email || null, hire_date: u.hire_date || null
    });
    return card;
  }

  // ==================== البروفايل والتفضيلات ====================
  const me = express.Router();
  me.use(authMiddleware);

  me.get("/profile", (req, res) => {
    const u = getUser(req.user.id);
    if (!u) return res.status(404).json({ ok: false, error: "المستخدم غير موجود" });
    res.json({ ok: true, profile: publicCard(u, true), preferences: parsePrefs(u.preferences) });
  });

  me.put("/profile", (req, res) => {
    const b = req.body || {};
    const birth = cleanStr(b.birth_date, 10);
    const hire = cleanStr(b.hire_date, 10);
    const gender = cleanStr(b.gender, 10);
    const phone = cleanStr(b.phone, 20);
    const email = cleanStr(b.personal_email, 120);
    const avatar = cleanStr(b.avatar, 16);
    const bio = cleanStr(b.bio, 200);
    const today = localDate();

    if (birth) {
      if (!validDate(birth)) return res.status(400).json({ ok: false, error: "تاريخ الميلاد غير صالح" });
      const age = Number(today.slice(0, 4)) - Number(birth.slice(0, 4));
      if (birth > today || age < 15 || age > 90) return res.status(400).json({ ok: false, error: "تاريخ الميلاد غير منطقي" });
    }
    if (hire && (!validDate(hire) || hire > today || hire < "1990-01-01")) {
      return res.status(400).json({ ok: false, error: "تاريخ الانضمام غير صالح" });
    }
    if (gender && !["male", "female"].includes(gender)) return res.status(400).json({ ok: false, error: "قيمة الجنس غير صالحة" });
    if (phone && !PHONE_RE.test(phone.replace(/[\s-]/g, ""))) return res.status(400).json({ ok: false, error: "رقم الهاتف غير صالح" });
    if (email && !EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: "البريد الإلكتروني غير صالح" });

    db.prepare(`
      UPDATE users SET birth_date=$b, hire_date=$h, gender=$g, phone=$p, personal_email=$e, avatar=$a, bio=$bio WHERE id=$id
    `).run({ $b: birth, $h: hire, $g: gender, $p: phone ? phone.replace(/[\s-]/g, "") : null, $e: email, $a: avatar, $bio: bio, $id: req.user.id });
    res.json({ ok: true, profile: publicCard(getUser(req.user.id), true) });
  });

  me.put("/preferences", (req, res) => {
    const b = req.body || {};
    const current = parsePrefs(getUser(req.user.id).preferences);
    const next = { ...current };
    if (b.theme !== undefined) { if (!THEMES.includes(b.theme)) return res.status(400).json({ ok: false, error: "ثيم غير معروف" }); next.theme = b.theme; }
    if (b.style !== undefined) { if (!STYLES.includes(b.style)) return res.status(400).json({ ok: false, error: "ستايل غير معروف" }); next.style = b.style; }
    if (b.mode !== undefined) { if (!MODES.includes(b.mode)) return res.status(400).json({ ok: false, error: "وضع غير معروف" }); next.mode = b.mode; }
    if (b.motion !== undefined) next.motion = b.motion ? "on" : "off";
    db.prepare("UPDATE users SET preferences = ? WHERE id = ?").run(JSON.stringify(next), req.user.id);
    res.json({ ok: true, preferences: next });
  });

  app.use("/api/me", me);

  // ==================== الأشخاص (بطاقة عامة + إدارة الفريق) ====================
  const people = express.Router();
  people.use(authMiddleware);

  people.get("/:id", (req, res) => {
    const u = getUser(Number(req.params.id));
    if (!u || !u.active) return res.status(404).json({ ok: false, error: "المستخدم غير موجود" });
    const full = u.id === req.user.id || canManage(req.user, u);
    const promos = db.prepare("SELECT title, created_at FROM promotions WHERE user_id = ? ORDER BY id DESC LIMIT 5").all(u.id);
    res.json({ ok: true, person: publicCard(u, full), promotions: promos, can_manage: canManage(req.user, u) });
  });

  // قائمة الفريق للإدارة
  people.get("/", requireRole("super_admin", "office_admin"), (req, res) => {
    const rows = req.user.role === "super_admin"
      ? db.prepare(`SELECT u.*, o.name AS office_name FROM users u LEFT JOIN offices o ON o.id=u.office_id
                    WHERE u.role IN ('employee','office_admin') ORDER BY o.name, u.full_name`).all()
      : db.prepare(`SELECT u.*, o.name AS office_name FROM users u LEFT JOIN offices o ON o.id=u.office_id
                    WHERE u.office_id = ? AND u.role IN ('employee','office_admin') ORDER BY u.full_name`).all(req.user.office_id);
    res.json({ ok: true, people: rows.map(u => ({ ...publicCard(u, true), active: u.active })) });
  });

  people.put("/:id/work", requireRole("super_admin", "office_admin"), (req, res) => {
    const target = getUser(Number(req.params.id));
    if (!canManage(req.user, target)) return res.status(403).json({ ok: false, error: "لا تملك صلاحية تعديل هذا الحساب" });
    const hire = cleanStr(req.body.hire_date, 10);
    const title = cleanStr(req.body.job_title, 60);
    if (hire && (!validDate(hire) || hire > localDate())) return res.status(400).json({ ok: false, error: "تاريخ الانضمام غير صالح" });
    db.prepare("UPDATE users SET hire_date = ?, job_title = ? WHERE id = ?").run(hire, title, target.id);
    res.json({ ok: true });
  });

  people.post("/:id/promote", requireRole("super_admin", "office_admin"), (req, res) => {
    const target = getUser(Number(req.params.id));
    if (!canManage(req.user, target)) return res.status(403).json({ ok: false, error: "لا تملك صلاحية ترقية هذا الحساب" });
    const title = cleanStr(req.body.title, 60);
    const note = cleanStr(req.body.note, 200);
    if (!title) return res.status(400).json({ ok: false, error: "المسمى الوظيفي الجديد مطلوب" });
    db.prepare("INSERT INTO promotions (user_id, title, note, created_by, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(target.id, title, note, req.user.id, new Date().toISOString());
    db.prepare("UPDATE users SET job_title = ? WHERE id = ?").run(title, target.id);
    notify(target.id, "celebration", "🎉 مبروك الترقية!", `تمت ترقيتك إلى: ${title}. فريق سوبرسيل فخور بك!`);
    res.json({ ok: true });
  });

  app.use("/api/people", people);

  // ==================== المناسبات والمعايدات ====================
  function todaysEvents() {
    const today = localDate();
    const year = today.slice(0, 4);
    const events = [];
    const users = db.prepare(`
      SELECT u.id, u.full_name, u.avatar, u.birth_date, u.hire_date, u.job_title, o.name AS office_name
      FROM users u LEFT JOIN offices o ON o.id = u.office_id
      WHERE u.active = 1 AND u.role IN ('employee','office_admin')
    `).all();
    for (const u of users) {
      const person = { id: u.id, full_name: u.full_name, avatar: u.avatar, office_name: u.office_name, job_title: u.job_title };
      if (matchesToday(u.birth_date, today)) {
        events.push({ key: `bday:${u.id}:${year}`, type: "birthday", user: person });
      }
      if (u.hire_date && matchesToday(u.hire_date, today)) {
        const years = Number(year) - Number(u.hire_date.slice(0, 4));
        if (years >= 1) events.push({ key: `anniv:${u.id}:${year}`, type: "anniversary", years, user: person });
      }
    }
    // الترقيات خلال آخر 3 أيام
    const since = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
    const promos = db.prepare(`
      SELECT p.id, p.title, p.created_at, u.id AS uid, u.full_name, u.avatar, u.job_title, o.name AS office_name
      FROM promotions p JOIN users u ON u.id = p.user_id LEFT JOIN offices o ON o.id = u.office_id
      WHERE p.created_at >= ? AND u.active = 1 ORDER BY p.id DESC
    `).all(since);
    for (const p of promos) {
      events.push({
        key: `promo:${p.id}`, type: "promotion", title: p.title,
        user: { id: p.uid, full_name: p.full_name, avatar: p.avatar, office_name: p.office_name, job_title: p.job_title }
      });
    }
    return events;
  }

  // يرسل تهنئة النظام للشخص صاحب المناسبة مرة واحدة فقط
  function runCelebrationJob() {
    try {
      for (const ev of todaysEvents()) {
        if (ev.type === "promotion") continue; // إشعار الترقية يُرسل لحظة تسجيلها
        const exists = db.prepare("SELECT 1 FROM celebration_log WHERE event_key = ?").get(ev.key);
        if (exists) continue;
        db.prepare("INSERT INTO celebration_log (event_key, created_at) VALUES (?, ?)").run(ev.key, new Date().toISOString());
        if (ev.type === "birthday") {
          notify(ev.user.id, "celebration", "🎂 كل عام وأنت بخير!", "فريق سوبرسيل يتمنى لك عيد ميلاد سعيداً وعاماً مليئاً بالنجاح.");
        } else if (ev.type === "anniversary") {
          notify(ev.user.id, "celebration", `🎉 ${yearsAr(ev.years)} مع سوبرسيل!`, "شكراً لعطائك وجهودك، نحن فخورون بوجودك معنا.");
        }
      }
    } catch (e) { console.error("celebration job:", e.message); }
  }

  const cel = express.Router();
  cel.use(authMiddleware);

  cel.get("/today", (req, res) => {
    const events = todaysEvents().map(ev => {
      const count = db.prepare("SELECT COUNT(*) AS n FROM greetings WHERE event_key = ?").get(ev.key).n;
      const mine = db.prepare("SELECT 1 FROM greetings WHERE event_key = ? AND from_user_id = ?").get(ev.key, req.user.id);
      return { ...ev, greetings_count: count, greeted_by_me: !!mine, is_me: ev.user.id === req.user.id };
    });
    res.json({ ok: true, events });
  });

  cel.get("/mine", (req, res) => {
    const events = todaysEvents().filter(ev => ev.user.id === req.user.id).map(ev => {
      const greetings = db.prepare(`
        SELECT g.message, g.created_at, u.full_name, u.avatar FROM greetings g JOIN users u ON u.id = g.from_user_id
        WHERE g.event_key = ? ORDER BY g.id DESC
      `).all(ev.key);
      return { ...ev, greetings };
    });
    res.json({ ok: true, events });
  });

  cel.post("/greet", (req, res) => {
    const key = cleanStr((req.body || {}).event_key, 60);
    const message = cleanStr((req.body || {}).message, 200);
    if (!key || !message) return res.status(400).json({ ok: false, error: "الرسالة مطلوبة" });
    const ev = todaysEvents().find(e => e.key === key);
    if (!ev) return res.status(400).json({ ok: false, error: "هذه المناسبة لم تعد متاحة" });
    if (ev.user.id === req.user.id) return res.status(400).json({ ok: false, error: "لا يمكنك معايدة نفسك 😄" });
    try {
      db.prepare("INSERT INTO greetings (from_user_id, to_user_id, event_key, message, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(req.user.id, ev.user.id, key, message, new Date().toISOString());
    } catch (e) {
      return res.status(400).json({ ok: false, error: "أرسلت معايدة لهذه المناسبة مسبقاً" });
    }
    notify(ev.user.id, "greeting", `💌 معايدة من ${req.user.full_name}`, message);
    res.json({ ok: true });
  });

  app.use("/api/celebrations", cel);

  // ==================== الإشعارات ====================
  function fireDueReminders() {
    try {
      const now = new Date().toISOString();
      const due = db.prepare("SELECT id, user_id, title, body FROM notes WHERE reminded = 0 AND done = 0 AND remind_at IS NOT NULL AND remind_at <= ?").all(now);
      for (const n of due) {
        db.prepare("UPDATE notes SET reminded = 1 WHERE id = ?").run(n.id);
        notify(n.user_id, "reminder", `⏰ تذكير: ${n.title}`, n.body ? n.body.slice(0, 160) : null);
      }
    } catch (e) { console.error("reminder job:", e.message); }
  }

  const notif = express.Router();
  notif.use(authMiddleware);

  notif.get("/", (req, res) => {
    fireDueReminders();
    const items = db.prepare("SELECT id, type, title, body, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 40").all(req.user.id);
    const unread = db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0").get(req.user.id).n;
    res.json({ ok: true, items, unread });
  });

  notif.post("/read", (req, res) => {
    const ids = Array.isArray((req.body || {}).ids) ? req.body.ids.map(Number).filter(Number.isInteger) : null;
    if (ids && ids.length) {
      const stmt = db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?");
      ids.forEach(id => stmt.run(id, req.user.id));
    } else {
      db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?").run(req.user.id);
    }
    res.json({ ok: true });
  });

  app.use("/api/notifications", notif);

  // ==================== لوحة الصدارة ====================
  function periodRange(period) {
    const today = localDate();
    if (period === "week") {
      const day = new Date(today + "T00:00:00Z").getUTCDay(); // 6 = السبت
      return { from: addDays(today, -((day - 6 + 7) % 7)), to: today };
    }
    if (period === "last_month") {
      const first = today.slice(0, 8) + "01";
      const lastPrevEnd = addDays(first, -1);
      return { from: lastPrevEnd.slice(0, 8) + "01", to: lastPrevEnd };
    }
    if (period === "all") return { from: "0000-00-00", to: "9999-12-31" };
    return { from: today.slice(0, 8) + "01", to: today }; // الشهر الحالي (افتراضي)
  }

  // تصنيف المعاملة حسب قواعد المنافسة
  function classify(e) {
    const status = (e.status || "").trim().toLowerCase();
    if (status === "closed") return null; // الطلبات الملغاة لا تُحتسب
    const r = (e.visit_reason || "").trim().toLowerCase();
    const upgrade = (e.migrations_up || "").includes("✔") || r.includes("migrations up");
    const plainRenewal = r.startsWith("recharge card") && !upgrade; // التجديد الاعتيادي بدون عوائد إضافية
    return {
      maintenance: r.startsWith("maintenance") ? 1 : 0,
      installation: r.startsWith("installation") ? 1 : 0,
      upgrades: upgrade ? 1 : 0,
      revenue: plainRenewal ? 0 : (Number(e.revenue_amount) || 0)
    };
  }

  function rankRows(rows) {
    const METRICS = ["maintenance", "installation", "upgrades", "revenue"];
    const totals = {};
    METRICS.forEach(m => { totals[m] = rows.reduce((s, r) => s + r[m], 0); });
    const active = METRICS.filter(m => totals[m] > 0);
    rows.forEach(r => {
      r.shares = {};
      METRICS.forEach(m => { r.shares[m] = totals[m] > 0 ? Math.round((r[m] / totals[m]) * 1000) / 10 : 0; });
      r.score = active.length ? Math.round(active.reduce((s, m) => s + r.shares[m], 0) / active.length * 10) / 10 : 0;
    });
    rows.sort((a, b) => b.score - a.score || b.revenue - a.revenue || a.name.localeCompare(b.name, "ar"));
    rows.forEach((r, i) => { r.rank = i + 1; });
    return { rows, totals };
  }

  const lb = express.Router();
  lb.use(authMiddleware);

  lb.get("/", (req, res) => {
    const period = ["week", "month", "last_month", "all"].includes(req.query.period) ? req.query.period : "month";
    const scope = req.query.scope === "offices" ? "offices" : "employees";
    const { from, to } = periodRange(period);
    const entries = db.prepare("SELECT user_id, office_id, visit_reason, migrations_up, revenue_amount, status FROM entries WHERE date >= ? AND date <= ?").all(from, to);

    const map = new Map();
    if (scope === "offices") {
      db.prepare("SELECT id, name FROM offices").all().forEach(o =>
        map.set(o.id, { id: o.id, name: o.name, maintenance: 0, installation: 0, upgrades: 0, revenue: 0, requests: 0 }));
      entries.forEach(e => {
        const c = classify(e); const row = map.get(e.office_id);
        if (!c || !row) return;
        row.maintenance += c.maintenance; row.installation += c.installation; row.upgrades += c.upgrades; row.revenue += c.revenue; row.requests++;
      });
    } else {
      db.prepare(`SELECT u.id, u.full_name, u.avatar, o.name AS office_name FROM users u LEFT JOIN offices o ON o.id=u.office_id
                  WHERE u.active = 1 AND u.role IN ('employee','office_admin')`).all().forEach(u =>
        map.set(u.id, { id: u.id, name: u.full_name, avatar: u.avatar, office_name: u.office_name, maintenance: 0, installation: 0, upgrades: 0, revenue: 0, requests: 0 }));
      entries.forEach(e => {
        const c = classify(e); const row = map.get(e.user_id);
        if (!c || !row) return;
        row.maintenance += c.maintenance; row.installation += c.installation; row.upgrades += c.upgrades; row.revenue += c.revenue; row.requests++;
      });
    }
    const { rows, totals } = rankRows([...map.values()]);
    const mine = scope === "offices"
      ? rows.find(r => r.id === req.user.office_id) || null
      : rows.find(r => r.id === req.user.id) || null;
    res.json({ ok: true, period, scope, from, to, totals, rows, mine });
  });

  app.use("/api/leaderboard", lb);

  // ==================== الألعاب ====================
  const lastSubmit = new Map();
  const games = express.Router();
  games.use(authMiddleware);

  function gameBoard(game, userId, limit = 20) {
    const top = db.prepare(`
      SELECT u.id, u.full_name, u.avatar, o.name AS office_name, MAX(g.score) AS best, COUNT(*) AS plays
      FROM game_scores g JOIN users u ON u.id = g.user_id LEFT JOIN offices o ON o.id = u.office_id
      WHERE g.game = ? GROUP BY g.user_id ORDER BY best DESC, MIN(g.created_at) ASC LIMIT ?
    `).all(game, limit);
    const myBest = db.prepare("SELECT MAX(score) AS best, COUNT(*) AS plays FROM game_scores WHERE game = ? AND user_id = ?").get(game, userId);
    let myRank = null;
    if (myBest && myBest.best !== null) {
      myRank = db.prepare(`SELECT COUNT(*) + 1 AS r FROM (SELECT user_id, MAX(score) AS b FROM game_scores WHERE game = ? GROUP BY user_id) WHERE b > ?`).get(game, myBest.best).r;
    }
    return { top, my_best: myBest ? myBest.best : null, my_plays: myBest ? myBest.plays : 0, my_rank: myRank };
  }

  games.get("/overview", (req, res) => {
    const perGame = {};
    for (const g of Object.keys(GAMES)) {
      const b = gameBoard(g, req.user.id, 1);
      perGame[g] = { name: GAMES[g].name, max: GAMES[g].max, leader: b.top[0] || null, my_best: b.my_best, my_rank: b.my_rank, my_plays: b.my_plays };
    }
    // النقاط الإجمالية = مجموع أفضل نتيجة للموظف في كل لعبة
    const overall = db.prepare(`
      SELECT u.id, u.full_name, u.avatar, o.name AS office_name, SUM(best) AS points
      FROM (SELECT user_id, game, MAX(score) AS best FROM game_scores GROUP BY user_id, game) b
      JOIN users u ON u.id = b.user_id LEFT JOIN offices o ON o.id = u.office_id
      GROUP BY b.user_id ORDER BY points DESC LIMIT 20
    `).all();
    const myPoints = db.prepare("SELECT COALESCE(SUM(best),0) AS p FROM (SELECT MAX(score) AS best FROM game_scores WHERE user_id = ? GROUP BY game)").get(req.user.id).p;
    res.json({ ok: true, games: perGame, overall, my_points: myPoints });
  });

  games.get("/:game/leaderboard", (req, res) => {
    const game = req.params.game;
    if (!GAMES[game]) return res.status(404).json({ ok: false, error: "لعبة غير معروفة" });
    res.json({ ok: true, game, name: GAMES[game].name, ...gameBoard(game, req.user.id) });
  });

  games.post("/:game/score", (req, res) => {
    const game = req.params.game;
    const cfg = GAMES[game];
    if (!cfg) return res.status(404).json({ ok: false, error: "لعبة غير معروفة" });
    const score = Math.round(Number((req.body || {}).score));
    const duration = Math.round(Number((req.body || {}).duration_ms));
    if (!Number.isFinite(score) || score < 0 || score > cfg.max) return res.status(400).json({ ok: false, error: "نتيجة غير صالحة" });
    if (!Number.isFinite(duration) || duration < cfg.minMs || duration > 60 * 60 * 1000) return res.status(400).json({ ok: false, error: "مدة اللعب غير منطقية" });
    const key = req.user.id + ":" + game;
    const last = lastSubmit.get(key) || 0;
    if (Date.now() - last < 4000) return res.status(429).json({ ok: false, error: "انتظر قليلاً قبل تسجيل نتيجة جديدة" });
    lastSubmit.set(key, Date.now());

    const prevBest = db.prepare("SELECT MAX(score) AS b FROM game_scores WHERE game = ? AND user_id = ?").get(game, req.user.id).b;
    db.prepare("INSERT INTO game_scores (user_id, game, score, duration_ms, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(req.user.id, game, score, duration, new Date().toISOString());
    const board = gameBoard(game, req.user.id);
    res.json({ ok: true, is_new_best: prevBest === null || score > prevBest, ...board });
  });

  app.use("/api/games", games);

  // ==================== الملاحظات والتذكيرات ====================
  const notes = express.Router();
  notes.use(authMiddleware);

  function readNoteBody(b, isUpdate) {
    const out = {};
    if (!isUpdate || b.title !== undefined) {
      out.title = cleanStr(b.title, 120);
      if (!out.title) throw new Error("عنوان الملاحظة مطلوب");
    }
    if (!isUpdate || b.body !== undefined) out.body = cleanStr(b.body, 5000);
    if (!isUpdate || b.color !== undefined) out.color = NOTE_COLORS.includes(b.color) ? b.color : "default";
    if (b.pinned !== undefined) out.pinned = b.pinned ? 1 : 0;
    if (b.done !== undefined) out.done = b.done ? 1 : 0;
    if (!isUpdate || b.remind_at !== undefined) {
      if (b.remind_at) {
        const d = new Date(b.remind_at);
        if (isNaN(d)) throw new Error("وقت التذكير غير صالح");
        out.remind_at = d.toISOString();
        out.reminded = d.getTime() <= Date.now() ? 1 : 0;
      } else { out.remind_at = null; out.reminded = 0; }
    }
    return out;
  }

  notes.get("/", (req, res) => {
    const rows = db.prepare("SELECT * FROM notes WHERE user_id = ? ORDER BY pinned DESC, done ASC, updated_at DESC").all(req.user.id);
    res.json({ ok: true, notes: rows });
  });

  notes.post("/", (req, res) => {
    let d;
    try { d = readNoteBody(req.body || {}, false); } catch (e) { return res.status(400).json({ ok: false, error: e.message }); }
    const count = db.prepare("SELECT COUNT(*) AS n FROM notes WHERE user_id = ?").get(req.user.id).n;
    if (count >= 500) return res.status(400).json({ ok: false, error: "وصلت للحد الأقصى من الملاحظات (500)" });
    const now = new Date().toISOString();
    const info = db.prepare(`
      INSERT INTO notes (user_id, title, body, color, pinned, done, remind_at, reminded, created_at, updated_at)
      VALUES ($u, $t, $b, $c, $p, 0, $r, $rd, $now, $now)
    `).run({ $u: req.user.id, $t: d.title, $b: d.body, $c: d.color, $p: d.pinned || 0, $r: d.remind_at, $rd: d.reminded, $now: now });
    res.json({ ok: true, note: db.prepare("SELECT * FROM notes WHERE id = ?").get(info.lastInsertRowid) });
  });

  notes.put("/:id", (req, res) => {
    const note = db.prepare("SELECT * FROM notes WHERE id = ? AND user_id = ?").get(Number(req.params.id), req.user.id);
    if (!note) return res.status(404).json({ ok: false, error: "الملاحظة غير موجودة" });
    let d;
    try { d = readNoteBody(req.body || {}, true); } catch (e) { return res.status(400).json({ ok: false, error: e.message }); }
    const merged = { ...note, ...d, updated_at: new Date().toISOString() };
    db.prepare(`
      UPDATE notes SET title=$t, body=$b, color=$c, pinned=$p, done=$d, remind_at=$r, reminded=$rd, updated_at=$u WHERE id=$id
    `).run({ $t: merged.title, $b: merged.body, $c: merged.color, $p: merged.pinned, $d: merged.done, $r: merged.remind_at, $rd: merged.reminded, $u: merged.updated_at, $id: note.id });
    res.json({ ok: true, note: db.prepare("SELECT * FROM notes WHERE id = ?").get(note.id) });
  });

  notes.delete("/:id", (req, res) => {
    db.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?").run(Number(req.params.id), req.user.id);
    res.json({ ok: true });
  });

  app.use("/api/notes", notes);

  // ==================== المهام الخلفية ====================
  runCelebrationJob();
  setInterval(fireDueReminders, 30 * 1000).unref();
  setInterval(runCelebrationJob, 10 * 60 * 1000).unref();

  return { parsePrefs };
};
