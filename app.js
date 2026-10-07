/* hochu — app logic. Vanilla JS + localStorage. No backend. */
(() => {
  "use strict";

  // ---------- state ----------
  const LS = {
    lang: "hochu.lang",
    session: "hochu.session",
    users: "hochu.users",      // { handle: {name,avatar,email,pass?,uid?} } — profile cache
    emails: "hochu.emails",    // { email: handle } — local-mode login index
    data: "hochu.data",        // { handle: {wishes:[], friends:[], likes:{}, xp, streak, lastActive} }
  };
  const PTS = { step: 10, done: 50 };
  const LVL_STEP = 200; // pts per level

  let lang = localStorage.getItem(LS.lang) || detectLang();
  let me = localStorage.getItem(LS.session) || null;  // always the handle (username)
  let authUid = null;                                  // Supabase auth user id, when in cloud mode
  let view = "mine";
  let catFilter = "all";
  let setFilter = null;   // active set id, or null for all
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
    if (!d[me]) d[me] = { wishes: [], friends: [], likes: {}, sets: [], xp: 0, streak: 1, lastActive: today() };
    if (!d[me].sets) d[me].sets = [];
    return d[me];
  }
  function saveMy(obj) { const d = allData(); d[me] = obj; write(LS.data, d); pushCloud(obj); }

  const today = () => new Date().toISOString().slice(0, 10);
  const uid = () => Math.random().toString(36).slice(2, 9);

  // ---------- rendering root ----------
  const app = document.getElementById("app");
  const authScreen = document.getElementById("auth-screen");

  async function boot() {
    renderAuthLang();
    bindAuth();
    document.querySelectorAll(".signup-only").forEach(el => el.style.display = "none");
    setAuthNote();
    if (window.SUPA_READY) {
      try {
        const { data } = await window.sb.auth.getSession();
        if (data && data.session) { await loadSupaProfile(data.session.user); afterLogin(); return; }
      } catch (e) { /* fall through to auth screen */ }
      showAuth();
    } else {
      if (me && users()[me]) { authScreen.classList.add("hidden"); updateStreak(); render(); }
      else showAuth();
    }
  }
  function showAuth() { authScreen.classList.remove("hidden"); applyI18nStatic(); }
  function afterLogin() {
    updateStreak();   // each account starts with its own (empty) wishlist — no shared seed
    authScreen.classList.add("hidden");
    view = "mine"; render();
  }
  function setAuthNote() {
    const n = document.getElementById("auth-note");
    if (n) n.setAttribute("data-i18n", window.SUPA_READY ? "cloudNote" : "localNote");
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
        document.querySelectorAll(".signup-only").forEach(el => el.style.display = authMode === "signup" ? "flex" : "none");
        applyI18nStatic();
      };
    });
    const authSup = document.getElementById("auth-support");
    if (authSup) authSup.onclick = openSupport;
    document.getElementById("auth-form").onsubmit = async (e) => {
      e.preventDefault();
      const name = document.getElementById("auth-name").value.trim();
      const handle = normHandle(document.getElementById("auth-handle").value);
      const email = document.getElementById("auth-email").value.trim().toLowerCase();
      const password = document.getElementById("auth-pass").value;
      if (!email || !email.includes("@")) return toast(T("needEmail"));
      if (!password || password.length < 6) return toast(T("needPassword"));
      if (authMode === "signup" && !handle) return toast(T("needHandle"));

      const submit = document.getElementById("auth-submit");
      submit.disabled = true; submit.textContent = T("working");
      try {
        if (window.SUPA_READY) {
          if (authMode === "signup") await supaSignup({ name, handle, email, password });
          else await supaSignin({ email, password });
        } else {
          if (authMode === "signup") localSignup({ name, handle, email, password });
          else localSignin({ email, password });
        }
      } catch (err) {
        toast((err && err.message) || T("wrongLogin"));
      } finally {
        submit.disabled = false; applyI18nStatic();
      }
    };
  }

  // ----- Supabase (cloud) auth -----
  async function supaSignup({ name, handle, email, password }) {
    // pre-check username availability (select is public per RLS)
    const { data: taken } = await window.sb.from("profiles").select("handle").eq("handle", handle).maybeSingle();
    if (taken) return toast(T("takenHandle"));
    const { data, error } = await window.sb.auth.signUp({
      email, password, options: { data: { name: name || handle, handle, avatar: pickAvatar() } },
    });
    if (error) return toast(error.message);
    if (!data.session) return toast(T("checkEmail"));  // email confirmation is ON
    await loadSupaProfile(data.user);
    afterLogin();
  }
  async function supaSignin({ email, password }) {
    const { data, error } = await window.sb.auth.signInWithPassword({ email, password });
    if (error) return toast(T("wrongLogin"));
    await loadSupaProfile(data.user);
    afterLogin();
  }
  async function loadSupaProfile(user) {
    authUid = user.id;
    let { data: prof } = await window.sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (!prof) {
      const md = user.user_metadata || {};
      prof = { id: user.id, handle: md.handle || ("u" + user.id.slice(0, 6)),
        name: md.name || md.handle || "friend", avatar: md.avatar || pickAvatar() };
      await window.sb.from("profiles").insert(prof);  // RLS: auth.uid() = id
    }
    me = prof.handle;
    localStorage.setItem(LS.session, me);
    const db = users(); db[me] = { name: prof.name, handle: prof.handle, avatar: prof.avatar, uid: user.id };
    write(LS.users, db);
    // pull this account's wishes/sets from the cloud so it works across devices
    const all = allData();
    if (prof.data && Array.isArray(prof.data.wishes)) all[me] = prof.data;
    else if (!all[me]) all[me] = { wishes: [], friends: [], likes: {}, sets: [], xp: 0, streak: 1, lastActive: today() };
    write(LS.data, all);
  }

  // push the whole per-user blob to Supabase (debounced); no-op in on-device mode
  let cloudTimer = null;
  function pushCloud(obj) {
    if (!window.SUPA_READY || !authUid) return;
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(() => {
      window.sb.from("profiles").update({ data: obj }).eq("id", authUid).then(() => {}, () => {});
    }, 600);
  }

  // ----- Local (on-device) auth fallback -----
  function localSignup({ name, handle, email, password }) {
    const db = users(), emap = read(LS.emails, {});
    if (db[handle]) return toast(T("takenHandle"));
    if (emap[email]) return toast(T("wrongLogin"));
    db[handle] = { name: name || handle, handle, avatar: pickAvatar(), email, pass: password };
    write(LS.users, db);
    emap[email] = handle; write(LS.emails, emap);
    me = handle; localStorage.setItem(LS.session, me);
    afterLogin();
  }
  function localSignin({ email, password }) {
    const emap = read(LS.emails, {}), db = users();
    const handle = emap[email];
    if (!handle || !db[handle] || db[handle].pass !== password) return toast(T("wrongLogin"));
    me = handle; localStorage.setItem(LS.session, me);
    afterLogin();
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
        <button class="fab" data-act="new" title="${T("newWish")}" aria-label="${T("newWish")}">+</button>
      </div>`;
    bindShell();
    renderView();
  }

  function sidebar() {
    const items = [
      ["feed","🌐","nav_feed"],
      ["mine","✨","nav_mine"],
      ["graph","🪐","nav_graph"],
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
          <button class="btn btn-ghost btn-block btn-sm" data-act="support">💬 ${T("support_t")}</button>
          <button class="btn btn-ghost btn-block btn-sm" data-act="signout">${T("signout")}</button>
        </div>
      </aside>`;
  }

  function topbar() {
    const d = myData(), u = users()[me] || {};
    const lvl = levelOf(d.xp);
    const into = d.xp % LVL_STEP, pct = Math.round(into / LVL_STEP * 100);
    const titles = { feed:"nav_feed", mine:"nav_mine", graph:"nav_graph", friends:"friends_t", coach:"coach_t" };
    return `
      <div class="topbar">
        <h1>${T(titles[view])}</h1>
        <div class="topbar-actions">
          <button class="icon-btn" data-act="support" title="${T("support_t")}">💬</button>
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
    document.querySelectorAll("[data-nav]").forEach(b => b.onclick = () => { view = b.dataset.nav; catFilter = "all"; setFilter = null; render(); });
    document.querySelectorAll('[data-act="new"]').forEach(b => b.onclick = () => openCompose());
    document.querySelectorAll('[data-act="support"]').forEach(b => b.onclick = openSupport);
    document.querySelector('[data-act="signout"]').onclick = async () => {
      if (window.SUPA_READY) { try { await window.sb.auth.signOut(); } catch (e) {} }
      me = null; authUid = null; localStorage.removeItem(LS.session); location.reload();
    };
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
    stopGraph();
    const v = document.getElementById("view");
    if (view === "mine") {
      const list = myWishes();
      const gridHtml = (setFilter && list.length === 0)
        ? `<div class="empty"><div class="em">📁</div>
             <h3>${esc((myData().sets.find(s => s.id === setFilter) || {}).name || T("sets_t"))}</h3>
             <p>${T("set_empty")}</p></div>`
        : grid(list);
      v.innerHTML =
        `<div class="mine-toolbar"><button class="btn btn-ghost btn-sm" data-act="makestory">${T("story_make")}</button></div>`
        + catRow() + setsRow() + gridHtml;
    }
    else if (view === "feed") v.innerHTML = catRow() + grid(feedWishes());
    else if (view === "graph") { v.innerHTML = graphView(); setupGraph(); }
    else if (view === "friends") v.innerHTML = friendsView();
    else if (view === "coach") v.innerHTML = coachView();
    bindView();
  }

  // ---------- wish collections ----------
  function myWishes() {
    let w = myData().wishes.slice();
    if (catFilter !== "all") w = w.filter(x => x.cat === catFilter);
    if (setFilter) { const s = myData().sets.find(ss => ss.id === setFilter);
      const ids = new Set(s ? s.wishIds : []); w = w.filter(x => ids.has(x.id)); }
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

  // ---------- sets (collections) ----------
  function setsRow() {
    const sets = myData().sets;
    let chips = `<span class="sets-label">${T("sets_t")}</span>`;
    if (sets.length) {
      chips += `<button class="set-chip ${!setFilter ? "active" : ""}" data-set="all">🗂️ ${T("sets_all")}</button>`;
      chips += sets.map(s => `<button class="set-chip ${setFilter === s.id ? "active" : ""}" data-set="${s.id}">${s.emoji || "📁"} ${esc(s.name)} <b>${(s.wishIds || []).length}</b></button>`).join("");
    }
    chips += `<button class="set-chip new" data-set="__new">＋ ${T("sets_new")}</button>`;
    return `<div class="sets-row">${chips}</div>`;
  }
  const SET_EMOJIS = ["📁","✈️","💍","🏖️","🎂","🏡","💪","🌟","🎯","🛍️","🍽️","💘","🧘","📚","🚗"];

  function openNewSet(onDone) {
    let chosen = SET_EMOJIS[0];
    const html = `
      <div class="modal-bg" id="set-bg"><div class="modal" style="max-width:420px">
        <h2>${T("sets_new")}</h2>
        <div class="field"><input id="set-name" placeholder="${T("set_name_ph")}" /></div>
        <div class="field" style="margin-top:12px"><span>${T("set_pick_emoji")}</span>
          <div class="emoji-grid" id="set-emoji">${SET_EMOJIS.map((e,i)=>`<button type="button" data-e="${e}" class="${i===0?"on":""}">${e}</button>`).join("")}</div>
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost" id="set-cancel">${T("cancel")}</button>
          <button class="btn btn-primary" id="set-save">${T("set_create")}</button>
        </div>
      </div></div>`;
    const wrap = document.createElement("div"); wrap.innerHTML = html;
    document.body.appendChild(wrap.firstElementChild);
    const bg = document.getElementById("set-bg");
    const close = () => bg.remove();
    bg.onclick = (e) => { if (e.target === bg) close(); };
    document.getElementById("set-cancel").onclick = close;
    document.querySelectorAll("#set-emoji button").forEach(b => b.onclick = () => {
      document.querySelectorAll("#set-emoji button").forEach(x => x.classList.remove("on"));
      b.classList.add("on"); chosen = b.dataset.e;
    });
    document.getElementById("set-save").onclick = () => {
      const name = document.getElementById("set-name").value.trim();
      if (!name) { document.getElementById("set-name").focus(); return; }
      const d = myData(); const id = uid();
      d.sets.push({ id, name, emoji: chosen, wishIds: [] }); saveMy(d);
      close(); if (onDone) onDone(id); else { setFilter = id; renderView(); }
    };
    setTimeout(() => document.getElementById("set-name").focus(), 50);
  }

  function openSetPicker(wishId) {
    const build = () => {
      const d = myData(); const sets = d.sets;
      return `
        <div class="modal-bg" id="sp-bg"><div class="modal" style="max-width:420px">
          <h2>${T("add_to_set")}</h2>
          ${sets.length ? `<div class="set-list">${sets.map(s => {
            const on = (s.wishIds || []).includes(wishId);
            return `<button class="set-pick ${on ? "on" : ""}" data-toggle="${s.id}">
              <span>${s.emoji || "📁"} ${esc(s.name)}</span><span class="chk">${on ? "✓" : ""}</span></button>`;
          }).join("")}</div>` : `<p class="auth-note" style="text-align:left">${T("set_none")}</p>`}
          <button class="btn btn-ghost btn-block" id="sp-new" style="margin-top:12px">＋ ${T("sets_new")}</button>
          <div class="modal-foot"><button class="btn btn-primary" id="sp-done">${T("done")}</button></div>
        </div></div>`;
    };
    const mount = () => {
      const old = document.getElementById("sp-bg"); if (old) old.remove();
      const wrap = document.createElement("div"); wrap.innerHTML = build();
      document.body.appendChild(wrap.firstElementChild);
      const bg = document.getElementById("sp-bg");
      bg.onclick = (e) => { if (e.target === bg) bg.remove(); };
      document.getElementById("sp-done").onclick = () => { bg.remove(); renderView(); };
      document.getElementById("sp-new").onclick = () => openNewSet(() => mount());
      document.querySelectorAll("[data-toggle]").forEach(b => b.onclick = () => {
        const d = myData(); const s = d.sets.find(ss => ss.id === b.dataset.toggle);
        s.wishIds = s.wishIds || [];
        const i = s.wishIds.indexOf(wishId);
        if (i >= 0) s.wishIds.splice(i, 1); else s.wishIds.push(wishId);
        saveMy(d); mount();
      });
    };
    mount();
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
          ${mine ? `<button class="icon-btn" data-sets="${w.id}" title="${T('add_to_set')}">📁</button>`:''}
          <button class="icon-btn" data-story="${w.id}" data-storyauthor="${author}" title="${T('story_btn')}">📸</button>
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
    document.querySelectorAll("[data-story]").forEach(b => b.onclick = () => openStory("wish", b.dataset.story, b.dataset.storyauthor));
    document.querySelectorAll("[data-sets]").forEach(b => b.onclick = () => openSetPicker(b.dataset.sets));
    document.querySelectorAll("[data-set]").forEach(b => b.onclick = () => {
      if (b.dataset.set === "__new") return openNewSet();
      setFilter = b.dataset.set === "all" ? null : b.dataset.set;
      renderView();
    });
    const ms = document.querySelector('[data-act="makestory"]');
    if (ms) ms.onclick = () => openStory("list");
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
  // overlap between me and a demo friend: shared #tags + categories
  function similarity(friend) {
    const myTags = new Set(), myCats = new Set();
    myData().wishes.forEach(w => { myCats.add(w.cat); (w.tags || []).forEach(t => myTags.add(t)); });
    const fTags = new Set(), fCats = new Set();
    (friend.wishes || []).forEach(w => { fCats.add(w.cat); (w.tags || []).forEach(t => fTags.add(t)); });
    const sharedTags = [...fTags].filter(t => myTags.has(t));
    const sharedCats = [...fCats].filter(c => myCats.has(c));
    return { score: sharedTags.length * 2 + sharedCats.length, sharedTags, sharedCats };
  }

  function friendsView() {
    const d = myData();
    const mine = d.friends;
    const hasWishes = d.wishes.length > 0;
    const rowOf = (f, added, sim) => {
      let chips = "";
      if (sim && sim.score > 0) {
        const cats = sim.sharedCats.map(c => { const cc = window.CATS.find(x => x.id === c);
          return `<span class="ov-chip">${cc.icon} ${T("cat_" + c)}</span>`; });
        const tags = sim.sharedTags.map(t => `<span class="ov-chip tag">#${esc(t)}</span>`);
        chips = `<div class="overlaps">${cats.concat(tags).slice(0, 4).join("")}</div>`;
      }
      return `
      <div class="friend-row">
        <div class="avatar">${f.avatar}</div>
        <div class="friend-meta">
          <div class="fn">${esc(f.name)} ${sim && sim.score > 0 ? `<span class="match">${sim.sharedTags.length + sim.sharedCats.length} ${T("shared_word")}</span>` : ""}</div>
          <div class="fh">@${f.handle}</div>
          ${chips || `<div class="friend-wishes">${(f.wishes||[]).map(w=>esc(w.title)).join(" · ")}</div>`}
        </div>
        ${added ? `<span class="badge">${T("added")} ✓</span>`
                : `<button class="btn btn-ghost btn-sm" data-addfriend="${f.handle}">${T("friends_add")}</button>`}
      </div>`;
    };

    const notFriends = window.DEMO_FRIENDS.filter(f => !mine.includes(f.handle));
    const scored = notFriends.map(f => ({ f, sim: similarity(f) }));
    const similar = scored.filter(x => x.sim.score > 0).sort((a, b) => b.sim.score - a.sim.score);
    const rest = scored.filter(x => x.sim.score === 0);

    return `
      <div class="add-friend">
        <input id="add-friend-input" placeholder="${T('friends_add_ph')}" />
        <button class="btn btn-primary" id="add-friend-btn">${T("friends_add")}</button>
      </div>
      ${mine.length ? mine.map(h => {
          const f = window.DEMO_FRIENDS.find(x=>x.handle===h) || {handle:h,name:h,avatar:'🙂',wishes:[]};
          return rowOf(f, true, similarity(f));
        }).join("") : `<p class="auth-note" style="text-align:left">${T("friends_none")}</p>`}

      <h3 class="section-h">✨ ${T("similar_t")}</h3>
      ${similar.length ? similar.map(x => rowOf(x.f, false, x.sim)).join("")
        : `<p class="auth-note" style="text-align:left">${T("similar_none")}</p>`}

      ${rest.length ? `<h3 class="section-h">${T("suggested")}</h3>${rest.map(x => rowOf(x.f, false)).join("")}` : ""}
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
  //  GRAPH VIEW — 3D force-directed "Obsidian" map
  // =====================================================
  const G = { raf: 0, nodes: [], links: [], adj: null, ay: 0.4, ax: -0.25,
    zoom: 1, drag: false, lx: 0, ly: 0, hover: null, auto: true, cx: 0, cy: 0 };

  function stopGraph() { if (G.raf) { cancelAnimationFrame(G.raf); G.raf = 0; } }

  function graphView() {
    const n = myData().wishes.length;
    if (!n) return `<div class="empty"><div class="em">🪐</div>
      <h3>${T("nav_graph")}</h3><p>${T("graph_empty")}</p></div>`;
    return `
      <div class="graph-wrap">
        <canvas id="graph-canvas"></canvas>
        <div class="graph-hint">🖱️ ${T("graph_hint")}</div>
        <div class="graph-legend" id="graph-legend"></div>
        <div class="graph-tip" id="graph-tip"></div>
      </div>`;
  }

  function buildGraph() {
    const wishes = myData().wishes;
    const nodes = [], links = [];
    const rand = () => (Math.random() - 0.5) * 240;
    const mk = (o) => { const nd = Object.assign({ x: rand(), y: rand(), z: rand(), vx: 0, vy: 0, vz: 0 }, o); nodes.push(nd); return nodes.length - 1; };

    // central "me" node
    const u = users()[me] || {};
    const meIdx = mk({ type: "me", label: "@" + me, emoji: u.avatar || "🙂", r: 24, color: "#ece9f3", x: 0, y: 0, z: 0 });

    // category hubs (only categories in use)
    const hubIdx = {};
    wishes.forEach(w => {
      if (hubIdx[w.cat] == null) {
        const c = window.CATS.find(x => x.id === w.cat) || { icon: "🎯", color: "#a378ff" };
        hubIdx[w.cat] = mk({ type: "cat", label: T("cat_" + w.cat), emoji: c.icon, r: 15, color: c.color, cat: w.cat });
        links.push({ a: meIdx, b: hubIdx[w.cat], len: 150, k: 0.02 });
      }
    });

    // wish nodes
    const byTag = {};
    wishes.forEach(w => {
      const c = window.CATS.find(x => x.id === w.cat) || { color: "#a378ff" };
      const prioBoost = { low: 0, med: 2, high: 4, urgent: 6 }[w.prio] || 0;
      const i = mk({ type: "wish", label: w.title, r: 7 + prioBoost, color: c.color,
        done: w.done, prio: w.prio, cat: w.cat, wid: w.id });
      links.push({ a: hubIdx[w.cat], b: i, len: 78, k: 0.03 });
      (w.tags || []).forEach(t => { (byTag[t] = byTag[t] || []).push(i); });
    });
    // hashtag links between wishes sharing a tag
    Object.values(byTag).forEach(arr => {
      for (let p = 0; p < arr.length; p++)
        for (let q = p + 1; q < arr.length; q++)
          links.push({ a: arr[p], b: arr[q], len: 55, k: 0.015, tag: true });
    });

    // adjacency for highlight
    const adj = nodes.map(() => new Set());
    links.forEach(l => { adj[l.a].add(l.b); adj[l.b].add(l.a); });

    G.nodes = nodes; G.links = links; G.adj = adj;
  }

  function setupGraph() {
    buildGraph();
    const canvas = document.getElementById("graph-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      const r = canvas.parentElement.getBoundingClientRect();
      canvas.width = r.width * dpr; canvas.height = r.height * dpr;
      canvas.style.width = r.width + "px"; canvas.style.height = r.height + "px";
      G.cx = canvas.width / 2; G.cy = canvas.height / 2;
    }
    resize();
    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    // legend
    const used = [...new Set(myData().wishes.map(w => w.cat))];
    document.getElementById("graph-legend").innerHTML =
      `<div class="gl-title">${T("graph_legend")}</div>` +
      used.map(c => { const cc = window.CATS.find(x => x.id === c);
        return `<span class="gl-item"><i style="background:${cc.color}"></i>${cc.icon} ${T("cat_" + c)}</span>`; }).join("");

    const focal = 520;
    function project(nd) {
      const cosY = Math.cos(G.ay), sinY = Math.sin(G.ay);
      let x1 = nd.x * cosY - nd.z * sinY;
      let z1 = nd.x * sinY + nd.z * cosY;
      const cosX = Math.cos(G.ax), sinX = Math.sin(G.ax);
      let y1 = nd.y * cosX - z1 * sinX;
      let z2 = nd.y * sinX + z1 * cosX;
      const s = focal / (focal + z2) * G.zoom * dpr;
      nd._sx = G.cx + x1 * s; nd._sy = G.cy + y1 * s; nd._s = s; nd._z = z2;
    }

    function physics() {
      const N = G.nodes;
      // repulsion
      for (let i = 0; i < N.length; i++) {
        for (let j = i + 1; j < N.length; j++) {
          const a = N[i], b = N[j];
          let dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
          let d2 = dx * dx + dy * dy + dz * dz + 0.01;
          let d = Math.sqrt(d2);
          const f = 900 / d2;
          const ux = dx / d, uy = dy / d, uz = dz / d;
          a.vx += ux * f; a.vy += uy * f; a.vz += uz * f;
          b.vx -= ux * f; b.vy -= uy * f; b.vz -= uz * f;
        }
      }
      // springs
      G.links.forEach(l => {
        const a = N[l.a], b = N[l.b];
        let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        let d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
        const f = (d - l.len) * l.k;
        const ux = dx / d, uy = dy / d, uz = dz / d;
        a.vx += ux * f; a.vy += uy * f; a.vz += uz * f;
        b.vx -= ux * f; b.vy -= uy * f; b.vz -= uz * f;
      });
      // centering + integrate + damping
      N.forEach((n, i) => {
        n.vx += -n.x * 0.0016; n.vy += -n.y * 0.0016; n.vz += -n.z * 0.0016;
        n.vx *= 0.86; n.vy *= 0.86; n.vz *= 0.86;
        if (i === 0) { n.x = n.y = n.z = 0; return; } // pin "me" at center
        n.x += n.vx; n.y += n.vy; n.z += n.vz;
      });
    }

    function hexA(hex, a) {
      const n = parseInt(hex.slice(1), 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      G.nodes.forEach(project);
      const hv = G.hover;
      const lit = hv ? (idx) => (idx === hv || G.adj[hv].has(idx)) : null;

      // links (sorted far→near by midpoint z)
      const order = G.links.map((l, i) => i).sort((p, q) =>
        (G.nodes[G.links[q].a]._z + G.nodes[G.links[q].b]._z) - (G.nodes[G.links[p].a]._z + G.nodes[G.links[p].b]._z));
      order.forEach(i => {
        const l = G.links[i], a = G.nodes[l.a], b = G.nodes[l.b];
        const on = !hv || (lit(l.a) && lit(l.b));
        const depth = Math.max(0.1, Math.min(1, a._s / (1.2 * dpr)));
        ctx.strokeStyle = l.tag ? hexA("#a378ff", (on ? 0.5 : 0.05) * depth)
                                : `rgba(160,150,180,${(on ? 0.32 : 0.05) * depth})`;
        ctx.lineWidth = (l.tag ? 1 : 1.2) * depth;
        ctx.beginPath(); ctx.moveTo(a._sx, a._sy); ctx.lineTo(b._sx, b._sy); ctx.stroke();
      });

      // nodes (far→near)
      const nord = G.nodes.map((_, i) => i).sort((p, q) => G.nodes[q]._z - G.nodes[p]._z);
      nord.forEach(idx => {
        const n = G.nodes[idx];
        const on = !hv || lit(idx);
        const r = n.r * n._s;
        ctx.globalAlpha = n.done ? (on ? 0.5 : 0.12) : (on ? 1 : 0.18);
        // glow
        const grd = ctx.createRadialGradient(n._sx, n._sy, 0, n._sx, n._sy, r * 2.4);
        grd.addColorStop(0, hexA(n.color, 0.5)); grd.addColorStop(1, hexA(n.color, 0));
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(n._sx, n._sy, r * 2.4, 0, 7); ctx.fill();
        // core
        ctx.fillStyle = n.color;
        ctx.beginPath(); ctx.arc(n._sx, n._sy, r, 0, 7); ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(20,18,24,.6)"; ctx.stroke();
        // emoji on me/cat, or when hovered/near
        if (n.type !== "wish" || (hv && on)) {
          ctx.globalAlpha = on ? 1 : 0.25;
          const fs = (n.type === "wish" ? 11 : n.r * 0.95) * n._s;
          if (n.emoji) { ctx.font = `${Math.max(9, fs)}px system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText(n.emoji, n._sx, n._sy); }
        }
        // labels for me + cats always; wishes when lit
        const showLabel = n.type !== "wish" || (hv && on) || n._s > 1.5 * dpr;
        if (showLabel) {
          ctx.globalAlpha = on ? 0.95 : 0.2;
          const fs = Math.max(10, (n.type === "wish" ? 11.5 : 13) * Math.min(n._s, 1.6));
          ctx.font = `${n.type === "wish" ? 600 : 700} ${fs}px Inter, system-ui`;
          ctx.textAlign = "center"; ctx.textBaseline = "top";
          ctx.fillStyle = "#ece9f3";
          const lbl = n.label.length > 26 ? n.label.slice(0, 25) + "…" : n.label;
          ctx.fillText(lbl, n._sx, n._sy + r + 3 * dpr);
        }
      });
      ctx.globalAlpha = 1;
    }

    function tick() {
      physics();
      if (G.auto && !G.drag && !G.hover) G.ay += 0.0022;
      draw();
      G.raf = requestAnimationFrame(tick);
    }

    // interaction
    const pos = (e) => { const r = canvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return { x: (t.clientX - r.left) * dpr, y: (t.clientY - r.top) * dpr }; };
    function hit(p) {
      let best = null, bd = 18 * dpr;
      G.nodes.forEach((n, i) => { const d = Math.hypot(n._sx - p.x, n._sy - p.y);
        if (d < Math.max(n.r * n._s + 6 * dpr, bd) && d < (best ? best.d : 1e9)) best = { i, d }; });
      return best ? best.i : null;
    }
    const tip = document.getElementById("graph-tip");
    function onMove(e) {
      const p = pos(e);
      if (G.drag) {
        G.ay += (p.x - G.lx) * 0.005 / dpr;
        G.ax += (p.y - G.ly) * 0.005 / dpr;
        G.ax = Math.max(-1.4, Math.min(1.4, G.ax));
        G.lx = p.x; G.ly = p.y;
      } else {
        const h = hit(p); G.hover = h;
        canvas.style.cursor = h != null ? "pointer" : "grab";
        if (h != null) {
          const n = G.nodes[h];
          tip.textContent = (n.emoji ? n.emoji + "  " : "") + n.label;
          tip.classList.add("show");
        } else tip.classList.remove("show");
      }
    }
    const onDown = (e) => { G.drag = true; const p = pos(e); G.lx = p.x; G.ly = p.y; canvas.style.cursor = "grabbing"; };
    const onUp = () => { G.drag = false; canvas.style.cursor = "grab"; };
    const onWheel = (e) => { e.preventDefault(); G.zoom = Math.max(0.4, Math.min(2.6, G.zoom - e.deltaY * 0.0012)); };

    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("touchstart", onDown, { passive: true });
    canvas.addEventListener("touchmove", (e) => { onMove(e); }, { passive: true });
    canvas.addEventListener("touchend", onUp);
    canvas.style.cursor = "grab";

    // reset view state each open
    G.ay = 0.4; G.ax = -0.25; G.zoom = 1; G.hover = null;
    tick();
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
      const nw = mkWish({
        title, desc: document.getElementById("c-desc").value.trim(),
        cat: state.cat, type: state.type, prio: state.prio,
        freq: state.type === "habit" ? state.freq : "once",
        deadline: document.getElementById("c-deadline").value,
        privacy: state.privacy, tags: state.tags, steps: state.steps,
      });
      d.wishes.unshift(nw);
      // if a set is currently active, drop the new wish into it
      if (setFilter) { const s = d.sets.find(ss => ss.id === setFilter);
        if (s) { s.wishIds = s.wishIds || []; s.wishIds.push(nw.id); } }
      saveMy(d);
      close(); view = "mine"; render(); renderView();
    };
    setTimeout(() => document.getElementById("c-title").focus(), 50);
  }

  // =====================================================
  //  STORY GENERATOR — auto 9:16 Instagram-story image + QR
  // =====================================================
  let storyState = null;

  // ---------- support ----------
  const SUPPORT_EMAIL = "sbsqbiz@gmail.com";
  const SUPPORT_TG = "https://t.me/sab_realism";
  function openSupport() {
    const html = `
      <div class="modal-bg" id="sup-bg"><div class="modal" style="max-width:400px">
        <h2>💬 ${T("support_t")}</h2>
        <p style="color:var(--mut);font-size:14px;margin:0 0 18px">${T("support_sub")}</p>
        <a class="btn btn-primary btn-block" style="margin-bottom:10px"
           href="mailto:${SUPPORT_EMAIL}?subject=hochu%20%E2%80%94%20support">${T("support_email")}</a>
        <a class="btn btn-ghost btn-block" href="${SUPPORT_TG}" target="_blank" rel="noopener">${T("support_tg")}</a>
        <p style="color:var(--mut2);font-size:12px;text-align:center;margin:14px 0 0">
          ${SUPPORT_EMAIL} · t.me/sab_realism</p>
        <div class="modal-foot"><button class="btn btn-ghost" id="sup-close">${T("cancel")}</button></div>
      </div></div>`;
    const wrap = document.createElement("div"); wrap.innerHTML = html;
    document.body.appendChild(wrap.firstElementChild);
    const bg = document.getElementById("sup-bg");
    const close = () => bg.remove();
    bg.onclick = (e) => { if (e.target === bg) close(); };
    document.getElementById("sup-close").onclick = close;
  }

  function wishLink(author, id) { return `${location.origin}${location.pathname}#/w/${author}/${id}`; }
  function profileLink() { return `${location.origin}${location.pathname}#/u/${me}`; }
  const prioColor = (p) => ({ low: "#9c93ad", med: "#a378ff", high: "#ffb454", urgent: "#ff6b7a" }[p] || "#a378ff");
  function deadlineText(w) { const n = daysBetween(today(), w.deadline);
    return n < 0 ? T("overdue") : n === 0 ? T("today") : n + " " + T("daysLeft"); }
  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }

  function openStory(mode, wishId, author) {
    storyState = { mode, wishId: wishId || null, author: author || me };
    const html = `
      <div class="modal-bg" id="story-bg">
        <div class="modal story-modal">
          <h2>${mode === "list" ? T("story_title_list") : T("story_title_wish")}</h2>
          ${wishId ? `<div class="seg story-modes" id="story-modes">
              <button data-smode="wish" class="${mode === "wish" ? "on" : ""}">${T("story_mode_wish")}</button>
              <button data-smode="list" class="${mode === "list" ? "on" : ""}">${T("story_mode_list")}</button>
            </div>` : ""}
          <div class="story-preview"><div class="story-canvas-wrap">
            <canvas id="story-canvas" width="1080" height="1920"></canvas>
          </div></div>
          <div class="story-actions">
            <button class="btn btn-ghost" id="story-copy">${T("story_copy")}</button>
            <button class="btn btn-primary" id="story-download">${T("story_download")}</button>
          </div>
          <div class="modal-foot"><button class="btn btn-ghost" id="story-close">${T("cancel")}</button></div>
        </div>
      </div>`;
    const wrap = document.createElement("div"); wrap.innerHTML = html;
    document.body.appendChild(wrap.firstElementChild);

    const bg = document.getElementById("story-bg");
    const canvas = document.getElementById("story-canvas");
    const close = () => bg.remove();
    bg.onclick = (e) => { if (e.target === bg) close(); };
    document.getElementById("story-close").onclick = close;

    const paint = () => { try {
      if (storyState.mode === "list") drawStoryList(canvas);
      else drawStoryWish(canvas, storyState.wishId, storyState.author);
    } catch (e) { console.warn(e); } };

    if (wishId) document.querySelectorAll("#story-modes button").forEach(b => b.onclick = () => {
      storyState.mode = b.dataset.smode;
      document.querySelectorAll("#story-modes button").forEach(x => x.classList.toggle("on", x === b));
      paint();
    });

    document.getElementById("story-copy").onclick = () => {
      const link = storyState.mode === "list" ? profileLink() : wishLink(storyState.author, storyState.wishId);
      navigator.clipboard?.writeText(link).catch(() => {}); toast(T("copied"));
    };
    document.getElementById("story-download").onclick = () => {
      const link = storyState.mode === "list" ? profileLink() : wishLink(storyState.author, storyState.wishId);
      canvas.toBlob(async (blob) => {
        const file = new File([blob], `hochu-story-${Date.now()}.png`, { type: "image/png" });
        // On phones: open the native share sheet (→ Instagram / Stories, Telegram, etc.)
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try { await navigator.share({ files: [file], title: "хочу · hochu", text: T("story_cta"), url: link }); return; }
          catch (e) { if (e && e.name === "AbortError") return; /* else fall through to download */ }
        }
        // Desktop / unsupported: download the PNG
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = file.name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 3000);
        toast(T("story_saved"));
      }, "image/png");
    };

    paint();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(paint);
  }

  // ---- canvas drawing helpers ----
  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function wrapLines(ctx, text, maxW) {
    const words = String(text).split(" "); const lines = []; let line = "";
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; }
      else line = test;
    }
    if (line) lines.push(line); return lines;
  }
  function drawPillRow(ctx, cx, yTop, items) {
    const padX = 28, h = 68, gap = 20;
    ctx.font = "600 36px Inter, system-ui";
    const ws = items.map(it => ctx.measureText(it.text).width + padX * 2);
    const total = ws.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
    let x = cx - total / 2;
    items.forEach((it, i) => {
      const w = ws[i];
      ctx.fillStyle = "rgba(255,255,255,0.08)"; roundRectPath(ctx, x, yTop, w, h, h / 2); ctx.fill();
      ctx.strokeStyle = hexA(it.color, 0.55); ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = it.color; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = "600 36px Inter, system-ui";
      ctx.fillText(it.text, x + w / 2, yTop + h / 2 + 2);
      x += w + gap;
    });
    return h;
  }
  function storyBg(ctx, W, H, color) {
    ctx.fillStyle = "#120f17"; ctx.fillRect(0, 0, W, H);
    let g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, hexA(color, 0.34)); g.addColorStop(0.5, "rgba(18,15,23,0)"); g.addColorStop(1, hexA(color, 0.2));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    let r1 = ctx.createRadialGradient(W * 0.5, H * 0.3, 0, W * 0.5, H * 0.3, W);
    r1.addColorStop(0, hexA(color, 0.42)); r1.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = r1; ctx.fillRect(0, 0, W, H);
    // sparkles
    ctx.fillStyle = hexA(color, 0.5);
    for (let i = 0; i < 26; i++) { const sx = Math.random() * W, sy = Math.random() * H, s = Math.random() * 4 + 1;
      ctx.globalAlpha = Math.random() * 0.5 + 0.1; ctx.beginPath(); ctx.arc(sx, sy, s, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = hexA(color, 0.45); ctx.lineWidth = 5; roundRectPath(ctx, 26, 26, W - 52, H - 52, 54); ctx.stroke();
  }
  function brandTop(ctx, W) {
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.font = "800 70px Inter, system-ui"; ctx.fillStyle = "#c6a4ff";
    ctx.fillText("хочу", W / 2, 150);
  }
  function drawQR(ctx, text, x, y, size, dark) {
    if (window.qrcode) { try {
      const qr = window.qrcode(0, "M"); qr.addData(text); qr.make();
      const n = qr.getModuleCount(), cell = size / n;
      ctx.fillStyle = dark;
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
        if (qr.isDark(r, c)) ctx.fillRect(Math.floor(x + c * cell), Math.floor(y + r * cell), Math.ceil(cell), Math.ceil(cell));
      return;
    } catch (e) {} }
    ctx.fillStyle = dark; ctx.font = "bold 44px Inter, system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("↗", x + size / 2, y + size / 2);
  }
  function storyFooter(ctx, W, H, handle, link, color) {
    const qs = 300, qx = (W - qs) / 2, qy = H - 620;
    ctx.fillStyle = "#fff"; roundRectPath(ctx, qx - 32, qy - 32, qs + 64, qs + 64, 42); ctx.fill();
    drawQR(ctx, link, qx, qy, qs, "#141218");
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#fff"; ctx.font = "700 40px Inter, system-ui";
    ctx.fillText(T("story_cta"), W / 2, qy + qs + 94);
    ctx.fillStyle = hexA(color, 0.98); ctx.font = "800 50px Inter, system-ui";
    ctx.fillText(handle, W / 2, qy + qs + 166);
    ctx.fillStyle = "rgba(236,233,243,0.5)"; ctx.font = "600 34px Inter, system-ui";
    ctx.fillText("хочу · hochu", W / 2, H - 58);
  }

  function getWishForStory(wishId, author) {
    if (author === me) return myData().wishes.find(x => x.id === wishId) || myData().wishes[0];
    const f = window.DEMO_FRIENDS.find(x => x.handle === author);
    if (f) { const idx = parseInt(String(wishId).split("-").pop()) || 0;
      return normalizeDemo(f.wishes[idx] || f.wishes[0], author, idx); }
    return myData().wishes[0];
  }

  function drawStoryWish(canvas, wishId, author) {
    const ctx = canvas.getContext("2d"), W = 1080, H = 1920;
    const w = getWishForStory(wishId, author); if (!w) return;
    const cc = window.CATS.find(c => c.id === w.cat) || { icon: "🎯", color: "#a378ff" };
    storyBg(ctx, W, H, cc.color);
    brandTop(ctx, W);

    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "150px system-ui"; ctx.fillText(cc.icon, W / 2, 420);
    drawPillRow(ctx, W / 2, 530, [{ text: T("cat_" + w.cat).toUpperCase(), color: cc.color }]);

    ctx.fillStyle = "#fff"; ctx.textBaseline = "alphabetic";
    const size = w.title.length > 40 ? 60 : w.title.length > 22 ? 74 : 90;
    ctx.font = `800 ${size}px Inter, system-ui`;
    const lines = wrapLines(ctx, w.title, W - 200).slice(0, 5);
    let ty = 720;
    lines.forEach(ln => { ctx.fillText(ln, W / 2, ty); ty += size * 1.2; });

    if (w.desc) { ctx.font = "400 36px Inter, system-ui"; ctx.fillStyle = "rgba(236,233,243,0.7)";
      wrapLines(ctx, w.desc, W - 260).slice(0, 2).forEach(ln => { ctx.fillText(ln, W / 2, ty + 6); ty += 48; }); }

    const pills = [{ text: prioIcon(w.prio) + " " + T("prio_" + w.prio), color: prioColor(w.prio) }];
    if (w.deadline) pills.push({ text: "📅 " + deadlineText(w), color: "#ece9f3" });
    pills.push({ text: T("type_" + w.type), color: cc.color });
    ty += 54; drawPillRow(ctx, W / 2, ty, pills); ty += 120;

    if (w.tags && w.tags.length) { ctx.font = "600 38px Inter, system-ui"; ctx.fillStyle = hexA(cc.color, 0.98);
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.fillText(w.tags.slice(0, 4).map(t => "#" + t).join("  "), W / 2, ty); }

    storyFooter(ctx, W, H, "@" + author, wishLink(author, wishId), cc.color);
  }

  function drawStoryList(canvas) {
    const ctx = canvas.getContext("2d"), W = 1080, H = 1920;
    const d = myData();
    let wishes = d.wishes.filter(x => x.privacy !== "private");
    if (catFilter !== "all") wishes = wishes.filter(x => x.cat === catFilter);
    let title = T("story_mywishlist"), accent = "#a378ff";
    if (setFilter) { const s = d.sets.find(ss => ss.id === setFilter);
      if (s) { const ids = new Set(s.wishIds || []); wishes = wishes.filter(x => ids.has(x.id));
        title = (s.emoji || "📁") + " " + s.name; } }
    else if (catFilter !== "all") { const cc = window.CATS.find(c => c.id === catFilter);
      if (cc) { title = cc.icon + " " + T("cat_" + catFilter); accent = cc.color; } }

    storyBg(ctx, W, H, accent); brandTop(ctx, W);

    // title
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#fff"; ctx.font = "800 70px Inter, system-ui";
    ctx.fillText(title.length > 24 ? title.slice(0, 23) + "…" : title, W / 2, 300);

    // own account: avatar + @handle, centered
    const av = (users()[me] || {}).avatar || "🙂";
    ctx.font = "700 44px Inter, system-ui";
    const hw = ctx.measureText("@" + me).width, avS = 58, gap = 16, total = avS + gap + hw;
    let sx = W / 2 - total / 2, acy = 372;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath(); ctx.arc(sx + avS / 2, acy - 14, avS / 2, 0, 7); ctx.fill();
    ctx.font = "34px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(av, sx + avS / 2, acy - 14);
    ctx.font = "700 44px Inter, system-ui"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = hexA(accent, 0.98); ctx.fillText("@" + me, sx + avS + gap, acy);

    let y = 460; const rowH = 148, max = 5, inner = rowH - 24;
    wishes.slice(0, max).forEach(w => {
      const cc = window.CATS.find(c => c.id === w.cat) || { icon: "🎯", color: "#a378ff" };
      const x = 90, rw = W - 180, cy = y + inner / 2;
      ctx.fillStyle = "rgba(255,255,255,0.06)"; roundRectPath(ctx, x, y, rw, inner, 28); ctx.fill();
      ctx.strokeStyle = hexA(cc.color, 0.4); ctx.lineWidth = 2; ctx.stroke();
      ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.font = "64px system-ui";
      ctx.fillText(cc.icon, x + 38, cy);
      ctx.fillStyle = "#fff"; ctx.font = "700 42px Inter, system-ui";
      const title = w.title.length > 26 ? w.title.slice(0, 25) + "…" : w.title;
      ctx.fillText(title, x + 140, cy - 16);
      ctx.fillStyle = "rgba(236,233,243,0.62)"; ctx.font = "500 32px Inter, system-ui";
      let sub = T("cat_" + w.cat); if (w.deadline) sub += " · 📅 " + deadlineText(w);
      ctx.fillText(sub, x + 140, cy + 28);
      ctx.fillStyle = prioColor(w.prio); ctx.beginPath(); ctx.arc(x + rw - 46, cy, 15, 0, 7); ctx.fill();
      y += rowH;
    });
    if (wishes.length > max) { ctx.fillStyle = "rgba(236,233,243,0.62)"; ctx.font = "600 36px Inter, system-ui";
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.fillText(T("story_more").replace("{n}", wishes.length - max), W / 2, y + 44); }

    storyFooter(ctx, W, H, "@" + me, profileLink(), accent);
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
