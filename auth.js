// auth.js — المصادقة (JWT في كوكي httpOnly) والتحقق من الأدوار
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn("\n⚠ تحذير أمني: لم يتم تعيين متغير البيئة JWT_SECRET، سيتم استخدام مفتاح عشوائي مؤقت.");
  console.warn("  هذا يعني أن جميع الجلسات ستُلغى عند كل إعادة تشغيل للسيرفر.");
  console.warn("  لبيئة الإنتاج، عيّن JWT_SECRET بقيمة طويلة وعشوائية وثابتة.\n");
}
const SECRET = JWT_SECRET || require("crypto").randomBytes(32).toString("hex");

function hashPassword(pw) { return bcrypt.hashSync(pw, 10); }
function verifyPassword(pw, hash) { return bcrypt.compareSync(pw, hash); }

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, office_id: user.office_id, full_name: user.full_name },
    SECRET,
    { expiresIn: "12h" }
  );
}

function authMiddleware(req, res, next) {
  const token = req.cookies && req.cookies.token;
  if (!token) return res.status(401).json({ ok: false, error: "الرجاء تسجيل الدخول" });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (e) {
    res.status(401).json({ ok: false, error: "انتهت صلاحية الجلسة، الرجاء تسجيل الدخول مرة أخرى" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ ok: false, error: "لا تملك صلاحية للقيام بهذا الإجراء" });
    }
    next();
  };
}

// حماية بسيطة من محاولات تخمين كلمة السر (rate limiting بالذاكرة)
const loginAttempts = new Map(); // key: ip+username -> { count, lockUntil }
function checkLoginRateLimit(key) {
  const rec = loginAttempts.get(key);
  if (!rec) return { allowed: true };
  if (rec.lockUntil && Date.now() < rec.lockUntil) {
    return { allowed: false, retryAfterSec: Math.ceil((rec.lockUntil - Date.now()) / 1000) };
  }
  return { allowed: true };
}
function recordLoginFailure(key) {
  const rec = loginAttempts.get(key) || { count: 0 };
  rec.count += 1;
  if (rec.count >= 5) {
    rec.lockUntil = Date.now() + 5 * 60 * 1000; // قفل 5 دقائق بعد 5 محاولات فاشلة
    rec.count = 0;
  }
  loginAttempts.set(key, rec);
}
function clearLoginFailures(key) { loginAttempts.delete(key); }

module.exports = {
  hashPassword, verifyPassword, signToken, authMiddleware, requireRole,
  checkLoginRateLimit, recordLoginFailure, clearLoginFailures
};
