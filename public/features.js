// features.js — واجهة الميزات الإضافية لمنصة سوبرسيل
(function () {
  "use strict";

  // ==================== أدوات عامة ====================
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const pad = n => String(n).padStart(2, "0");
  const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  const num = n => Number(n || 0).toLocaleString("en-US");
  const motionOff = () => document.documentElement.dataset.motion === "off" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const me = () => (typeof CURRENT_USER !== "undefined" ? CURRENT_USER : null);

  async function call(url, method = "GET", body) {
    const opts = { method, headers: {} };
    if (body !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    const r = await fetch(url, opts);
    const data = await r.json().catch(() => ({ ok: false, error: "استجابة غير صالحة من السيرفر" }));
    if (!r.ok || data.ok === false) throw new Error(data.error || "حدث خطأ");
    return data;
  }

  function fmtDT(iso) {
    const d = new Date(iso); let h = d.getHours(); const ap = h < 12 ? "ص" : "م"; h = h % 12 || 12;
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${h}:${pad(d.getMinutes())} ${ap}`;
  }
  function timeAgo(iso) {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 60) return "الآن";
    if (s < 3600) return `قبل ${Math.floor(s / 60)} دقيقة`;
    if (s < 86400) return `قبل ${Math.floor(s / 3600)} ساعة`;
    return fmtDT(iso);
  }
  function toLocalInput(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  function yearsAr(n) { if (n === 1) return "سنة"; if (n === 2) return "سنتان"; if (n >= 3 && n <= 10) return `${n} سنوات`; return `${n} سنة`; }
  function av(u, size = "") {
    const a = u && u.avatar ? esc(u.avatar) : esc(((u && (u.full_name || u.name)) || "؟").trim().charAt(0));
    return `<span class="fx-av ${size}">${a}</span>`;
  }
  function countUp(node, to, decimals = 0) {
    if (!node) return;
    if (motionOff()) { node.textContent = Number(to).toFixed(decimals); return; }
    const start = performance.now(), dur = 750;
    (function step(now) {
      const p = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - p, 3);
      node.textContent = (to * e).toFixed(decimals);
      if (p < 1) requestAnimationFrame(step);
    })(start);
  }

  // ==================== الثيمات والتفضيلات ====================
  const THEMES = {
    supercell: { name: "سوبرسيل", c: ["#D41A34", "#6E0A1B"] },
    ocean:     { name: "المحيط",   c: ["#1C7ED6", "#07335C"] },
    emerald:   { name: "الزمرد",   c: ["#12A06F", "#064734"] },
    royal:     { name: "ملكي",     c: ["#7B4DDB", "#2E1A5E"] },
    sunset:    { name: "الغروب",   c: ["#EA6A1C", "#7A2E06"] },
    teal:      { name: "فيروزي",   c: ["#14A3A8", "#094B50"] },
    graphite:  { name: "جرافيت",   c: ["#4C6275", "#1B1F27"] }
  };
  const STYLES = {
    classic: ["كلاسيكي", "حدود واضحة وزوايا متوسطة"],
    soft:    ["ناعم", "بطاقات بظلال خفيفة وزوايا دائرية"],
    glass:   ["زجاجي", "بطاقات شفافة فوق خلفية ملونة"],
    compact: ["مضغوط", "مسافات أقل لعرض بيانات أكثر"]
  };
  const DEFAULT_PREFS = { theme: "supercell", style: "classic", mode: "light", motion: "on" };
  const LS_KEY = "sc_prefs";
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  let prefs = loadLocalPrefs();
  let saveTimer = null;

  function loadLocalPrefs() {
    try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(LS_KEY) || "{}") }; }
    catch { return { ...DEFAULT_PREFS }; }
  }
  function applyPrefs() {
    const h = document.documentElement;
    h.dataset.theme = THEMES[prefs.theme] ? prefs.theme : "supercell";
    h.dataset.style = STYLES[prefs.style] ? prefs.style : "classic";
    h.dataset.motion = prefs.motion === "off" ? "off" : "on";
    h.dataset.mode = prefs.mode === "auto" ? (mq.matches ? "dark" : "light") : (prefs.mode === "dark" ? "dark" : "light");
    if (window.Chart) {
      const cs = getComputedStyle(h);
      window.Chart.defaults.color = cs.getPropertyValue("--ink-soft").trim() || "#6B5457";
      window.Chart.defaults.borderColor = cs.getPropertyValue("--line").trim() || "#EDDBDC";
    }
  }
  function savePrefs(patch) {
    const modeChanged = patch.mode !== undefined && patch.mode !== prefs.mode;
    prefs = { ...prefs, ...patch };
    try { localStorage.setItem(LS_KEY, JSON.stringify(prefs)); } catch {}
    applyPrefs();
    if (modeChanged && typeof ACTIVE_TAB !== "undefined" && ACTIVE_TAB === "stats" && typeof renderTab === "function") renderTab("stats");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      call("/api/me/preferences", "PUT", { theme: prefs.theme, style: prefs.style, mode: prefs.mode, motion: prefs.motion !== "off" }).catch(() => {});
    }, 400);
  }
  applyPrefs();
  mq.addEventListener && mq.addEventListener("change", () => { if (prefs.mode === "auto") applyPrefs(); });

  function openThemePanel() {
    const m = modal({ title: "المظهر", html: "" });
    function draw() {
      m.body.innerHTML = `
        <div class="fx-section-title">لون الواجهة</div>
        <div class="fx-swatches">
          ${Object.entries(THEMES).map(([k, t]) => `
            <button class="fx-swatch${prefs.theme === k ? " on" : ""}" data-theme="${k}">
              <div class="dot" style="background:linear-gradient(135deg,${t.c[0]},${t.c[1]})"></div>${t.name}
            </button>`).join("")}
        </div>
        <div class="fx-section-title">الستايل</div>
        <div class="fx-styles">
          ${Object.entries(STYLES).map(([k, s]) => `
            <button class="fx-style-card${prefs.style === k ? " on" : ""}" data-style="${k}">
              <div class="fx-style-prev ${k}"><i></i><i></i><i></i></div><b>${s[0]}</b><span>${s[1]}</span>
            </button>`).join("")}
        </div>
        <div class="fx-section-title">الإضاءة</div>
        <div class="fx-seg" role="group" aria-label="الإضاءة">
          <button data-mode="light" class="${prefs.mode === "light" ? "on" : ""}">☀️ فاتح</button>
          <button data-mode="dark" class="${prefs.mode === "dark" ? "on" : ""}">🌙 داكن</button>
          <button data-mode="auto" class="${prefs.mode === "auto" ? "on" : ""}">🖥️ حسب الجهاز</button>
        </div>
        <div class="fx-section-title">الحركة</div>
        <label class="fx-switch"><span>تأثيرات الحركة والانتقالات</span>
          <input type="checkbox" class="fx-toggle" id="fxMotion" ${prefs.motion !== "off" ? "checked" : ""}></label>
        <p class="fx-muted" style="margin:12px 0 0">يُحفظ اختيارك في حسابك ويظهر على أي جهاز تسجّل الدخول منه.</p>`;
      $$("[data-theme]", m.body).forEach(b => b.onclick = () => { savePrefs({ theme: b.dataset.theme }); draw(); });
      $$("[data-style]", m.body).forEach(b => b.onclick = () => { savePrefs({ style: b.dataset.style }); draw(); });
      $$("[data-mode]", m.body).forEach(b => b.onclick = () => { savePrefs({ mode: b.dataset.mode }); draw(); });
      $("#fxMotion", m.body).onchange = e => savePrefs({ motion: e.target.checked ? "on" : "off" });
    }
    draw();
  }

  // ==================== النوافذ والتنبيهات والاحتفال ====================
  function modal({ title, html, wide, onClose }) {
    const back = document.createElement("div");
    back.className = "fx-modal-back";
    back.innerHTML = `<div class="fx-modal${wide ? " wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="fx-modal-head"><h3>${esc(title)}</h3><button class="fx-modal-close" aria-label="إغلاق">✕</button></div>
      <div class="fx-modal-body">${html || ""}</div></div>`;
    document.body.appendChild(back);
    document.body.style.overflow = "hidden";
    let closed = false;
    const onKey = e => { const all = $$(".fx-modal-back"); if (e.key === "Escape" && all[all.length - 1] === back) close(); };
    function close() {
      if (closed) return; closed = true;
      back.remove(); document.removeEventListener("keydown", onKey);
      if (!$(".fx-modal-back")) document.body.style.overflow = "";
      onClose && onClose();
    }
    document.addEventListener("keydown", onKey);
    back.addEventListener("mousedown", e => { if (e.target === back) close(); });
    $(".fx-modal-close", back).onclick = close;
    return { back, body: $(".fx-modal-body", back), close, setTitle: t => { $(".fx-modal-head h3", back).textContent = t; } };
  }

  function toast(title, body, kind) {
    let w = $(".fx-toast-wrap");
    if (!w) { w = document.createElement("div"); w.className = "fx-toast-wrap"; w.setAttribute("aria-live", "polite"); document.body.appendChild(w); }
    const t = document.createElement("div");
    t.className = "fx-toast " + (kind || "");
    t.innerHTML = `<b>${esc(title)}</b>${body ? esc(body) : ""}`;
    w.appendChild(t);
    setTimeout(() => { t.style.transition = "opacity .3s"; t.style.opacity = "0"; setTimeout(() => t.remove(), 320); }, 4200);
  }

  function confetti() {
    if (motionOff()) return;
    const c = document.createElement("canvas"); c.className = "fx-confetti"; document.body.appendChild(c);
    const ctx = c.getContext("2d"), dpr = window.devicePixelRatio || 1, W = innerWidth, H = innerHeight;
    c.width = W * dpr; c.height = H * dpr; ctx.scale(dpr, dpr);
    const cs = getComputedStyle(document.documentElement);
    const colors = [cs.getPropertyValue("--teal").trim(), cs.getPropertyValue("--navy").trim(), "#FFD166", "#06D6A0", "#FFFFFF", "#F78C6B"];
    const parts = Array.from({ length: 150 }, () => ({
      x: W / 2 + (Math.random() - .5) * 160, y: H * .38, vx: (Math.random() - .5) * 13, vy: -Math.random() * 13 - 4,
      s: Math.random() * 7 + 4, r: Math.random() * 6, vr: (Math.random() - .5) * .3, c: colors[rand(0, colors.length - 1)]
    }));
    const start = performance.now();
    (function frame(now) {
      const t = now - start;
      ctx.clearRect(0, 0, W, H);
      parts.forEach(p => {
        p.vy += .28; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = Math.max(0, 1 - t / 2800);
        ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
      });
      if (t < 2800) requestAnimationFrame(frame); else c.remove();
    })(start);
  }

  // تأثير الموجة عند الضغط على الأزرار
  document.addEventListener("pointerdown", e => {
    if (motionOff()) return;
    const t = e.target.closest(".btn, .fx-btn, .tab, .export-btn");
    if (!t || t.disabled) return;
    const r = t.getBoundingClientRect(), s = document.createElement("span");
    s.className = "fx-ripple"; s.style.left = (e.clientX - r.left) + "px"; s.style.top = (e.clientY - r.top) + "px";
    t.appendChild(s); setTimeout(() => s.remove(), 600);
  });

  // ==================== الشريط العلوي ====================
  function mountTopbar() {
    const who = $(".topbar .who");
    if (!who || $("#fxBell")) return;
    who.insertAdjacentHTML("afterbegin", `
      <button id="fxBell" class="fx-top-btn" aria-label="الإشعارات">🔔<span class="fx-badge" id="fxBadge" hidden>0</span></button>
      <button id="fxThemeBtn" class="fx-top-btn" aria-label="المظهر">🎨</button>
      <button id="fxAvatarBtn" class="fx-top-btn fx-avatar-btn" aria-label="ملفي الشخصي"></button>`);
    $("#fxBell").onclick = e => { e.stopPropagation(); toggleNotifPanel(); };
    $("#fxThemeBtn").onclick = openThemePanel;
    $("#fxAvatarBtn").onclick = openProfile;
    refreshAvatarBtn();
  }
  function refreshAvatarBtn() {
    const b = $("#fxAvatarBtn"), u = me();
    if (b && u) b.textContent = u.avatar || (u.full_name || "؟").trim().charAt(0);
  }

  // ==================== الإشعارات ====================
  const notif = { items: [], unread: 0, lastMax: 0, first: true, open: false };
  const NOTIF_ICON = { reminder: "⏰", greeting: "💌", celebration: "🎉" };

  async function pollNotifs() {
    if (!me()) return;
    try {
      const d = await call("/api/notifications");
      notif.items = d.items; setBadge(d.unread);
      const maxId = d.items.length ? d.items[0].id : 0;
      if (!notif.first && maxId > notif.lastMax) {
        const fresh = d.items.filter(i => i.id > notif.lastMax && !i.is_read);
        fresh.slice(0, 3).forEach(i => { toast(i.title, i.body); browserNotify(i); });
        if (fresh.length) shakeBell();
        if (fresh.some(i => i.type === "greeting" || i.type === "celebration")) loadCelebrations();
      } else if (notif.first) {
        d.items.filter(i => !i.is_read && i.type === "reminder").slice(0, 2).forEach(i => toast(i.title, i.body));
      }
      notif.lastMax = Math.max(notif.lastMax, maxId); notif.first = false;
      if (notif.open) renderNotifPanel();
    } catch {}
  }
  function setBadge(n) {
    notif.unread = n; const b = $("#fxBadge");
    if (!b) return; b.hidden = !n; b.textContent = n > 9 ? "9+" : n;
  }
  function shakeBell() { const b = $("#fxBell"); if (!b) return; b.classList.remove("shake"); void b.offsetWidth; b.classList.add("shake"); }
  function browserNotify(i) {
    try { if ("Notification" in window && Notification.permission === "granted" && document.hidden) new Notification(i.title, { body: i.body || "" }); } catch {}
  }
  function toggleNotifPanel() {
    const ex = $(".fx-notif-panel");
    if (ex) { ex.remove(); notif.open = false; return; }
    notif.open = true;
    const p = document.createElement("div"); p.className = "fx-notif-panel"; document.body.appendChild(p);
    renderNotifPanel();
    if (notif.unread) { call("/api/notifications/read", "POST", {}).then(() => setBadge(0)).catch(() => {}); }
  }
  function renderNotifPanel() {
    const p = $(".fx-notif-panel"); if (!p) return;
    p.innerHTML = `<div class="head"><b>الإشعارات</b><button class="fx-btn ghost" id="fxNotifClose" aria-label="إغلاق">✕</button></div>
      ${notif.items.length ? notif.items.map(i => `
        <div class="fx-notif-item${i.is_read ? "" : " unread"}">
          <div class="ic">${NOTIF_ICON[i.type] || "🔔"}</div>
          <div><div class="t">${esc(i.title)}</div>${i.body ? `<div class="b">${esc(i.body)}</div>` : ""}<div class="d">${timeAgo(i.created_at)}</div></div>
        </div>`).join("") : `<div class="empty">لا توجد إشعارات. ستصلك هنا التذكيرات والمعايدات.</div>`}`;
    $("#fxNotifClose").onclick = () => { p.remove(); notif.open = false; };
  }
  document.addEventListener("click", e => {
    const p = $(".fx-notif-panel");
    if (p && !p.contains(e.target) && !e.target.closest("#fxBell")) { p.remove(); notif.open = false; }
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) pollNotifs(); });

  // ==================== المناسبات والمعايدات ====================
  const GREET_PRESETS = {
    birthday: ["كل عام وأنت بخير 🎂", "عيد ميلاد سعيد! أتمنى لك سنة مليئة بالنجاح والفرح 🎉", "سنة حلوة، وكل عام وأنت بألف خير 🎈"],
    anniversary: ["مبروك! وجودك إضافة حقيقية للفريق 👏", "شكراً على كل جهودك، وإلى سنوات أكثر من النجاح 🌟", "فخورين بالعمل معك، مبروك هالمناسبة 🎉"],
    promotion: ["ألف مبروك الترقية! تستاهل كل خير 🎉", "مبروك! نجاحك يلهمنا جميعاً 🚀", "خطوة موفقة، وإلى الأمام دائماً 👏"]
  };
  function celLine(ev) {
    const name = esc(ev.user.full_name);
    if (ev.type === "birthday") return [ev.is_me ? "اليوم عيد ميلادك 🎂" : `عيد ميلاد ${name} 🎂`, esc(ev.user.office_name || "")];
    if (ev.type === "anniversary") return [ev.is_me ? `${yearsAr(ev.years)} على انضمامك 🎉` : `${name}: ${yearsAr(ev.years)} مع سوبرسيل 🎉`, esc(ev.user.office_name || "")];
    return [ev.is_me ? "مبروك ترقيتك 🚀" : `${name} ترقّى 🚀`, esc(ev.title || "")];
  }
  async function loadCelebrations() {
    const strip = $("#fxStrip"); if (!strip) return;
    try {
      const d = await call("/api/celebrations/today");
      if (!d.events.length) { strip.innerHTML = ""; return; }
      strip.innerHTML = `<div class="fx-cel-strip">${d.events.map((ev, i) => {
        const [t, s] = celLine(ev);
        const btn = ev.is_me ? `<button class="fx-btn primary" data-mine="1">معايداتي${ev.greetings_count ? ` (${ev.greetings_count})` : ""}</button>`
          : ev.greeted_by_me ? `<button class="fx-btn" disabled>✓ تمت المعايدة</button>`
          : `<button class="fx-btn primary" data-greet="${i}">أرسل معايدة</button>`;
        return `<div class="fx-cel">${av(ev.user)}<div class="txt"><b>${t}</b><span>${s}</span></div>${btn}</div>`;
      }).join("")}</div>`;
      $$("[data-greet]", strip).forEach(b => b.onclick = () => openGreet(d.events[Number(b.dataset.greet)]));
      $$("[data-mine]", strip).forEach(b => b.onclick = () => openMyCelebrations(true));
    } catch { strip.innerHTML = ""; }
  }
  function openGreet(ev) {
    const presets = GREET_PRESETS[ev.type] || GREET_PRESETS.birthday;
    const m = modal({ title: `معايدة ${ev.user.full_name}`, html: `
      <div class="fx-profile-head">${av(ev.user, "lg")}<div><h3>${esc(ev.user.full_name)}</h3><div class="fx-muted">${celLine(ev)[0]}</div></div></div>
      <div class="fx-greet-presets">${presets.map((p, i) => `<button data-p="${i}">${esc(p)}</button>`).join("")}</div>
      <div class="field"><label>رسالتك</label><textarea id="fxGreetMsg" maxlength="200" rows="3" placeholder="اكتب معايدتك أو اختر واحدة من الأعلى"></textarea></div>
      <button class="btn" id="fxGreetSend">إرسال المعايدة</button>` });
    const ta = $("#fxGreetMsg", m.body);
    $$("[data-p]", m.body).forEach(b => b.onclick = () => {
      $$("[data-p]", m.body).forEach(x => x.classList.remove("on")); b.classList.add("on"); ta.value = presets[Number(b.dataset.p)];
    });
    $("#fxGreetSend", m.body).onclick = async e => {
      const msg = ta.value.trim(); if (!msg) { ta.focus(); return; }
      e.target.disabled = true;
      try {
        await call("/api/celebrations/greet", "POST", { event_key: ev.key, message: msg });
        m.close(); confetti(); toast("تم إرسال المعايدة", `وصلت رسالتك إلى ${ev.user.full_name}`, "ok"); loadCelebrations();
      } catch (err) { toast("تعذر الإرسال", err.message, "bad"); e.target.disabled = false; }
    };
  }
  async function openMyCelebrations(force) {
    let d; try { d = await call("/api/celebrations/mine"); } catch { return; }
    const events = force ? d.events : d.events.filter(ev => !localStorage.getItem("fx_cel_seen_" + ev.key));
    if (!events.length) return;
    events.forEach(ev => { try { localStorage.setItem("fx_cel_seen_" + ev.key, "1"); } catch {} });
    const u = me(), first = (u.full_name || "").split(" ")[0];
    const hero = ev => ev.type === "birthday" ? ["🎂", `كل عام وأنت بخير يا ${esc(first)}!`, "فريق سوبرسيل يتمنى لك عاماً مليئاً بالنجاح والسعادة."]
      : ev.type === "anniversary" ? ["🎉", `${yearsAr(ev.years)} مع سوبرسيل!`, "شكراً لعطائك، نحن فخورون بوجودك معنا."]
      : ["🚀", "مبروك الترقية!", `منصبك الجديد: ${esc(ev.title || "")}`];
    const m = modal({ title: "مناسبتك اليوم", html: events.map(ev => {
      const [ic, t, s] = hero(ev);
      return `<div class="fx-celebrate-hero"><div class="big">${ic}</div><h2>${t}</h2><div class="fx-muted">${s}</div></div>
        <div class="fx-section-title">معايدات زملائك (${ev.greetings.length})</div>
        <div class="fx-greet-list">${ev.greetings.length ? ev.greetings.map(g => `
          <div class="fx-greet-item">${av(g, "sm")}<div><div class="m">${esc(g.message)}</div><div class="n">${esc(g.full_name)} · ${timeAgo(g.created_at)}</div></div></div>`).join("")
          : `<div class="fx-muted">ستظهر هنا المعايدات عندما يرسلها زملاؤك.</div>`}</div>`;
    }).join('<hr style="border:none;border-top:1px solid var(--line);margin:18px 0">') });
    confetti();
    return m;
  }

  // ==================== الملف الشخصي ====================
  const AVATARS = ["🦁", "🐯", "🦊", "🐼", "🐨", "🦉", "🐬", "🦅", "🐺", "🐻", "🐧", "🦄", "⚡", "🔥", "🌟", "🚀", "🎯", "💎", "🌙", "☀️", "🍀", "🎧", "⚽", "🏆"];
  const ROLE_AR = { super_admin: "المدير العام", office_admin: "مدير المكتب", employee: "موظف", monitor: "فريق المتابعة" };
  function completeness(p) {
    const f = ["avatar", "birth_date", "gender", "phone", "personal_email", "hire_date", "bio"];
    return Math.round(f.filter(k => p[k]).length / f.length * 100);
  }
  async function openProfile() {
    let d; try { d = await call("/api/me/profile"); } catch (e) { toast("تعذر فتح الملف", e.message, "bad"); return; }
    const p = d.profile; let avatar = p.avatar || null;
    const m = modal({ title: "ملفي الشخصي", html: `
      <div class="fx-profile-head"><span id="fxPAv">${av(p, "xl")}</span><div>
        <h3>${esc(p.full_name)}</h3>
        <div class="fx-muted">${esc(p.job_title || ROLE_AR[p.role] || "")}${p.office_name ? " — " + esc(p.office_name) : ""}</div>
        <div class="fx-muted" style="margin-top:6px">اكتمال الملف: <b id="fxPct">${completeness(p)}%</b></div>
        <div class="fx-progress" style="width:170px"><i id="fxPBar" style="width:${completeness(p)}%"></i></div></div></div>
      <div class="fx-section-title">الصورة الرمزية</div>
      <div class="fx-emoji-grid">${AVATARS.map(a => `<button data-av="${a}" class="${a === avatar ? "on" : ""}" aria-label="${a}">${a}</button>`).join("")}</div>
      <div class="row2">
        <div class="field"><label>تاريخ الميلاد</label><input type="date" id="fxBirth" value="${esc(p.birth_date || "")}"></div>
        <div class="field"><label>الجنس</label><select id="fxGender"><option value="">—</option>
          <option value="male" ${p.gender === "male" ? "selected" : ""}>ذكر</option><option value="female" ${p.gender === "female" ? "selected" : ""}>أنثى</option></select></div>
      </div>
      <div class="row2">
        <div class="field"><label>رقم الهاتف</label><input type="tel" id="fxPhone" inputmode="tel" placeholder="07xxxxxxxxx" value="${esc(p.phone || "")}"></div>
        <div class="field"><label>البريد الإلكتروني الشخصي</label><input type="email" id="fxEmail" placeholder="name@example.com" value="${esc(p.personal_email || "")}"></div>
      </div>
      <div class="field"><label>تاريخ الانضمام لسوبرسيل</label><input type="date" id="fxHire" value="${esc(p.hire_date || "")}"></div>
      <div class="field"><label>نبذة قصيرة</label><textarea id="fxBio" rows="2" maxlength="200" placeholder="مثال: متخصص في حل مشاكل الألياف الضوئية">${esc(p.bio || "")}</textarea></div>
      <p class="fx-muted" style="margin:-4px 0 12px">رقم الهاتف والبريد وسنة الميلاد تظهر لك وللإدارة فقط. زملاؤك يرون يوم ميلادك لإرسال المعايدة.</p>
      <button class="btn" id="fxPSave">حفظ الملف الشخصي</button>
      <details class="fx-details"><summary>تغيير كلمة السر</summary>
        <div style="margin-top:12px">
          <div class="field"><label>كلمة السر الحالية</label><input type="password" id="fxPwCur" autocomplete="current-password"></div>
          <div class="row2">
            <div class="field"><label>كلمة السر الجديدة</label><input type="password" id="fxPwNew" autocomplete="new-password"></div>
            <div class="field"><label>تأكيد كلمة السر</label><input type="password" id="fxPwNew2" autocomplete="new-password"></div>
          </div>
          <button class="fx-btn dark block" id="fxPwSave">تحديث كلمة السر</button>
        </div></details>` });
    $$("[data-av]", m.body).forEach(b => b.onclick = () => {
      avatar = avatar === b.dataset.av ? null : b.dataset.av;
      $$("[data-av]", m.body).forEach(x => x.classList.toggle("on", x.dataset.av === avatar));
      $("#fxPAv", m.body).innerHTML = av({ ...p, avatar }, "xl");
    });
    $("#fxPSave", m.body).onclick = async e => {
      const payload = {
        avatar, birth_date: $("#fxBirth", m.body).value || null, gender: $("#fxGender", m.body).value || null,
        phone: $("#fxPhone", m.body).value.trim() || null, personal_email: $("#fxEmail", m.body).value.trim() || null,
        hire_date: $("#fxHire", m.body).value || null, bio: $("#fxBio", m.body).value.trim() || null
      };
      e.target.disabled = true;
      try {
        const r = await call("/api/me/profile", "PUT", payload);
        const u = me(); if (u) u.avatar = r.profile.avatar;
        refreshAvatarBtn(); const pct = completeness(r.profile);
        $("#fxPct", m.body).textContent = pct + "%"; $("#fxPBar", m.body).style.width = pct + "%";
        toast("تم حفظ الملف الشخصي", null, "ok"); loadCelebrations(); openMyCelebrations(false);
      } catch (err) { toast("تعذر الحفظ", err.message, "bad"); }
      e.target.disabled = false;
    };
    $("#fxPwSave", m.body).onclick = async e => {
      const cur = $("#fxPwCur", m.body).value, n1 = $("#fxPwNew", m.body).value, n2 = $("#fxPwNew2", m.body).value;
      if (n1.length < 6) return toast("كلمة السر قصيرة", "استخدم 6 أحرف على الأقل", "bad");
      if (n1 !== n2) return toast("كلمتا السر غير متطابقتين", "أعد كتابة كلمة السر الجديدة في الحقلين", "bad");
      e.target.disabled = true;
      try {
        await call("/api/auth/change-password", "POST", { current_password: cur, new_password: n1 });
        ["#fxPwCur", "#fxPwNew", "#fxPwNew2"].forEach(s => $(s, m.body).value = "");
        toast("تم تحديث كلمة السر", null, "ok");
      } catch (err) { toast("تعذر التحديث", err.message, "bad"); }
      e.target.disabled = false;
    };
  }

  // بطاقة شخص (مع أدوات الإدارة لمن يملك الصلاحية)
  async function openPerson(id, onChange) {
    const u = me();
    if (u && Number(id) === Number(u.id)) return openProfile();
    let d; try { d = await call(`/api/people/${id}`); } catch (e) { toast("تعذر فتح البطاقة", e.message, "bad"); return; }
    const p = d.person;
    const kv = [];
    if (p.office_name) kv.push(["المكتب", esc(p.office_name)]);
    if (p.hire_year) kv.push(["في سوبرسيل منذ", p.hire_year]);
    if (p.birth_date) kv.push(["تاريخ الميلاد", esc(p.birth_date)]);
    if (p.gender) kv.push(["الجنس", p.gender === "male" ? "ذكر" : "أنثى"]);
    if (p.phone) kv.push(["الهاتف", `<span dir="ltr">${esc(p.phone)}</span>`]);
    if (p.personal_email) kv.push(["البريد", `<span dir="ltr">${esc(p.personal_email)}</span>`]);
    const m = modal({ title: p.full_name, html: `
      <div class="fx-profile-head">${av(p, "xl")}<div><h3>${esc(p.full_name)}</h3>
        <div class="fx-muted">${esc(p.job_title || ROLE_AR[p.role] || "")}</div>
        ${p.bio ? `<div style="font-size:13px;margin-top:6px">${esc(p.bio)}</div>` : ""}</div></div>
      ${kv.length ? `<dl class="fx-kv">${kv.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>` : ""}
      ${d.promotions.length ? `<div class="fx-section-title">سجل الترقيات</div>${d.promotions.map(x => `<div class="fx-muted">🚀 ${esc(x.title)} — ${fmtDT(x.created_at).split(" ")[0]}</div>`).join("")}` : ""}
      ${d.can_manage ? `
        <div class="fx-section-title">بيانات العمل</div>
        <div class="row2">
          <div class="field"><label>المسمى الوظيفي</label><input id="fxWTitle" maxlength="60" value="${esc(p.job_title || "")}"></div>
          <div class="field"><label>تاريخ الانضمام</label><input type="date" id="fxWHire" value="${esc(p.hire_date || "")}"></div>
        </div>
        <button class="fx-btn block" id="fxWSave">حفظ بيانات العمل</button>
        <div class="fx-section-title">تسجيل ترقية</div>
        <div class="field"><label>المسمى الجديد</label><input id="fxPrTitle" maxlength="60" placeholder="مثال: مشرف وردية"></div>
        <div class="field"><label>ملاحظة (اختياري)</label><input id="fxPrNote" maxlength="200"></div>
        <button class="btn" id="fxPrSave">تسجيل الترقية وإرسال التهنئة</button>
        <p class="fx-muted" style="margin:8px 0 0">تظهر الترقية لجميع الزملاء في شريط المناسبات لمدة 3 أيام ليتمكنوا من المعايدة.</p>` : ""}` });
    if (!d.can_manage) return;
    $("#fxWSave", m.body).onclick = async e => {
      e.target.disabled = true;
      try {
        await call(`/api/people/${id}/work`, "PUT", { job_title: $("#fxWTitle", m.body).value.trim() || null, hire_date: $("#fxWHire", m.body).value || null });
        toast("تم حفظ بيانات العمل", null, "ok"); onChange && onChange();
      } catch (err) { toast("تعذر الحفظ", err.message, "bad"); }
      e.target.disabled = false;
    };
    $("#fxPrSave", m.body).onclick = async e => {
      const title = $("#fxPrTitle", m.body).value.trim();
      if (!title) { $("#fxPrTitle", m.body).focus(); return; }
      e.target.disabled = true;
      try {
        await call(`/api/people/${id}/promote`, "POST", { title, note: $("#fxPrNote", m.body).value.trim() || null });
        m.close(); confetti(); toast("تم تسجيل الترقية", `وصلت التهنئة إلى ${p.full_name}`, "ok"); loadCelebrations(); onChange && onChange();
      } catch (err) { toast("تعذر التسجيل", err.message, "bad"); e.target.disabled = false; }
    };
  }

  // ==================== تبويب الفريق (للإدارة) ====================
  async function renderTeam(c) {
    c.innerHTML = `<div class="card"><h2><span class="bar"></span>ملفات الفريق</h2>
      <div class="field"><input id="fxTeamQ" placeholder="ابحث بالاسم أو المكتب"></div>
      <div id="fxTeamList"><div class="fx-skel"></div><div class="fx-skel"></div><div class="fx-skel"></div></div></div>`;
    let people = [];
    const draw = () => {
      const q = $("#fxTeamQ").value.trim().toLowerCase();
      const list = people.filter(p => !q || (p.full_name + " " + (p.office_name || "")).toLowerCase().includes(q));
      $("#fxTeamList").innerHTML = list.length ? list.map(p => {
        const pct = completeness(p);
        return `<div class="fx-team-row">${av(p)}<div class="info"><b>${esc(p.full_name)}</b>
          <span>${esc(p.job_title || ROLE_AR[p.role])}${p.office_name ? " — " + esc(p.office_name) : ""}${p.active ? "" : " (معطّل)"}</span></div>
          <div title="اكتمال الملف ${pct}%"><div class="fx-mini-prog"><i style="width:${pct}%"></i></div></div>
          <button class="fx-btn" data-id="${p.id}">إدارة</button></div>`;
      }).join("") : `<div class="empty">لا توجد نتائج مطابقة.</div>`;
      $$("[data-id]", $("#fxTeamList")).forEach(b => b.onclick = () => openPerson(b.dataset.id, load));
    };
    async function load() {
      try { people = (await call("/api/people")).people; draw(); }
      catch (e) { $("#fxTeamList").innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    }
    $("#fxTeamQ").oninput = draw;
    load();
  }

  // ==================== لوحة الصدارة ====================
  const lb = { scope: "employees", period: "month" };
  const PERIODS = [["week", "هذا الأسبوع"], ["month", "هذا الشهر"], ["last_month", "الشهر الماضي"], ["all", "كل الوقت"]];

  function renderLeaderboard(c) {
    c.innerHTML = `
      <div class="card">
        <h2><span class="bar"></span>لوحة الصدارة</h2>
        <div class="fx-lb-controls">
          <div class="fx-seg" role="group" aria-label="نوع الترتيب">
            <button data-scope="employees" class="${lb.scope === "employees" ? "on" : ""}">الموظفون</button>
            <button data-scope="offices" class="${lb.scope === "offices" ? "on" : ""}">المكاتب</button>
          </div>
          <div class="fx-chips">${PERIODS.map(([k, l]) => `<button class="fx-chip${lb.period === k ? " on" : ""}" data-period="${k}">${l}</button>`).join("")}</div>
        </div>
        <div id="fxLbTop"><div class="fx-skel" style="height:200px"></div></div>
      </div>
      <div class="card"><h2><span class="bar"></span>الترتيب الكامل</h2><div id="fxLbList"><div class="fx-skel"></div><div class="fx-skel"></div></div></div>
      <div class="card">
        <details class="fx-details" style="margin:0;border:none;padding:0;background:none"><summary>كيف تُحسب النقاط؟</summary>
          <div class="fx-muted" style="font-size:12.5px;line-height:1.9;margin-top:10px">
            النقاط من 100، وهي متوسط حصتك من أربعة مؤشرات: طلبات الصيانة، طلبات التنصيب، الترقيات، والعائدات الإضافية.<br>
            حصتك في كل مؤشر = إنجازك ÷ مجموع إنجاز الجميع في نفس الفترة.<br>
            العائدات الإضافية تشمل Revenue Amount لكل المعاملات عدا التجديد الاعتيادي (Recharge Card بدون ترقية).<br>
            الترقية تُحتسب عند اختيار ✔️ في Migrations up أو سبب زيارة يتضمن Migrations up.<br>
            الطلبات بحالة Closed لا تُحتسب، والأسبوع يبدأ من يوم السبت.
          </div></details>
      </div>`;
    $$("[data-scope]", c).forEach(b => b.onclick = () => { lb.scope = b.dataset.scope; renderLeaderboard(c); });
    $$("[data-period]", c).forEach(b => b.onclick = () => { lb.period = b.dataset.period; renderLeaderboard(c); });
    loadLeaderboard();
  }

  async function loadLeaderboard() {
    let d;
    try { d = await call(`/api/leaderboard?scope=${lb.scope}&period=${lb.period}`); }
    catch (e) { $("#fxLbTop").innerHTML = `<div class="empty">${esc(e.message)}</div>`; $("#fxLbList").innerHTML = ""; return; }
    const isEmp = lb.scope === "employees";
    const hasData = d.rows.some(r => r.score > 0);
    const top = [d.rows[1], d.rows[0], d.rows[2]];
    const pod = (r, place) => {
      const cls = `fx-pod p${place}${r && r.score > 0 ? "" : " empty"}${r && isEmp ? " clickable" : ""}`;
      if (!r) return `<div class="${cls}"><div class="crown"></div><span class="fx-av lg">—</span><div class="who">—</div><div class="sub"></div><div class="block"><div class="place">${place}</div></div></div>`;
      return `<div class="${cls}" ${isEmp ? `data-person="${r.id}"` : ""}>
        <div class="crown">${place === 1 && r.score > 0 ? "👑" : ""}</div>
        ${isEmp ? av(r, "lg") : `<span class="fx-av lg">🏢</span>`}
        <div class="who">${esc(r.name)}</div><div class="sub">${esc(isEmp ? (r.office_name || "") : `${r.requests} طلب`)}</div>
        <div class="block"><div class="place">${place}</div><div class="pts"><span data-count="${r.score}">0</span> نقطة</div></div></div>`;
    };
    const mine = d.mine;
    $("#fxLbTop").innerHTML = `
      ${hasData ? "" : `<div class="access-note" style="margin-bottom:12px">لا توجد معاملات محتسبة في هذه الفترة بعد. أول طلب صيانة أو تنصيب أو ترقية يضعك في المقدمة.</div>`}
      <div class="fx-podium">${pod(top[0], 2)}${pod(top[1], 1)}${pod(top[2], 3)}</div>
      ${mine ? `<div class="fx-mine"><div class="rk">#${mine.rank}</div>
        <div class="info"><b>${isEmp ? "ترتيبك" : "ترتيب مكتبك"}</b>${esc(mine.name)} — ${mine.maintenance} صيانة، ${mine.installation} تنصيب، ${mine.upgrades} ترقية</div>
        <div class="sc"><b data-count="${mine.score}">0</b><span>نقطة</span></div></div>` : ""}`;
    const metric = (cls, label, val, share, fmt) => `<div class="fx-metric ${cls}">${label} <b>${fmt ? fmt(val) : val}</b> · <span dir="ltr">${share}%</span><div class="bar"><i style="width:${Math.min(100, share)}%"></i></div></div>`;
    const uid = me() ? me().id : null, oid = me() ? me().office_id : null;
    $("#fxLbList").innerHTML = `
      <div class="fx-totals">
        <div><b>${num(d.totals.maintenance)}</b><span>صيانة</span></div><div><b>${num(d.totals.installation)}</b><span>تنصيب</span></div>
        <div><b>${num(d.totals.upgrades)}</b><span>ترقيات</span></div><div><b>${num(d.totals.revenue)}</b><span>عائدات إضافية</span></div>
      </div>
      ${d.rows.length ? d.rows.map((r, i) => {
        const isMe = isEmp ? r.id === uid : r.id === oid;
        return `<div class="fx-lb-row${isMe ? " me" : ""}${isEmp ? " clickable" : ""}" ${isEmp ? `data-person="${r.id}"` : ""} style="animation-delay:${Math.min(i, 12) * 30}ms">
          <div class="rank">${r.rank <= 3 && r.score > 0 ? ["🥇", "🥈", "🥉"][r.rank - 1] : r.rank}</div>
          <div class="name">${isEmp ? av(r, "sm") : `<span class="fx-av sm">🏢</span>`}<div style="min-width:0"><b>${esc(r.name)}</b><span>${esc(isEmp ? (r.office_name || "") : `${r.requests} طلب محتسب`)}</span></div></div>
          <div class="score">${r.score}</div>
          <div class="fx-lb-metrics">
            ${metric("m", "صيانة", r.maintenance, r.shares.maintenance)}${metric("i", "تنصيب", r.installation, r.shares.installation)}
            ${metric("u", "ترقيات", r.upgrades, r.shares.upgrades)}${metric("r", "عائدات", r.revenue, r.shares.revenue, num)}
          </div></div>`;
      }).join("") : `<div class="empty">لا يوجد مشاركون بعد.</div>`}`;
    $$("[data-count]").forEach(n => countUp(n, Number(n.dataset.count), Number(n.dataset.count) % 1 ? 1 : 0));
    $$("[data-person]").forEach(n => n.onclick = () => openPerson(n.dataset.person));
  }

  // ==================== الترفيه والألعاب ====================
  const GAME_META = {
    math:     { icon: "➗", grad: "linear-gradient(135deg,#3A86FF,#1D4ED8)", desc: "حل أكبر عدد من العمليات خلال 60 ثانية. الإجابات المتتالية الصحيحة تزيد نقاطك." },
    memory:   { icon: "🃏", grad: "linear-gradient(135deg,#8B5CF6,#5B21B6)", desc: "اكشف أزواج البطاقات المتطابقة بأقل عدد من المحاولات وبأسرع وقت." },
    sequence: { icon: "🎵", grad: "linear-gradient(135deg,#F59E0B,#B45309)", desc: "احفظ تسلسل الألوان وكرره. يطول التسلسل ويتسارع مع كل مستوى." },
    pattern:  { icon: "🔢", grad: "linear-gradient(135deg,#10B981,#047857)", desc: "اكتشف القاعدة وأكمل السلسلة الرقمية. 10 أسئلة خلال 90 ثانية." }
  };

  async function renderGames(c) {
    c.innerHTML = `<div id="fxGamesHero"><div class="fx-skel" style="height:70px"></div></div>
      <div class="fx-games" id="fxGamesGrid"></div>
      <div class="card"><h2><span class="bar"></span>ترتيب النقاط الإجمالي</h2>
        <p class="fx-muted" style="margin:-6px 0 10px">النقاط الإجمالية = مجموع أفضل نتيجة لك في كل لعبة.</p><div id="fxGamesOverall"></div></div>`;
    let d; try { d = await call("/api/games/overview"); } catch (e) { $("#fxGamesHero").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const uid = me() ? me().id : null;
    const myIdx = d.overall.findIndex(o => o.id === uid);
    $("#fxGamesHero").innerHTML = `<div class="fx-points-hero"><div style="font-size:34px">🧠</div>
      <div style="flex:1"><div class="l">نقاطك الإجمالية</div><div class="n" data-count="${d.my_points}">0</div></div>
      <div style="text-align:center"><div class="l">ترتيبك</div><div class="n" style="font-size:24px">${myIdx >= 0 ? "#" + (myIdx + 1) : "—"}</div></div></div>`;
    $("#fxGamesGrid").innerHTML = Object.entries(d.games).map(([k, g]) => {
      const meta = GAME_META[k];
      return `<div class="fx-game-card"><div class="top"><div class="ic" style="background:${meta.grad}">${meta.icon}</div>
        <div><h3>${esc(g.name)}</h3><p>${meta.desc}</p></div></div>
        <div class="fx-game-stats"><div><b>${g.my_best ?? "—"}</b>أفضل نتيجة</div><div><b>${g.my_rank ? "#" + g.my_rank : "—"}</b>ترتيبك</div>
          <div><b>${g.leader ? esc(g.leader.full_name.split(" ")[0]) : "—"}</b>المتصدر</div></div>
        <button class="btn" data-game="${k}">العب الآن</button></div>`;
    }).join("");
    $("#fxGamesOverall").innerHTML = boardRows(d.overall.map(o => ({ ...o, value: o.points })), "نقطة");
    $$("[data-game]").forEach(b => b.onclick = () => openGame(b.dataset.game, d.games[b.dataset.game].name));
    $$("#fxGamesHero [data-count]").forEach(n => countUp(n, Number(n.dataset.count)));
    $$("[data-person]", $("#fxGamesOverall")).forEach(n => n.onclick = () => openPerson(n.dataset.person));
  }

  function boardRows(rows, unit) {
    const uid = me() ? me().id : null;
    if (!rows.length) return `<div class="empty">لم يلعب أحد بعد. كن أول المتصدرين!</div>`;
    return rows.map((r, i) => `<div class="fx-lb-row clickable${r.id === uid ? " me" : ""}" data-person="${r.id}" style="animation-delay:${Math.min(i, 12) * 30}ms">
      <div class="rank">${i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</div>
      <div class="name">${av(r, "sm")}<div style="min-width:0"><b>${esc(r.full_name)}</b><span>${esc(r.office_name || "")}</span></div></div>
      <div class="score">${num(r.value)} <span class="fx-muted" style="font-weight:600">${unit}</span></div></div>`).join("");
  }

  function openGame(key, name) {
    let cleanup = null;
    const m = modal({ title: name, wide: true, onClose: () => cleanup && cleanup() });
    const intro = () => {
      cleanup && cleanup(); cleanup = null;
      m.body.innerHTML = `<div class="fx-play"><div style="font-size:52px">${GAME_META[key].icon}</div>
        <p style="font-size:14px;max-width:420px;margin:10px auto 18px">${GAME_META[key].desc}</p>
        <button class="btn" style="max-width:240px" id="fxStart">ابدأ اللعب</button></div>`;
      $("#fxStart", m.body).onclick = start;
    };
    const start = () => { cleanup = GAMES[key](m.body, finish); };
    async function finish(score, durationMs) {
      cleanup && cleanup(); cleanup = null;
      m.body.innerHTML = `<div class="fx-result"><div class="fx-muted">نتيجتك</div><div class="big">${score}</div><div class="fx-muted" style="margin-top:8px">جارٍ حفظ النتيجة…</div></div>`;
      let r;
      try { r = await call(`/api/games/${key}/score`, "POST", { score, duration_ms: Math.round(durationMs) }); }
      catch (e) {
        m.body.innerHTML = `<div class="fx-result"><div class="big">${score}</div><p class="fx-muted">لم تُحفظ النتيجة: ${esc(e.message)}</p></div>
          <button class="btn" id="fxAgain">العب مرة أخرى</button>`;
        $("#fxAgain", m.body).onclick = start; return;
      }
      if (r.is_new_best && score > 0) confetti();
      m.body.innerHTML = `<div class="fx-result"><div class="fx-muted">نتيجتك</div><div class="big" data-count="${score}">0</div>
        ${r.is_new_best && score > 0 ? `<div class="best">🏆 رقم قياسي شخصي جديد</div>` : `<div class="fx-muted" style="margin-top:8px">أفضل نتيجة لك: ${r.my_best}</div>`}
        <div class="fx-muted" style="margin-top:8px">ترتيبك في هذه اللعبة: <b>#${r.my_rank}</b></div></div>
        <div class="fx-row" style="margin-bottom:14px"><button class="btn" id="fxAgain" style="flex:1">العب مرة أخرى</button>
          <button class="fx-btn" id="fxDone" style="flex:1;padding:11px">إغلاق</button></div>
        <div class="fx-section-title">المتصدرون في ${esc(name)}</div>
        <div class="fx-board-mini">${boardRows(r.top.slice(0, 10).map(x => ({ ...x, value: x.best })), "")}</div>`;
      countUp($("[data-count]", m.body), score);
      $("#fxAgain", m.body).onclick = start;
      $("#fxDone", m.body).onclick = () => { m.close(); if (typeof ACTIVE_TAB !== "undefined" && ACTIVE_TAB === "games") renderGames($("#content")); };
    }
    intro();
  }

  // --- نغمات بسيطة للعبة التسلسل ---
  let audioCtx = null;
  function tone(freq, ms) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = freq; o.type = "sine"; g.gain.value = .08;
      o.connect(g); g.connect(audioCtx.destination); o.start();
      g.gain.exponentialRampToValueAtTime(.0001, audioCtx.currentTime + ms / 1000); o.stop(audioCtx.currentTime + ms / 1000);
    } catch {}
  }

  const GAMES = {
    // لعبة 1: الحساب السريع
    math(root, finish) {
      const DUR = 60000, t0 = performance.now();
      let score = 0, streak = 0, correct = 0, q = null, over = false;
      root.innerHTML = `<div class="fx-play">
        <div class="fx-play-bar"><span>النقاط: <b id="gS">0</b></span><span>متتالية: <b id="gK">0</b></span><span>⏱ <b id="gT">60</b></span></div>
        <div class="fx-timer"><i id="gBar"></i></div><div class="fx-q" id="gQ"></div>
        <div class="fx-row" style="justify-content:center"><input class="fx-answer" id="gA" inputmode="numeric" autocomplete="off" enterkeyhint="go" aria-label="الإجابة">
        <button class="fx-btn primary" id="gGo" style="padding:14px 18px">✓</button></div>
        <div class="fx-muted" style="margin-top:10px">اكتب الإجابة واضغط Enter</div></div>`;
      const input = $("#gA", root);
      function next() {
        const lvl = Math.min(4, Math.floor(correct / 5));
        const ops = lvl < 1 ? ["+", "-"] : ["+", "-", "×"];
        const op = ops[rand(0, ops.length - 1)];
        let a, b;
        if (op === "×") { a = rand(2, 5 + lvl * 2); b = rand(2, 9); }
        else { const max = [20, 50, 99, 150, 300][lvl]; a = rand(5, max); b = rand(2, max); if (op === "-" && b > a) [a, b] = [b, a]; }
        q = { text: `${a} ${op} ${b}`, ans: op === "+" ? a + b : op === "-" ? a - b : a * b };
        $("#gQ", root).textContent = q.text; input.value = ""; input.classList.remove("good", "bad");
      }
      function submit() {
        if (over || input.value.trim() === "") return;
        const ok = Number(input.value.trim()) === q.ans;
        if (ok) { correct++; streak++; score += 10 + Math.min(streak, 10) * 2; }
        else { streak = 0; }
        $("#gS", root).textContent = score; $("#gK", root).textContent = streak;
        input.classList.add(ok ? "good" : "bad");
        setTimeout(next, ok ? 120 : 350);
      }
      input.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
      $("#gGo", root).onclick = () => { submit(); input.focus(); };
      next(); input.focus();
      const iv = setInterval(() => {
        const left = Math.max(0, DUR - (performance.now() - t0));
        $("#gT", root).textContent = Math.ceil(left / 1000);
        $("#gBar", root).style.transform = `scaleX(${left / DUR})`;
        if (left <= 0 && !over) { over = true; clearInterval(iv); finish(Math.min(score, 3000), performance.now() - t0); }
      }, 200);
      return () => clearInterval(iv);
    },

    // لعبة 2: ذاكرة البطاقات
    memory(root, finish) {
      const pool = shuffle(["🍎", "🚀", "🎧", "⚽", "🌙", "🔥", "💎", "🎁", "🌵", "🐙", "🍩", "📡"]).slice(0, 8);
      const cards = shuffle([...pool, ...pool]);
      let first = null, lock = false, moves = 0, matched = 0, t0 = null, iv = null;
      root.innerHTML = `<div class="fx-play"><div class="fx-play-bar"><span>المحاولات: <b id="gM">0</b></span><span>الأزواج: <b id="gP">0</b>/8</span><span>⏱ <b id="gT">0</b></span></div>
        <div class="fx-mem-grid">${cards.map((e, i) => `<button class="fx-mem-card" data-i="${i}" aria-label="بطاقة"><span class="f">SC</span><span class="b">${e}</span></button>`).join("")}</div></div>`;
      const els = $$(".fx-mem-card", root);
      els.forEach(el => el.onclick = () => {
        if (lock || el.classList.contains("flip")) return;
        if (!t0) { t0 = performance.now(); iv = setInterval(() => { $("#gT", root).textContent = Math.floor((performance.now() - t0) / 1000); }, 500); }
        el.classList.add("flip");
        if (!first) { first = el; return; }
        moves++; $("#gM", root).textContent = moves;
        const a = first, b = el; first = null;
        if (cards[a.dataset.i] === cards[b.dataset.i]) {
          a.classList.add("done"); b.classList.add("done"); matched++; $("#gP", root).textContent = matched;
          if (matched === 8) {
            clearInterval(iv);
            const ms = performance.now() - t0, secs = ms / 1000;
            const score = Math.max(100, Math.min(1000, Math.round(1000 - Math.max(0, moves - 8) * 25 - secs * 3)));
            setTimeout(() => finish(score, Math.max(ms, 6000)), 600);
          }
        } else {
          lock = true;
          setTimeout(() => { a.classList.remove("flip"); b.classList.remove("flip"); lock = false; }, 750);
        }
      });
      return () => clearInterval(iv);
    },

    // لعبة 3: تسلسل الألوان
    sequence(root, finish) {
      const FREQ = [329.6, 392, 523.3, 659.3];
      const seq = []; let level = 0, idx = 0, accepting = false, alive = true;
      const t0 = performance.now(), timers = [];
      root.innerHTML = `<div class="fx-play"><div class="fx-play-bar"><span>المستوى: <b id="gL">0</b></span><span id="gSt">استعد…</span><span>النقاط: <b id="gS">0</b></span></div>
        <div class="fx-seq-pads">${[0, 1, 2, 3].map(i => `<button class="fx-pad c${i}" data-p="${i}" disabled aria-label="لون ${i + 1}"></button>`).join("")}</div></div>`;
      const pads = $$(".fx-pad", root);
      const later = (fn, ms) => timers.push(setTimeout(() => alive && fn(), ms));
      const light = (i, ms) => { pads[i].classList.add("lit"); tone(FREQ[i], ms); later(() => pads[i].classList.remove("lit"), ms); };
      function round() {
        level++; idx = 0; accepting = false; seq.push(rand(0, 3));
        $("#gL", root).textContent = level; $("#gS", root).textContent = (level - 1) * 100; $("#gSt", root).textContent = "انتبه 👀";
        pads.forEach(p => p.disabled = true);
        const on = Math.max(240, 560 - level * 18), gap = 140;
        seq.forEach((c, k) => later(() => light(c, on), 500 + k * (on + gap)));
        later(() => { accepting = true; pads.forEach(p => p.disabled = false); $("#gSt", root).textContent = "دورك ✋"; }, 500 + seq.length * (on + gap));
      }
      pads.forEach(p => p.onclick = () => {
        if (!accepting) return;
        const i = Number(p.dataset.p); light(i, 180);
        if (i !== seq[idx]) {
          accepting = false; pads.forEach(x => x.disabled = true); $("#gSt", root).textContent = "انتهت اللعبة";
          const score = Math.min(3000, (level - 1) * 100);
          later(() => finish(score, Math.max(performance.now() - t0, 3000)), 700); return;
        }
        idx++;
        if (idx === seq.length) {
          accepting = false; pads.forEach(x => x.disabled = true);
          if (level >= 30) { later(() => finish(3000, performance.now() - t0), 600); return; }
          $("#gSt", root).textContent = "أحسنت ✅"; later(round, 750);
        }
      });
      later(round, 400);
      return () => { alive = false; timers.forEach(clearTimeout); };
    },

    // لعبة 4: أكمل السلسلة
    pattern(root, finish) {
      const DUR = 90000, TOTAL = 10, t0 = performance.now();
      let qi = 0, correct = 0, over = false, iv = null;
      function makeQ(level) {
        const kinds = level < 3 ? ["arith", "arith", "geo"] : level < 6 ? ["arith", "geo", "alt", "sq"] : ["alt", "sq", "fib", "inc", "geo"];
        const k = kinds[rand(0, kinds.length - 1)];
        let s = [];
        if (k === "arith") { const a = rand(1, 25), d = rand(2, 9) * (Math.random() < .25 ? -1 : 1); for (let i = 0; i < 6; i++) s.push(a + d * i + (d < 0 ? 60 : 0)); }
        else if (k === "geo") { const a = rand(1, 5), r = rand(2, 3); for (let i = 0; i < 6; i++) s.push(a * Math.pow(r, i)); }
        else if (k === "alt") { const a = rand(5, 20), d1 = rand(3, 8), d2 = rand(1, 3); let v = a; for (let i = 0; i < 6; i++) { s.push(v); v += i % 2 === 0 ? d1 : -d2; } }
        else if (k === "sq") { const n = rand(1, 6); for (let i = 0; i < 6; i++) s.push((n + i) * (n + i)); }
        else if (k === "fib") { let a = rand(1, 4), b = rand(2, 6); s = [a, b]; while (s.length < 6) s.push(s[s.length - 1] + s[s.length - 2]); }
        else { const a = rand(1, 10), d = rand(1, 3), st = rand(1, 3); let v = a; for (let i = 0; i < 6; i++) { s.push(v); v += d + st * i; } }
        const ans = s[5], shown = s.slice(0, 5);
        const opts = new Set([ans]);
        const spread = Math.max(2, Math.round(Math.abs(ans - s[4]) / 2) || 2);
        while (opts.size < 4) { const o = ans + rand(-3, 3) * spread + rand(-2, 2); if (o !== ans && o >= 0) opts.add(o); }
        return { shown, ans, opts: shuffle([...opts]) };
      }
      root.innerHTML = `<div class="fx-play"><div class="fx-play-bar"><span>السؤال <b id="gN">1</b>/${TOTAL}</span><span>صحيح: <b id="gC">0</b></span><span>⏱ <b id="gT">90</b></span></div>
        <div class="fx-timer"><i id="gBar"></i></div><div class="fx-seq-q" id="gQ"></div><div class="fx-options" id="gO"></div></div>`;
      function end(allAnswered) {
        if (over) return; over = true; clearInterval(iv);
        const ms = performance.now() - t0, left = Math.max(0, (DUR - ms) / 1000);
        const score = Math.min(1200, correct * 100 + (allAnswered ? Math.floor(left) * 2 : 0));
        setTimeout(() => finish(score, Math.max(ms, 8000)), 400);
      }
      function show() {
        const q = makeQ(qi);
        $("#gN", root).textContent = qi + 1;
        $("#gQ", root).textContent = q.shown.join(" ، ") + " ، ؟";
        $("#gO", root).innerHTML = q.opts.map(o => `<button data-v="${o}">${o}</button>`).join("");
        $$("#gO button", root).forEach(b => b.onclick = () => {
          if (over) return;
          $$("#gO button", root).forEach(x => x.disabled = true);
          const ok = Number(b.dataset.v) === q.ans;
          b.classList.add(ok ? "good" : "bad");
          if (!ok) $$("#gO button", root).find(x => Number(x.dataset.v) === q.ans).classList.add("good");
          if (ok) { correct++; $("#gC", root).textContent = correct; }
          qi++;
          setTimeout(() => { if (qi >= TOTAL) end(true); else if (!over) show(); }, ok ? 450 : 900);
        });
      }
      show();
      iv = setInterval(() => {
        const left = Math.max(0, DUR - (performance.now() - t0));
        $("#gT", root).textContent = Math.ceil(left / 1000);
        $("#gBar", root).style.transform = `scaleX(${left / DUR})`;
        if (left <= 0) end(false);
      }, 200);
      return () => clearInterval(iv);
    }
  };

  // ==================== الملاحظات ====================
  const NOTE_COLORS = { default: "#CFC6C8", red: "#E63946", orange: "#F4A261", yellow: "#E9C46A", green: "#2A9D8F", blue: "#3A86FF", purple: "#8B5CF6" };
  const notesState = { list: [], filter: "all", q: "" };

  function noteFormHtml(n = {}) {
    const color = n.color || "default";
    return `
      <div class="field"><input id="nTitle" maxlength="120" placeholder="عنوان الملاحظة" value="${esc(n.title || "")}"></div>
      <div class="field"><textarea id="nBody" rows="3" maxlength="5000" placeholder="التفاصيل (اختياري)">${esc(n.body || "")}</textarea></div>
      <div class="fx-row" style="margin-bottom:12px">
        <div class="fx-colors" role="group" aria-label="لون الملاحظة">${Object.entries(NOTE_COLORS).map(([k, c]) =>
          `<button type="button" class="fx-color${k === color ? " on" : ""}" data-color="${k}" style="background:${c}" aria-label="${k}"></button>`).join("")}</div>
        <span class="fx-spacer"></span>
        <label class="fx-muted" style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="nPin" ${n.pinned ? "checked" : ""}> تثبيت 📌</label>
      </div>
      <div class="field"><label>تذكير (اختياري)</label>
        <input type="datetime-local" id="nRem" value="${n.remind_at ? toLocalInput(new Date(n.remind_at)) : ""}">
        <div class="fx-quick-rem">
          <button type="button" class="fx-chip" data-q="30">بعد 30 دقيقة</button><button type="button" class="fx-chip" data-q="60">بعد ساعة</button>
          <button type="button" class="fx-chip" data-q="tom">غداً 9:00 ص</button><button type="button" class="fx-chip" data-q="none">بدون تذكير</button>
        </div></div>`;
  }
  function bindNoteForm(root) {
    let color = ($(".fx-color.on", root) || {}).dataset?.color || "default";
    $$(".fx-color", root).forEach(b => b.onclick = () => { color = b.dataset.color; $$(".fx-color", root).forEach(x => x.classList.toggle("on", x === b)); });
    $$("[data-q]", root).forEach(b => b.onclick = () => {
      const inp = $("#nRem", root), v = b.dataset.q;
      if (v === "none") { inp.value = ""; return; }
      let d = new Date();
      if (v === "tom") { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); } else d = new Date(Date.now() + Number(v) * 60000);
      inp.value = toLocalInput(d);
    });
    return () => {
      const rem = $("#nRem", root).value;
      return {
        title: $("#nTitle", root).value.trim(), body: $("#nBody", root).value.trim() || null, color,
        pinned: $("#nPin", root).checked, remind_at: rem ? new Date(rem).toISOString() : null
      };
    };
  }
  async function askNotifyPermission() {
    try { if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission(); } catch {}
  }

  function renderNotes(c) {
    c.innerHTML = `
      <div class="card fx-compose"><h2><span class="bar"></span>ملاحظة جديدة</h2>${noteFormHtml()}
        <button class="btn" id="nSave">حفظ الملاحظة</button></div>
      <div class="card"><h2><span class="bar"></span>ملاحظاتي</h2>
        <div class="fx-row" style="margin-bottom:12px">
          <div class="fx-chips">${[["all", "الكل"], ["pinned", "المثبتة"], ["reminders", "بتذكير"], ["done", "المنجزة"]].map(([k, l]) =>
            `<button class="fx-chip${notesState.filter === k ? " on" : ""}" data-f="${k}">${l}</button>`).join("")}</div>
          <span class="fx-spacer"></span>
          <input id="nQ" placeholder="بحث…" value="${esc(notesState.q)}" style="padding:7px 10px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);color:var(--ink);font-family:inherit;min-width:140px">
        </div>
        <div id="nList"><div class="fx-skel"></div><div class="fx-skel"></div></div></div>`;
    const compose = $(".fx-compose", c);
    const read = bindNoteForm(compose);
    $("#nSave", c).onclick = async e => {
      const data = read();
      if (!data.title) { $("#nTitle", compose).focus(); return; }
      e.target.disabled = true;
      try {
        if (data.remind_at) await askNotifyPermission();
        const r = await call("/api/notes", "POST", data);
        notesState.list.unshift(r.note); sortNotes();
        // لا نمسح النموذج إذا بدأ المستخدم بكتابة ملاحظة أخرى أثناء الحفظ
        if ($("#nTitle", compose).value.trim() === data.title) {
          $("#nTitle", compose).value = ""; $("#nBody", compose).value = ""; $("#nRem", compose).value = ""; $("#nPin", compose).checked = false;
        }
        toast("تم حفظ الملاحظة", data.remind_at ? `سيصلك تذكير في ${fmtDT(data.remind_at)}` : null, "ok");
        drawNotes();
      } catch (err) { toast("تعذر الحفظ", err.message, "bad"); }
      e.target.disabled = false;
    };
    $$("[data-f]", c).forEach(b => b.onclick = () => { notesState.filter = b.dataset.f; $$("[data-f]", c).forEach(x => x.classList.toggle("on", x === b)); drawNotes(); });
    $("#nQ", c).oninput = e => { notesState.q = e.target.value; drawNotes(); };
    call("/api/notes").then(d => { notesState.list = d.notes; drawNotes(); })
      .catch(e => { $("#nList").innerHTML = `<div class="empty">${esc(e.message)}</div>`; });
  }
  function sortNotes() {
    notesState.list.sort((a, b) => (b.pinned - a.pinned) || (a.done - b.done) || (b.updated_at > a.updated_at ? 1 : -1));
  }
  function drawNotes() {
    const box = $("#nList"); if (!box) return;
    const q = notesState.q.trim().toLowerCase();
    const list = notesState.list.filter(n => {
      if (notesState.filter === "pinned" && !n.pinned) return false;
      if (notesState.filter === "reminders" && !n.remind_at) return false;
      if (notesState.filter === "done" && !n.done) return false;
      if (notesState.filter === "all" && n.done && !q) { /* المنجزة تظهر في آخر القائمة */ }
      return !q || (n.title + " " + (n.body || "")).toLowerCase().includes(q);
    });
    if (!list.length) {
      box.innerHTML = `<div class="empty">${notesState.list.length ? "لا توجد ملاحظات مطابقة." : "لا توجد ملاحظات بعد. اكتب أول ملاحظة من الأعلى وأضف تذكيراً إن احتجت."}</div>`;
      return;
    }
    const now = Date.now();
    box.innerHTML = `<div class="fx-note-grid">${list.map(n => {
      let rem = "";
      if (n.remind_at) {
        const past = new Date(n.remind_at).getTime() <= now;
        rem = `<span class="rem${past ? " past" : ""}">⏰ ${past ? (n.reminded ? "تم التذكير" : "فات") + " · " : ""}${fmtDT(n.remind_at)}</span>`;
      }
      return `<div class="fx-note${n.done ? " done" : ""}" data-c="${esc(n.color)}">
        <button class="pin${n.pinned ? " on" : ""}" data-pin="${n.id}" aria-label="${n.pinned ? "إلغاء التثبيت" : "تثبيت"}">📌</button>
        <h4>${esc(n.title)}</h4>${n.body ? `<p>${esc(n.body)}</p>` : ""}
        <div class="foot">${rem}<div class="acts">
          <button data-done="${n.id}">${n.done ? "↺ إعادة فتح" : "✓ إنجاز"}</button>
          <button data-edit="${n.id}">تعديل</button><button data-del="${n.id}" style="color:var(--bad)">حذف</button>
        </div></div></div>`;
    }).join("")}</div>`;
    const find = id => notesState.list.find(n => n.id === Number(id));
    const update = async (n, patch) => {
      try { const r = await call(`/api/notes/${n.id}`, "PUT", patch); Object.assign(n, r.note); sortNotes(); drawNotes(); }
      catch (e) { toast("تعذر التحديث", e.message, "bad"); }
    };
    $$("[data-pin]", box).forEach(b => b.onclick = () => { const n = find(b.dataset.pin); update(n, { pinned: !n.pinned }); });
    $$("[data-done]", box).forEach(b => b.onclick = () => { const n = find(b.dataset.done); update(n, { done: !n.done }); if (!n.done) toast("أحسنت! تم إنجاز الملاحظة", null, "ok"); });
    $$("[data-del]", box).forEach(b => b.onclick = async () => {
      const n = find(b.dataset.del);
      if (!confirm(`حذف الملاحظة "${n.title}"؟`)) return;
      try { await call(`/api/notes/${n.id}`, "DELETE"); notesState.list = notesState.list.filter(x => x.id !== n.id); drawNotes(); toast("تم حذف الملاحظة"); }
      catch (e) { toast("تعذر الحذف", e.message, "bad"); }
    });
    $$("[data-edit]", box).forEach(b => b.onclick = () => {
      const n = find(b.dataset.edit);
      const m = modal({ title: "تعديل الملاحظة", html: noteFormHtml(n) + `<button class="btn" id="nUpd">حفظ التعديلات</button>` });
      const read = bindNoteForm(m.body);
      $("#nUpd", m.body).onclick = async e => {
        const data = read(); if (!data.title) { $("#nTitle", m.body).focus(); return; }
        e.target.disabled = true;
        if (data.remind_at) await askNotifyPermission();
        try { const r = await call(`/api/notes/${n.id}`, "PUT", data); Object.assign(n, r.note); sortNotes(); drawNotes(); m.close(); toast("تم حفظ التعديلات", null, "ok"); }
        catch (err) { toast("تعذر الحفظ", err.message, "bad"); e.target.disabled = false; }
      };
    });
  }

  // ==================== الربط مع التطبيق الرئيسي ====================
  let pollTimer = null;
  window.FX = {
    extraTabs(role) {
      const tabs = [["leaderboard", "لوحة الصدارة"], ["games", "الترفيه"], ["notes", "ملاحظاتي"]];
      if (role === "super_admin" || role === "office_admin") tabs.push(["team", "الفريق"]);
      return tabs;
    },
    render(tab, c) {
      if (tab === "leaderboard") { renderLeaderboard(c); return true; }
      if (tab === "games") { renderGames(c); return true; }
      if (tab === "notes") { renderNotes(c); return true; }
      if (tab === "team") { renderTeam(c); return true; }
      return false;
    },
    onTabRender(c) {
      c.classList.remove("fx-enter"); void c.offsetWidth; c.classList.add("fx-enter");
      clearTimeout(c._fxT); c._fxT = setTimeout(() => c.classList.remove("fx-enter"), 1400);
    },
    onAppReady(user) {
      if (user && user.preferences && Object.keys(user.preferences).length) {
        prefs = { ...DEFAULT_PREFS, ...user.preferences };
        try { localStorage.setItem(LS_KEY, JSON.stringify(prefs)); } catch {}
        applyPrefs();
      }
      mountTopbar();
      loadCelebrations();
      setTimeout(() => openMyCelebrations(false), 600);
      pollNotifs();
      clearInterval(pollTimer); pollTimer = setInterval(pollNotifs, 30000);
    },
    openPerson, openProfile, toast, confetti
  };
})();
