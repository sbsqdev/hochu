/* hochu — app logic. Vanilla JS + localStorage. No backend. */
(() => {
  "use strict";

  // ---------- state ----------
  const LS = {
    lang: "hochu.lang",
    session: "hochu.session",
    users: "hochu.users",      // { handle: {name,pin,avatar} }
    data: "hochu.data",        // { handle: {wishes:[], friends:[], likes:{}, xp, streak, lastActive} }
  };
  const PTS = { step: 10, done: 50 };
  const LVL_STEP = 200; // pts per level

  let lang = localStorage.getItem(LS.lang) || detectLang();
  let me = localStorage.getItem(LS.session) || null;
  let view = "mine";
  let catFilter = "all";
  let authMode = "signin";

  function detectLang() {
    const n = (navigator.language || "en").slice(0, 2);
    return window.I18N[n] ? n : "en";
  }
  const T = (k) => (window.I18N[lang] && window.I18N[lang][k]) || window.I18N.en[k] || k;

  // ---------- storage helpers ----------
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const users = () => read(LS.users, {});
  const allData = () => read(LS.data, {});
  function myData() {
    const d = allData();
    if (!d[me]) d[me] = { wishes: [], friends: [], likes: {}, xp: 0, streak: 1, lastActive: today() };
    return d[me];
  }
  function saveMy(obj) { const d = allData(); d[me] = obj; write(LS.data, d); }

  const today = () => new Date().toISOString().slice(0, 10);
  const uid = () => Math.random().toString(36).slice(2, 9);

  // ---------- rendering root ----------
  const app = document.getElementById("app");
  const authScreen = document.getElementById("auth-screen");

  function boot() {
    renderAuthLang();
    bindAuth();
    if (me && users()[me]) { authScreen.classList.add("hidden"); updateStreak(); render(); }
    else { authScreen.classList.remove("hidden"); applyI18nStatic(); }
  }

  // ---------- i18n on static auth DOM ----------
  function applyI18nStatic() {
    document.querySelectorAll("[data-i18n]").forEach(el => {
      el.textContent = T(el.getAttribute("data-i18n"));
    });
    document.getElementById("auth-submit").textContent = T(authMode);
  }

  function renderAuthLang() {
    const box = document.getElementById("auth-lang");
    box.innerHTML = "";
    Object.keys(window.I18N).forEach(code => {
      const b = document.createElement("button");
      b.className = "lang-btn" + (code === lang ? " active" : "");
      b.textContent = code.toUpperCase();
      b.onclick = () => { lang = code; localStorage.setItem(LS.lang, code); renderAuthLang(); applyI18nStatic(); };
      box.appendChild(b);
    });
  }

  // ---------- auth ----------
  function bindAuth() {
    document.querySelectorAll(".auth-tab").forEach(t => {
      t.onclick = () => {
        authMode = t.dataset.authtab;
        document.querySelectorAll(".auth-tab").forEach(x => x.classList.toggle("active", x === t));
        document.querySelector(".signup-only").style.display = authMode === "signup" ? "flex" : "none";
        applyI18nStatic();
      };
    });
    document.getElementById("auth-form").onsubmit = (e) => {
      e.preventDefault();
      const handle = normHandle(document.getElementById("auth-handle").value);
      const pin = document.getElementById("auth-pin").value.trim();
      const name = document.getElementById("auth-name").value.trim();
      if (!handle) return toast(T("needHandle"));
      if (!pin) return toast(T("needPin"));
      const db = users();
      if (authMode === "signup") {
        if (db[handle]) return toast(T("takenHandle"));
        db[handle] = { name: name || handle, pin, avatar: pickAvatar() };
        write(LS.users, db);
      } else {
        if (!db[handle]) return toast(T("wrongPin"));
        if (db[handle].pin !== pin) return toast(T("wrongPin"));
      }
      me = handle; localStorage.setItem(LS.session, me);
      seedIfEmpty();
      updateStreak();
      authScreen.classList.add("hidden");
      view = "mine";
      render();
    };
  }
  const normHandle = (s) => s.trim().replace(/^@/, "").toLowerCase().replace(/[^a-z0-9_]/g, "");
  const avatars = ["🦊","🐙","🌵","🦄","🐳","🦉","🌞","🍄","🪐","🐝","🦩","🫐"];
  const pickAvatar = () => avatars[Math.floor(Math.random() * avatars.length)];

  function seedIfEmpty() {
    const d = myData();
    if (d.wishes.length === 0) {
      d.wishes = [
        mkWish({ title: sampleTitle(), cat: "travel", type: "goal", prio: "high",
          deadline: addDays(10), tags: ["travel","istanbul"], privacy: "public",
          steps: ["Check flights","Book hotel","Tell my bf 🕊️"] }),
        mkWish({ title: T("_name") === "Русский" ? "Бегать по пляжу каждое утро" :
                 T("_name") === "Türkçe" ? "Her sabah sahilde koşmak" : "Run on the beach every morning",
          cat: "habits", type: "habit", freq: "daily", prio: "med", tags: ["morning","running"], privacy: "friends" }),
        mkWish({ title: "хочу манты 🥟", cat: "food", type: "event", prio: "low",
          deadline: addDays(2), tags: ["foodie"], privacy: "public" }),
      ];
      saveMy(d);
    }
  }
  function sampleTitle(){
    return lang==="ru" ? "Хочу чтобы мой любимый увидел меня в Стамбуле" :
           lang==="tr" ? "Sevgilimin beni İstanbul'da görmesini istiyorum" :
           "I want my bf to see me in Istanbul";
  }

  function mkWish(o) {
    return {
      id: uid(), title: o.title || "", desc: o.desc || "", cat: o.cat || "goals",
      type: o.type || "goal", freq: o.freq || "once", prio: o.prio || "med",
      deadline: o.deadline || "", privacy: o.privacy || "friends",
      tags: o.tags || [], steps: (o.steps || []).map(s => ({ t: s, done: false })),
      done: false, likes: o.likes || 0, created: today(),
    };
  }
  const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

  function updateStreak() {
    const d = myData();
    if (d.lastActive !== today()) {
      const diff = daysBetween(d.lastActive, today());
      d.streak = diff === 1 ? (d.streak || 0) + 1 : 1;
      d.lastActive = today();
      saveMy(d);
    }
  }
  function daysBetween(a, b) {
    return Math.round((new Date(b) - new Date(a)) / 86400000);
  }

  // ---------- XP / levels ----------
  const levelOf = (xp) => Math.floor(xp / LVL_STEP) + 1;
  function grantXP(n, labelKey) {
    const d = myData();
    const before = levelOf(d.xp);
    d.xp += n; saveMy(d);
    const after = levelOf(d.xp);
    toast(T(labelKey).replace("{n}", n));
    if (after > before) setTimeout(() => toast(T("levelUp").replace("{n}", after)), 900);
  }

  // =====================================================
  //  MAIN RENDER
  // =====================================================
  function render() {
    document.documentElement.lang = lang;
    app.innerHTML = `
      <div class="shell">
        ${sidebar()}
        <div class="main">
          ${topbar()}
          <div id="view"></div>
        </div>
      </div>`;
    bindShell();
    renderView();
  }

  function sidebar() {
    const items = [
      ["feed","🌐","nav_feed"],
      ["mine","✨","nav_mine"],
      ["friends","👥","nav_friends"],
      ["coach","🧭","nav_coach"],
    ];
    return `
      <aside class="sidebar">
        <div class="side-brand"><span class="logo-mark">хочу</span><span class="logo-dot">·</span></div>
        ${items.map(([v,ic,k]) => `
          <button class="nav-item ${v===view?'active':''}" data-nav="${v}">
            <span class="ni">${ic}</span><span>${T(k)}</span>
          </button>`).join("")}
        <div class="side-spacer"></div>
        <div class="side-foot">
          <button class="btn btn-primary btn-block" data-act="new">${T("newWish")}</button>
          <div class="lang-switch" id="side-lang"></div>
          <button class="btn btn-ghost btn-block btn-sm" data-act="signout">${T("signout")}</button>
        </div>
      </aside>`;
  }

  function topbar() {
    const d = myData(), u = users()[me] || {};
    const lvl = levelOf(d.xp);
    const into = d.xp % LVL_STEP, pct = Math.round(into / LVL_STEP * 100);
    const titles = { feed:"nav_feed", mine:"nav_mine", friends:"friends_t", coach:"coach_t" };
    return `
      <div class="topbar">
        <h1>${T(titles[view])}</h1>
        <div class="topbar-actions">
          <span class="streak-chip">🔥 ${d.streak} ${T("streak")}</span>
          <div class="me-pill">
            <div class="avatar">${u.avatar || "🙂"}</div>
            <div class="me-meta">
              <span class="me-handle">@${me}</span>
              <span class="me-xp">${T("lvl")} ${lvl} · ${d.xp} ${T("pts")}</span>
            </div>
            <div class="xp-wrap">
              <span class="badge">L${lvl}</span>
              <div class="xp-bar"><div class="xp-fill" style="width:${pct}%"></div></div>
            </div>
          </div>
        </div>
      </div>`;
  }

  function bindShell() {
    document.querySelectorAll("[data-nav]").forEach(b => b.onclick = () => { view = b.dataset.nav; catFilter = "all"; render(); });
    document.querySelector('[data-act="new"]').onclick = () => openCompose();
    document.querySelector('[data-act="signout"]').onclick = () => { me = null; localStorage.removeItem(LS.session); location.reload(); };
    const sl = document.getElementById("side-lang");
    Object.keys(window.I18N).forEach(code => {
      const b = document.createElement("button");
      b.className = "lang-btn" + (code === lang ? " active" : "");
      b.textContent = code.toUpperCase();
      b.onclick = () => { lang = code; localStorage.setItem(LS.lang, code); render(); };
      sl.appendChild(b);
    });
  }

  function renderView() {
    const v = document.getElementById("view");
    if (view === "mine") v.innerHTML = catRow() + grid(myWishes());
    else if (view === "feed") v.innerHTML = catRow() + grid(feedWishes());
    else if (view === "friends") v.innerHTML = friendsView();
    else if (view === "coach") v.innerHTML = coachView();
    bindView();
  }

  // ---------- wish collections ----------
  function myWishes() {
    let w = myData().wishes.slice();
    if (catFilter !== "all") w = w.filter(x => x.cat === catFilter);
    return w.map(x => ({ w: x, author: me, mine: true }))
            .sort(sortWishes);
  }
  function feedWishes() {
    const d = myData();
    const items = [];
    // my public/friends wishes
    d.wishes.filter(x => x.privacy !== "private").forEach(x => items.push({ w: x, author: me, mine: true }));
    // friends' demo wishes
    d.friends.forEach(fh => {
      const f = window.DEMO_FRIENDS.find(x => x.handle === fh);
      if (f) f.wishes.forEach((fw, i) => items.push({ w: normalizeDemo(fw, fh, i), author: fh, mine: false }));
    });
    let out = items;
    if (catFilter !== "all") out = out.filter(x => x.w.cat === catFilter);
    return out.sort(sortWishes);
  }
  function normalizeDemo(fw, handle, i) {
    return { id: `demo-${handle}-${i}`, title: fw.title, desc: "", cat: fw.cat, type: fw.type,
      freq: fw.freq || "once", prio: fw.prio, deadline: "", privacy: "friends",
      tags: fw.tags || [], steps: [], done: false, likes: fw.likes || 0, created: today(), demo: true };
  }
  function sortWishes(a, b) {
    const rank = { urgent: 0, high: 1, med: 2, low: 3 };
    if (a.w.done !== b.w.done) return a.w.done ? 1 : -1;
    return rank[a.w.prio] - rank[b.w.prio];
  }

  // ---------- category row ----------
  function catRow() {
    const chips = [`<button class="cat-chip ${catFilter==='all'?'active':''}" data-cat="all">🗂️ ${lang==='ru'?'Все':lang==='tr'?'Tümü':'All'}</button>`]
      .concat(window.CATS.map(c =>
        `<button class="cat-chip ${catFilter===c.id?'active':''}" data-cat="${c.id}">${c.icon} ${T('cat_'+c.id)}</button>`));
    return `<div class="cat-row">${chips.join("")}</div>`;
  }

  // ---------- grid + cards ----------
  function grid(list) {
    if (!list.length) {
      const k = view === "feed" ? "feed" : "mine";
      return `<div class="empty"><div class="em">${view==='feed'?'🌐':'✨'}</div>
        <h3>${T("empty_"+k+"_t")}</h3><p>${T("empty_"+k+"_d")}</p></div>`;
    }
    return `<div class="grid">${list.map(card).join("")}</div>`;
  }

  function card({ w, author, mine }) {
    const u = author === me ? (users()[me] || {}) : demoUser(author);
    const cat = window.CATS.find(c => c.id === w.cat) || { icon: "🎯" };
    const liked = !!myData().likes[w.id];
    const likeN = w.likes + (liked && !w._wasLiked ? 1 : 0);
    const deadline = deadlinePill(w);
    const total = w.steps.length, doneSteps = w.steps.filter(s => s.done).length;
    const pct = total ? Math.round(doneSteps / total * 100) : (w.done ? 100 : 0);

    return `
    <div class="card ${w.done?'done':''}" data-id="${w.id}" data-author="${author}">
      <div class="prio-rail rail-${w.prio}"></div>
      ${w.done ? `<div class="completed-ribbon">${T("completedBadge")}</div>` : ""}
      <div class="card-head">
        <span class="card-cat">${cat.icon} ${T('cat_'+w.cat)}</span>
        <div class="pill-row">
          <span class="pill type">${T('type_'+w.type)}</span>
          ${w.type==='habit' && w.freq!=='once' ? `<span class="pill freq">${T('freq_'+w.freq)}</span>`:''}
        </div>
      </div>
      <h3 class="card-title">${esc(w.title)}</h3>
      ${w.desc ? `<p class="card-desc">${esc(w.desc)}</p>`:''}
      <div class="pill-row">
        <span class="pill prio-${w.prio}">${prioIcon(w.prio)} ${T('prio_'+w.prio)}</span>
        ${deadline}
        <span class="pill priv">${privIcon(w.privacy)} ${T('priv_'+w.privacy)}</span>
      </div>
      ${w.tags.length ? `<div class="tags">${w.tags.map(t=>`<span class="tag">#${esc(t)}</span>`).join("")}</div>`:''}
      ${total ? `
        <div class="steps">${w.steps.map((s,i)=>`
          <label class="step ${s.done?'on':''}" ${mine?`data-step="${i}"`:''}>
            <input type="checkbox" ${s.done?'checked':''} ${mine?'':'disabled'}/> <span>${esc(s.t)}</span>
          </label>`).join("")}
        </div>
        <div class="prog"><i style="width:${pct}%"></i></div>
        <div class="prog-label">${pct}% ${T("progress")}</div>`:''}
      <div class="card-foot">
        <div class="card-author"><div class="avatar">${u.avatar||'🙂'}</div>@${author}</div>
        <div class="card-actions">
          <button class="like-btn ${liked?'on':''}" data-like="${w.id}">${liked?'❤️':'🤍'} ${likeN}</button>
          ${mine && !w.done ? `<button class="icon-btn" data-complete="${w.id}" title="${T('complete')}">✓</button>`:''}
          ${mine && w.done ? `<button class="icon-btn" data-undo="${w.id}" title="${T('undo')}">↺</button>`:''}
          <button class="icon-btn" data-share="${w.id}" title="${T('share')}">🔗</button>
          ${mine ? `<button class="icon-btn" data-del="${w.id}" title="${T('delete')}">🗑️</button>`:''}
        </div>
      </div>
    </div>`;
  }

  function demoUser(handle) {
    const f = window.DEMO_FRIENDS.find(x => x.handle === handle);
    return f ? { avatar: f.avatar, name: f.name } : { avatar: "🙂" };
  }
  const prioIcon = (p) => ({ low:"🌙", med:"⏳", high:"⭐", urgent:"🔥" }[p] || "");
  const privIcon = (p) => ({ public:"🌐", friends:"👥", private:"🔒" }[p] || "");

  function deadlinePill(w) {
    if (!w.deadline) return "";
    const diff = daysBetween(today(), w.deadline);
    let label, over = diff < 0;
    if (diff === 0) label = T("today");
    else if (diff < 0) label = T("overdue");
    else label = `${diff} ${T("daysLeft")}`;
    return `<span class="pill deadline ${over&&!w.done?'over':''}">📅 ${label}</span>`;
  }

  // ---------- view bindings ----------
  function bindView() {
    document.querySelectorAll("[data-cat]").forEach(b => b.onclick = () => { catFilter = b.dataset.cat; renderView(); });

    document.querySelectorAll("[data-like]").forEach(b => b.onclick = () => toggleLike(b.dataset.like));
    document.querySelectorAll("[data-complete]").forEach(b => b.onclick = () => completeWish(b.dataset.complete));
    document.querySelectorAll("[data-undo]").forEach(b => b.onclick = () => undoWish(b.dataset.undo));
    document.querySelectorAll("[data-del]").forEach(b => b.onclick = () => delWish(b.dataset.del));
    document.querySelectorAll("[data-share]").forEach(b => b.onclick = () => shareWish(b.dataset.share));
    document.querySelectorAll(".step[data-step]").forEach(el => {
      el.onclick = (e) => { e.preventDefault(); toggleStep(el.closest(".card").dataset.id, +el.dataset.step); };
    });

    // friends view
    const af = document.getElementById("add-friend-btn");
    if (af) af.onclick = addFriendFromInput;
    document.querySelectorAll("[data-addfriend]").forEach(b => b.onclick = () => addFriend(b.dataset.addfriend));

    // coach view
    const cs = document.getElementById("coach-wish");
    if (cs) cs.onchange = () => renderCoachPlan(cs.value);
    const ca = document.getElementById("coach-apply");
    if (ca) ca.onclick = applyCoachPlan;
  }

  // ---------- actions ----------
  function toggleLike(id) {
    const d = myData(); d.likes[id] = !d.likes[id]; saveMy(d); renderView();
  }
  function toggleStep(id, i) {
    const d = myData(); const w = d.wishes.find(x => x.id === id); if (!w) return;
    w.steps[i].done = !w.steps[i].done;
    saveMy(d);
    if (w.steps[i].done) grantXP(PTS.step, "reward_step");
    // auto-complete when all steps done
    if (w.steps.length && w.steps.every(s => s.done) && !w.done) completeWish(id, true);
    else { render(); renderView(); }
  }
  function completeWish(id, silentXP) {
    const d = myData(); const w = d.wishes.find(x => x.id === id); if (!w) return;
    w.done = true; saveMy(d);
    if (!silentXP) grantXP(PTS.done, "reward_done"); else grantXP(PTS.done, "reward_done");
    confetti();
    render(); renderView();
  }
  function undoWish(id) {
    const d = myData(); const w = d.wishes.find(x => x.id === id); if (!w) return;
    w.done = false; saveMy(d); renderView();
  }
  function delWish(id) {
    const d = myData(); d.wishes = d.wishes.filter(x => x.id !== id); saveMy(d); renderView();
  }
  function shareWish(id) {
    const d = myData(); const w = d.wishes.find(x => x.id === id);
    if (w && w.privacy === "private") return toast(T("noShareOnPrivate"));
    const link = `${location.origin}${location.pathname}#/w/${me}/${id}`;
    navigator.clipboard?.writeText(link).catch(() => {});
    toast(T("copied"));
  }

  // ---------- friends ----------
  function friendsView() {
    const d = myData();
    const mine = d.friends;
    const suggestions = window.DEMO_FRIENDS.filter(f => !mine.includes(f.handle));
    const rowOf = (f, added) => `
      <div class="friend-row">
        <div class="avatar">${f.avatar}</div>
        <div class="friend-meta">
          <div class="fn">${esc(f.name)}</div>
          <div class="fh">@${f.handle}</div>
          <div class="friend-wishes">${f.wishes.map(w=>esc(w.title)).join(" · ")}</div>
        </div>
        ${added ? `<span class="badge">${T("added")} ✓</span>`
                : `<button class="btn btn-ghost btn-sm" data-addfriend="${f.handle}">${T("friends_add")}</button>`}
      </div>`;
    return `
      <div class="add-friend">
        <input id="add-friend-input" placeholder="${T('friends_add_ph')}" />
        <button class="btn btn-primary" id="add-friend-btn">${T("friends_add")}</button>
      </div>
      ${mine.length ? mine.map(h => {
          const f = window.DEMO_FRIENDS.find(x=>x.handle===h) || {handle:h,name:h,avatar:'🙂',wishes:[]};
          return rowOf(f, true);
        }).join("") : `<p class="auth-note" style="text-align:left">${T("friends_none")}</p>`}
      <h3 style="margin:22px 0 10px;font-size:14px;color:var(--mut)">${T("suggested")}</h3>
      ${suggestions.map(f => rowOf(f, false)).join("")}
    `;
  }
  function addFriendFromInput() {
    const h = normHandle(document.getElementById("add-friend-input").value);
    if (h) addFriend(h);
  }
  function addFriend(h) {
    const d = myData(); if (!d.friends.includes(h)) d.friends.push(h); saveMy(d); renderView();
  }

  // ---------- coach ----------
  function coachView() {
    const d = myData();
    const open = d.wishes.filter(w => !w.done);
    const tips = window.COACH_TIPS[lang] || window.COACH_TIPS.en;
    const opts = open.length
      ? `<select class="field" id="coach-wish" style="padding:11px;border-radius:10px;background:var(--bg2);border:1px solid var(--line);color:var(--txt);width:100%">
           <option value="">${T("coach_pick")}…</option>
           ${open.map(w=>`<option value="${w.id}">${esc(w.title)}</option>`).join("")}
         </select>`
      : `<p class="sub">${T("coach_none")}</p>`;
    return `
      <div class="coach-grid">
        <div class="panel">
          <h3>🧭 ${T("coach_t")}</h3>
          <p class="sub">${T("coach_intro")}</p>
          <div class="coach-select">${opts}</div>
          <div id="coach-plan"></div>
        </div>
        <div class="panel">
          <h3>📚 ${T("coach_tips")}</h3>
          <p class="sub">Harvard · Yale · Stanford</p>
          ${tips.map(tp=>`
            <div class="tip"><span class="em">💡</span><div>
              <div class="src">${tp.src}</div><div class="txt">${tp.t}</div>
            </div></div>`).join("")}
        </div>
      </div>`;
  }

  let coachPlanCache = null;
  function renderCoachPlan(wishId) {
    const box = document.getElementById("coach-plan");
    if (!wishId) { box.innerHTML = ""; coachPlanCache = null; return; }
    const w = myData().wishes.find(x => x.id === wishId);
    const plan = buildPlan(w);
    coachPlanCache = { wishId, plan };
    box.innerHTML = `
      <h3 style="font-size:14px;margin:8px 0 4px">${T("coach_plan")}</h3>
      <div>${plan.map((s,i)=>`<div class="plan-step"><span class="n">${i+1}</span><span>${esc(s)}</span></div>`).join("")}</div>
      <button class="btn btn-primary btn-block" id="coach-apply" style="margin-top:14px">${T("coach_apply")}</button>`;
    document.getElementById("coach-apply").onclick = applyCoachPlan;
  }

  // Rule-based "AI" coach: generates a SMART-ish step plan from the wish.
  function buildPlan(w) {
    const L = lang;
    const G = {
      anchor: { en:`Anchor it: right after an existing routine, do the first small action toward “${w.title}”.`,
                ru:`Привяжи к рутине: сразу после привычного действия сделай первый маленький шаг к «${w.title}».`,
                tr:`Bir rutine bağla: mevcut bir alışkanlıktan hemen sonra “${w.title}” için ilk küçük adımı at.` },
      tiny:   { en:`Shrink it: define a 2-minute version you can do even on a bad day.`,
                ru:`Уменьши: придумай версию на 2 минуты, выполнимую даже в плохой день.`,
                tr:`Küçült: kötü bir günde bile yapabileceğin 2 dakikalık bir versiyon tanımla.` },
      when:   { en:`Set when & where (implementation intention): “I will do it at ___ in ___.”`,
                ru:`Определи когда и где: «Я сделаю это в ___ в ___».`,
                tr:`Ne zaman ve nerede belirle: “Bunu ___ saatinde ___ yerinde yapacağım.”` },
      measure:{ en:`Make it measurable: pick one number that proves progress (reps, days, €, km).`,
                ru:`Сделай измеримым: выбери одно число, которое доказывает прогресс (повторы, дни, €, км).`,
                tr:`Ölçülebilir yap: ilerlemeyi kanıtlayan tek bir sayı seç (tekrar, gün, €, km).` },
      track:  { en:`Track small wins daily — tick it here and watch your streak & XP grow.`,
                ru:`Отмечай маленькие победы каждый день — отмечай здесь и следи за серией и XP.`,
                tr:`Küçük kazanımları her gün kaydet — burada işaretle, serini ve XP'ni izle.` },
      reward: { en:`Celebrate instantly after each rep — the emotion is what locks the habit in.`,
                ru:`Радуйся сразу после каждого повтора — именно эмоция закрепляет привычку.`,
                tr:`Her tekrardan hemen sonra kutla — alışkanlığı kilitleyen duygudur.` },
      deadlineN:{ en:`Deadline is ${deadlineHint(w)} — break it into weekly checkpoints.`,
                ru:`Дедлайн: ${deadlineHint(w)} — разбей на недельные чекпоинты.`,
                tr:`Son tarih: ${deadlineHint(w)} — haftalık kontrol noktalarına böl.` },
      social: { en:`Tell a friend or make it Public here — accountability doubles follow-through.`,
                ru:`Расскажи другу или сделай публичным — ответственность удваивает результат.`,
                tr:`Bir arkadaşına söyle veya Herkese açık yap — hesap verebilirlik sonucu ikiye katlar.` },
    };
    const g = (k) => G[k][L] || G[k].en;
    const plan = [];
    if (w.type === "habit") { plan.push(g("anchor"), g("tiny"), g("when"), g("track"), g("reward")); }
    else { plan.push(g("measure"), g("when")); plan.push(w.deadline ? g("deadlineN") : g("tiny")); plan.push(g("track"), g("social")); }
    return plan;
  }
  function deadlineHint(w){ const n = daysBetween(today(), w.deadline); return n<=0?T("today"):`${n} ${T("daysLeft")}`; }

  function applyCoachPlan() {
    if (!coachPlanCache) return;
    const d = myData(); const w = d.wishes.find(x => x.id === coachPlanCache.wishId); if (!w) return;
    coachPlanCache.plan.forEach(s => w.steps.push({ t: s, done: false }));
    saveMy(d);
    view = "mine"; render(); renderView();
    toast("✓");
  }

  // =====================================================
  //  COMPOSE MODAL
  // =====================================================
  function openCompose() {
    const state = { type: "goal", prio: "med", freq: "once", privacy: "friends", cat: "goals", tags: [], steps: [] };
    const seg = (name, opts, cur) => `<div class="seg" data-seg="${name}">${
      opts.map(o => `<button data-val="${o.v}" class="${o.v===cur?'on '+(o.cls||''):''}">${o.l}</button>`).join("")}</div>`;

    const catOpts = window.CATS.map(c => `<option value="${c.id}">${c.icon} ${T('cat_'+c.id)}</option>`).join("");

    const html = `
      <div class="modal-bg" id="modal-bg">
        <div class="modal" id="compose">
          <h2>${T("compose_title")}</h2>
          <div class="field"><input id="c-title" placeholder="${T('ph_title')}" /></div>
          <div class="field" style="margin-top:12px"><textarea id="c-desc" rows="2" placeholder="${T('ph_desc')}"></textarea></div>

          <div class="row2" style="margin-top:12px">
            <label class="field"><span>${T('f_category')}</span>
              <select id="c-cat">${catOpts}</select></label>
            <div class="field"><span>${T('f_type')}</span>
              ${seg("type",[{v:"goal",l:T("type_goal")},{v:"habit",l:T("type_habit")},{v:"event",l:T("type_event")}],"goal")}</div>
          </div>

          <div class="field" style="margin-top:12px"><span>${T('f_priority')}</span>
            ${seg("prio",[
              {v:"low",l:T("prio_low")},{v:"med",l:T("prio_med")},
              {v:"high",l:T("prio_high"),cls:"high"},{v:"urgent",l:T("prio_urgent"),cls:"urgent"}],"med")}
          </div>

          <div class="row2" style="margin-top:12px">
            <label class="field"><span>${T('f_deadline')}</span><input type="date" id="c-deadline" /></label>
            <div class="field" id="freq-wrap" style="display:none"><span>${T('f_freq')}</span>
              ${seg("freq",[
                {v:"daily",l:T("freq_daily")},{v:"3x",l:T("freq_3x")},
                {v:"weekly",l:T("freq_weekly")},{v:"monthly",l:T("freq_monthly")}],"daily")}</div>
          </div>

          <div class="field" style="margin-top:12px"><span>${T('f_privacy')}</span>
            ${seg("privacy",[{v:"public",l:T("priv_public")},{v:"friends",l:T("priv_friends")},{v:"private",l:T("priv_private")}],"friends")}
          </div>

          <div class="field" style="margin-top:12px"><span>${T('f_tags')}</span>
            <div class="chips-input" id="tags-box"><input id="c-tags" placeholder="${T('ph_tags')}" /></div>
          </div>

          <div class="field" style="margin-top:12px"><span>${T('f_steps')}</span>
            <div class="chips-input" style="flex-direction:column;align-items:stretch">
              <input id="c-step" placeholder="${T('ph_step')}" />
            </div>
            <div class="step-list" id="step-list"></div>
          </div>

          <div class="modal-foot">
            <button class="btn btn-ghost" id="c-cancel">${T("cancel")}</button>
            <button class="btn btn-primary" id="c-save">${T("save")}</button>
          </div>
        </div>
      </div>`;
    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    document.body.appendChild(wrap.firstElementChild);

    const modalBg = document.getElementById("modal-bg");
    const close = () => modalBg.remove();
    modalBg.onclick = (e) => { if (e.target === modalBg) close(); };
    document.getElementById("c-cancel").onclick = close;

    // segmented controls
    modalBg.querySelectorAll(".seg").forEach(segEl => {
      segEl.querySelectorAll("button").forEach(btn => btn.onclick = () => {
        segEl.querySelectorAll("button").forEach(b => { b.className = ""; });
        const cls = btn.dataset.val === "urgent" ? "urgent" : btn.dataset.val === "high" ? "high" : "";
        btn.className = "on " + cls;
        state[segEl.dataset.seg] = btn.dataset.val;
        if (segEl.dataset.seg === "type")
          document.getElementById("freq-wrap").style.display = btn.dataset.val === "habit" ? "flex" : "none";
      });
    });
    document.getElementById("c-cat").onchange = (e) => state.cat = e.target.value;

    // tags
    const tagsBox = document.getElementById("tags-box"), tagInput = document.getElementById("c-tags");
    const renderTags = () => {
      tagsBox.querySelectorAll(".mini-chip").forEach(c => c.remove());
      state.tags.forEach((t, i) => {
        const c = document.createElement("span"); c.className = "mini-chip";
        c.innerHTML = `#${esc(t)} <b data-rm="${i}">✕</b>`;
        c.querySelector("b").onclick = () => { state.tags.splice(i, 1); renderTags(); };
        tagsBox.insertBefore(c, tagInput);
      });
    };
    tagInput.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        const v = tagInput.value.trim().replace(/^#/, "").replace(",", "");
        if (v) { state.tags.push(v); tagInput.value = ""; renderTags(); }
      }
    };

    // steps
    const stepInput = document.getElementById("c-step"), stepList = document.getElementById("step-list");
    const renderSteps = () => {
      stepList.innerHTML = state.steps.map((s, i) =>
        `<div class="row"><span>${i+1}.</span> ${esc(s)} <b data-rm="${i}">✕</b></div>`).join("");
      stepList.querySelectorAll("b").forEach(b => b.onclick = () => { state.steps.splice(+b.dataset.rm, 1); renderSteps(); });
    };
    stepInput.onkeydown = (e) => {
      if (e.key === "Enter") { e.preventDefault(); const v = stepInput.value.trim(); if (v) { state.steps.push(v); stepInput.value = ""; renderSteps(); } }
    };

    document.getElementById("c-save").onclick = () => {
      const title = document.getElementById("c-title").value.trim();
      if (!title) { document.getElementById("c-title").focus(); return; }
      const d = myData();
      d.wishes.unshift(mkWish({
        title, desc: document.getElementById("c-desc").value.trim(),
        cat: state.cat, type: state.type, prio: state.prio,
        freq: state.type === "habit" ? state.freq : "once",
        deadline: document.getElementById("c-deadline").value,
        privacy: state.privacy, tags: state.tags, steps: state.steps,
      }));
      saveMy(d);
      close(); view = "mine"; render(); renderView();
    };
    setTimeout(() => document.getElementById("c-title").focus(), 50);
  }

  // =====================================================
  //  utilities
  // =====================================================
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }

  let toastTimer;
  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg; el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function confetti() {
    const colors = ["#a378ff","#7c4dff","#49d69d","#ffb454","#ff6b7a"];
    for (let i = 0; i < 40; i++) {
      const c = document.createElement("div");
      c.className = "confetti";
      c.style.left = Math.random() * 100 + "vw";
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = (1.4 + Math.random() * 1.4) + "s";
      c.style.animationDelay = Math.random() * 0.3 + "s";
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 3200);
    }
  }

  // ---------- go ----------
  boot();
})();
