(function(){
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const api = (window.HL && window.HL.api) || {};
  const SUPA_URL = api.url || "";
  const ANON_KEY = api.anonKey || "";
  const SESS_KEY = "hl_admin_session";

  let authMode = "signin";
  let clipFilter = "pending";
  let resFilter = "pending";
  let state = { settings: {}, clips: [], results: [], players: [], signups: [] };

  function esc(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
    }[c]));
  }
  function safeUrl(u){
    const s = String(u || "").trim();
    return /^https:\/\//i.test(s) ? s : "";
  }
  function fmtWhen(iso){
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("lv-LV", {
        timeZone: "Europe/Riga", day:"2-digit", month:"2-digit", year:"numeric",
        hour:"2-digit", minute:"2-digit"
      }).replace(",", "");
    } catch { return String(iso); }
  }
  function formatAuthority(n){
    if (n == null || n === "") return "";
    const v = Math.trunc(Number(n));
    if (!Number.isFinite(v)) return "";
    const unit = (v % 10 === 1 && v % 100 !== 11) ? "gads" : "gadi";
    return v + " " + unit;
  }
  function toast(msg){
    const el = $("#hl-toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 4200);
  }
  function showMsg(el, text, kind){
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || "";
    el.classList.remove("is-ok", "is-err");
    if (kind === "ok") el.classList.add("is-ok");
    if (kind === "err") el.classList.add("is-err");
  }

  function getSession(){
    try { return JSON.parse(localStorage.getItem(SESS_KEY) || "null"); }
    catch { return null; }
  }
  function setSession(sess){
    if (!sess) { localStorage.removeItem(SESS_KEY); return; }
    const nowSec = Math.floor(Date.now() / 1000);
    const expAt = sess.expires_at || (sess.expires_in ? nowSec + Number(sess.expires_in) : nowSec + 3600);
    localStorage.setItem(SESS_KEY, JSON.stringify({
      access_token: sess.access_token,
      refresh_token: sess.refresh_token,
      expires_at: expAt,
      user: sess.user || null
    }));
  }

  function consumeHashTokens(){
    const h = window.location.hash || "";
    if (!h.includes("access_token=")) return false;
    const params = new URLSearchParams(h.slice(1));
    const at = params.get("access_token");
    const rt = params.get("refresh_token");
    const ei = params.get("expires_in");
    if (at){
      setSession({ access_token: at, refresh_token: rt || "", expires_in: Number(ei || 3600) });
      try { history.replaceState(null, "", window.location.pathname + window.location.search); } catch {}
      return true;
    }
    return false;
  }

  async function authReq(path, body, token){
    const headers = { apikey: ANON_KEY, "Content-Type": "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    const res = await fetch(SUPA_URL + "/auth/v1" + path, {
      method: body ? "POST" : "GET",
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    const json = await res.json().catch(() => null);
    if (!res.ok){
      const msg = (json && (json.error_description || json.msg || json.message || json.error)) || ("HTTP " + res.status);
      throw new Error(msg);
    }
    return json;
  }

  async function ensureFreshToken(){
    const s = getSession();
    if (!s || !s.access_token) return null;
    const nowSec = Math.floor(Date.now() / 1000);
    if (s.expires_at && s.expires_at - nowSec < 90 && s.refresh_token){
      try {
        const refreshed = await authReq("/token?grant_type=refresh_token", { refresh_token: s.refresh_token });
        if (refreshed && refreshed.access_token){
          setSession(refreshed);
          return refreshed.access_token;
        }
      } catch {
        setSession(null);
        return null;
      }
    }
    return s.access_token;
  }

  async function adminRpc(fn, body, retry=true){
    const token = await ensureFreshToken();
    if (!token) throw new Error("Sesija nav aktīva. Pieslēdzies vēlreiz.");
    const res = await fetch(SUPA_URL + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        Authorization: "Bearer " + token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body || {})
    });
    if (res.status === 401 && retry){
      const s = getSession();
      if (s && s.refresh_token){
        try {
          const refreshed = await authReq("/token?grant_type=refresh_token", { refresh_token: s.refresh_token });
          if (refreshed && refreshed.access_token){
            setSession(refreshed);
            return adminRpc(fn, body, false);
          }
        } catch {}
      }
      setSession(null);
      await boot();
      throw new Error("Sesija beigusies. Pieslēdzies vēlreiz.");
    }
    const json = await res.json().catch(() => null);
    if (!res.ok){
      const msg = (json && (json.message || json.error || json.hint)) || ("HTTP " + res.status);
      throw new Error(msg);
    }
    return json;
  }

  function setView(mode, info){
    $("#hla-auth-view").hidden = mode !== "auth";
    $("#hla-claim-view").hidden = mode !== "claim";
    $("#hla-dash-view").hidden = mode !== "dash";
    $("#hla-refresh-btn").hidden = mode !== "dash";
    $("#hla-signout-btn").hidden = mode === "auth";
    const pill = $("#hla-user-pill");
    if (pill){
      if (mode === "auth" || !info || !info.email){
        pill.hidden = true;
        pill.textContent = "";
      } else {
        pill.hidden = false;
        pill.textContent = info.email + (info.is_organiser ? " · ORGANISER" : " · PENDING");
      }
    }
  }

  function setAuthMode(mode){
    authMode = mode;
    $$("[data-auth-mode]").forEach(b => b.classList.toggle("is-on", b.getAttribute("data-auth-mode") === mode));
    const passWrap = $("#hla-pass-wrap");
    const passInp = passWrap && passWrap.querySelector("input");
    const nickWrap = $("#hla-nick-wrap");
    const nickInp = nickWrap && nickWrap.querySelector("input");
    const ageWrap = $("#hla-age-wrap");
    const ageInp = ageWrap && ageWrap.querySelector("input");
    const submitBtn = $("#hla-auth-submit");
    const forgotBtn = $("#hla-forgot-btn");
    if (mode === "magic"){
      passWrap.hidden = true; passInp.required = false;
      nickWrap.hidden = true; nickInp.required = false;
      ageWrap.hidden = true; ageWrap.style.display = "none"; ageInp.required = false;
      submitBtn.textContent = "Nosūtīt Magic Link";
      forgotBtn.hidden = true;
    } else if (mode === "signup"){
      passWrap.hidden = false; passInp.required = true; passInp.autocomplete = "new-password";
      nickWrap.hidden = false; nickInp.required = true;
      ageWrap.hidden = false; ageWrap.style.display = "flex"; ageInp.required = true;
      submitBtn.textContent = "Izveidot kontu";
      forgotBtn.hidden = true;
    } else {
      passWrap.hidden = false; passInp.required = true; passInp.autocomplete = "current-password";
      nickWrap.hidden = true; nickInp.required = false;
      ageWrap.hidden = true; ageWrap.style.display = "none"; ageInp.required = false;
      submitBtn.textContent = "Pieslēgties";
      forgotBtn.hidden = false;
    }
    showMsg($("#hla-auth-msg"), "", "");
  }

  function fillStartInputs(iso){
    const f = $("#hla-f-start");
    if (!f) return;
    const raw = String(iso || "2026-11-28T19:00:00+02:00").trim();
    const m = raw.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::\d{2})?([+-]\d{2}:\d{2}|Z)?$/);
    if (m){
      f.elements.local_dt.value = m[1];
      const tz = m[2] === "+03:00" ? "+03:00" : "+02:00";
      f.elements.tz.value = tz;
    } else {
      f.elements.local_dt.value = "2026-11-28T19:00";
      f.elements.tz.value = "+02:00";
    }
  }

  function renderKpis(){
    const clips = state.clips || [];
    const results = state.results || [];
    const players = state.players || [];
    const signups = state.signups || [];
    const pendingClips = clips.filter(c => c.status === "pending").length;
    const unverifiedRes = results.filter(r => !r.verified).length;
    const activePlayers = players.filter(p => p.is_active).length;
    const maxCap = (state.settings && state.settings.max_participants) || 32;
    $("#hla-kpis").innerHTML = `
      <div class="hla-kpi ${pendingClips ? "is-alert" : ""}">
        <p class="hla-kpi-k">Klipi gaida apstiprinājumu</p>
        <p class="hla-kpi-v">${pendingClips}</p>
      </div>
      <div class="hla-kpi ${unverifiedRes ? "is-alert" : ""}">
        <p class="hla-kpi-k">Rezultāti gaida pārbaudi</p>
        <p class="hla-kpi-v">${unverifiedRes}</p>
      </div>
      <div class="hla-kpi">
        <p class="hla-kpi-k">Aktīvie spēlētāji</p>
        <p class="hla-kpi-v">${activePlayers} <small style="font-size:14px;color:var(--ink-2)">/ ${players.length}</small></p>
      </div>
      <div class="hla-kpi">
        <p class="hla-kpi-k">Turnīra pieteikumi</p>
        <p class="hla-kpi-v">${signups.length} <small style="font-size:14px;color:var(--ink-2)">/ ${maxCap}</small></p>
      </div>`;
  }

  function renderSettings(){
    const s = state.settings || {};
    $("#hla-f-current-server").elements.server.value = s.current_server || "";
    $("#hla-f-tourney-server").elements.server.value = s.tournament_server || "";
    fillStartInputs(s.tournament_start_iso);
    const pf = $("#hla-f-prize");
    pf.elements.prize.value = s.tournament_prize || "";
    pf.elements.note.value = s.tournament_prize_note || "";
    $("#hla-f-cap").elements.max.value = s.max_participants || 32;
    const tf = $("#hla-f-ttl");
    tf.elements.active_hours.value = s.active_hours || 8;
    tf.elements.expire_days.value = s.expire_days || 7;
  }

  function renderClips(){
    const wrap = $("#hla-clips-wrap");
    const all = state.clips || [];
    const list = clipFilter === "all" ? all : all.filter(c => c.status === clipFilter);
    if (!list.length){
      wrap.innerHTML = `<p class="hla-empty">Nav klipu šajā filtrā (${esc(clipFilter)}).</p>`;
      return;
    }
    wrap.innerHTML = `<table class="hla-table">
      <thead><tr>
        <th>Statuss</th><th>Virsraksts</th><th>Segvārds</th><th>Hosts</th><th>Saite</th><th>Iesniegts</th><th>Darbības</th>
      </tr></thead>
      <tbody>${list.map(c => {
        const badge = c.status === "approved"
          ? `<span class="hla-badge ok">Apstiprināts</span>`
          : c.status === "hidden"
            ? `<span class="hla-badge hide">Paslēpts</span>`
            : `<span class="hla-badge wait">Gaida</span>`;
        const href = safeUrl(c.video_url);
        const link = href ? `<a class="hla-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(href)}</a>` : "—";
        return `<tr data-clip-id="${esc(c.id)}">
          <td>${badge}</td>
          <td><b>${esc(c.title)}</b></td>
          <td>${esc(c.nickname)}</td>
          <td>${esc(c.host)}</td>
          <td>${link}</td>
          <td>${esc(fmtWhen(c.created_at))}</td>
          <td><div class="hla-actions">
            ${c.status !== "approved" ? `<button type="button" class="hla-mini is-ok" data-clip-act="approved">Apstiprināt</button>` : ""}
            ${c.status !== "hidden" ? `<button type="button" class="hla-mini is-warn" data-clip-act="hidden">Noraidīt / Slēpt</button>` : ""}
            ${c.status !== "pending" ? `<button type="button" class="hla-mini" data-clip-act="pending">Uz gaida</button>` : ""}
            <button type="button" class="hla-mini is-del" data-clip-del="1">Dzēst</button>
          </div></td>
        </tr>`;
      }).join("")}</tbody>
    </table>`;
  }

  function renderResults(){
    const wrap = $("#hla-results-wrap");
    const all = state.results || [];
    const list = resFilter === "pending" ? all.filter(r => !r.verified)
      : resFilter === "verified" ? all.filter(r => !!r.verified)
      : all;
    if (!list.length){
      wrap.innerHTML = `<p class="hla-empty">Nav rezultātu šajā filtrā (${esc(resFilter)}).</p>`;
      return;
    }
    wrap.innerHTML = `<table class="hla-table">
      <thead><tr>
        <th>Statuss</th><th>Spēlētājs</th><th class="r">Turnīra Authority</th><th>Video</th><th>Iesniegts</th><th>Darbības</th>
      </tr></thead>
      <tbody>${list.map(r => {
        const badge = r.verified
          ? `<span class="hla-badge ok">Pārbaudīts</span>`
          : `<span class="hla-badge wait">Gaida</span>`;
        const href = safeUrl(r.video_url);
        const link = href ? `<a class="hla-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer">Video ↗</a>` : "—";
        return `<tr data-res-id="${esc(r.id)}">
          <td>${badge}</td>
          <td><b>${esc(r.nickname)}</b></td>
          <td class="r"><b>${r.authority == null || r.authority === "" ? "—" : esc(r.authority)}</b></td>
          <td>${link}</td>
          <td>${esc(fmtWhen(r.created_at))}</td>
          <td><div class="hla-actions">
            ${r.verified
              ? `<button type="button" class="hla-mini is-warn" data-res-verify="false">Noņemt pārbaudi</button>`
              : `<button type="button" class="hla-mini is-ok" data-res-verify="true">Apstiprināt</button>`}
            <button type="button" class="hla-mini is-del" data-res-del="1">Dzēst</button>
          </div></td>
        </tr>`;
      }).join("")}</tbody>
    </table>`;
  }

  function renderPlayers(){
    const wrap = $("#hla-players-wrap");
    const list = state.players || [];
    if (!list.length){
      wrap.innerHTML = `<p class="hla-empty">Aktīvo spēlētāju saraksts ir tukšs.</p>`;
      return;
    }
    wrap.innerHTML = `<table class="hla-table">
      <thead><tr>
        <th>Statuss</th><th>Segvārds</th><th>Serveris</th><th>Atjaunots</th><th>Darbības</th>
      </tr></thead>
      <tbody>${list.map(p => {
        const badge = p.is_active
          ? `<span class="hla-badge ok">Aktīvs</span>`
          : `<span class="hla-badge hide">Neaktīvs</span>`;
        return `<tr data-player-id="${esc(p.id)}">
          <td>${badge}</td>
          <td><b>${esc(p.nickname)}</b></td>
          <td>${esc(p.server_name)}</td>
          <td>${esc(fmtWhen(p.last_renewed_at || p.created_at))}</td>
          <td><button type="button" class="hla-mini is-del" data-player-del="1">Dzēst</button></td>
        </tr>`;
      }).join("")}</tbody>
    </table>`;
  }

  function renderSignups(){
    const wrap = $("#hla-signups-wrap");
    const list = state.signups || [];
    if (!list.length){
      wrap.innerHTML = `<p class="hla-empty">Nav neviena pieteikuma.</p>`;
      return;
    }
    wrap.innerHTML = `<table class="hla-table">
      <thead><tr>
        <th>#</th><th>Spēlētājs</th><th class="r">Spēles Authority (gadi)</th><th>Lenny parāds</th><th>Discord</th><th>E-pasts</th><th>Pieteicies</th><th>Darbības</th>
      </tr></thead>
      <tbody>${list.map((s, i) => `
        <tr data-signup-id="${esc(s.id)}">
          <td>${i + 1}</td>
          <td><b>${esc(s.nickname)}</b></td>
          <td class="r">${s.authority == null || s.authority === "" ? "—" : esc(formatAuthority(s.authority))}</td>
          <td>${s.lenny_paid === true ? "Jā" : s.lenny_paid === false ? "Nē" : "—"}</td>
          <td>${esc(s.discord || "—")}</td>
          <td>${esc(s.email || "—")}</td>
          <td>${esc(fmtWhen(s.created_at))}</td>
          <td><button type="button" class="hla-mini is-del" data-signup-del="1">Dzēst</button></td>
        </tr>`).join("")}</tbody>
    </table>`;
  }

  function renderAll(){
    renderKpis();
    renderSettings();
    renderClips();
    renderResults();
    renderPlayers();
    renderSignups();
  }

  async function loadOverview(){
    const data = await adminRpc("hl_admin_overview", {});
    state = data || { settings: {}, clips: [], results: [], players: [], signups: [] };
    renderAll();
  }

  async function boot(){
    consumeHashTokens();
    const token = await ensureFreshToken();
    if (!token){
      setView("auth");
      return;
    }
    try {
      const who = await adminRpc("hl_admin_whoami", {});
      if (!who || !who.authenticated){
        setSession(null);
        setView("auth");
        return;
      }
      if (!who.is_organiser){
        setView("claim", who);
        $("#hla-claim-email").textContent = who.email || "—";
        $("#hla-claim-uid").textContent = who.user_id || "—";
        $("#hla-claim-sql").textContent = `SELECT hl.grant_organiser('${who.user_id}');`;
        return;
      }
      setView("dash", who);
      await loadOverview();
    } catch (err) {
      toast(err.message || "Neizdevās pārbaudīt sesiju.");
      setView("auth");
    }
  }

  // Auth handlers
  $$("[data-auth-mode]").forEach(btn => {
    btn.addEventListener("click", () => setAuthMode(btn.getAttribute("data-auth-mode")));
  });

  $("#hla-auth-form").addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");
    const msg = $("#hla-auth-msg");
    showMsg(msg, "", "");
    try {
      const redirectTo = window.location.origin + window.location.pathname;
      if (authMode === "magic"){
        await authReq("/otp", { email, create_user: false, options: { email_redirect_to: redirectTo } });
        showMsg(msg, "Magic Link nosūtīts uz " + email + " (esošam kontam). Atver saiti e-pastā.", "ok");
        return;
      }
      if (authMode === "signup"){
        const nick = String(fd.get("nick") || "").trim();
        const age18 = fd.get("age18") === "on";
        if (!age18){ showMsg(msg, "Nepieciešams 18+ apstiprinājums.", "err"); return; }
        const out = await authReq("/signup", { email, password, data: { nick, age18: true }, options: { email_redirect_to: redirectTo } });
        if (out && out.access_token){
          setSession(out);
          await boot();
          return;
        }
        showMsg(msg, "Konts izveidots! Apstiprini e-pastu (" + email + ") un pēc tam pieslēdzies.", "ok");
        return;
      }
      const out = await authReq("/token?grant_type=password", { email, password });
      setSession(out);
      await boot();
    } catch (err) {
      showMsg(msg, err.message || "Pieslēgšanās neizdevās.", "err");
    }
  });

  $("#hla-forgot-btn").addEventListener("click", async () => {
    const email = String($("#hla-auth-form").elements.email.value || "").trim();
    const msg = $("#hla-auth-msg");
    if (!email){
      showMsg(msg, "Vispirms ievadi savu e-pastu.", "err");
      return;
    }
    try {
      await authReq("/recover", { email, redirect_to: window.location.origin + window.location.pathname });
      showMsg(msg, "Paroles atjaunošanas saite nosūtīta uz " + email + ".", "ok");
    } catch (err) {
      showMsg(msg, err.message || "Neizdevās nosūtīt.", "err");
    }
  });

  $("#hla-recheck-btn").addEventListener("click", () => boot());
  $("#hla-copy-sql-btn").addEventListener("click", async () => {
    const sql = $("#hla-claim-sql").textContent || "";
    try {
      await navigator.clipboard.writeText(sql);
      showMsg($("#hla-claim-msg"), "SQL nokopēts starpliktuvē.", "ok");
    } catch {
      showMsg($("#hla-claim-msg"), sql, "ok");
    }
  });

  $("#hla-refresh-btn").addEventListener("click", async () => {
    try { await loadOverview(); toast("Dati atjaunoti."); }
    catch (err) { toast(err.message); }
  });

  $("#hla-signout-btn").addEventListener("click", async () => {
    const token = await ensureFreshToken();
    if (token){
      try { await authReq("/logout", {}, token); } catch {}
    }
    setSession(null);
    await boot();
  });

  // Settings handlers
  $("#hla-f-current-server").addEventListener("submit", async e => {
    e.preventDefault();
    const s = e.target.elements.server.value.trim();
    try {
      await adminRpc("hl_admin_set_current_server", { p_server: s });
      toast("Pašreizējais serveris saglabāts.");
      await loadOverview();
    } catch (err) { toast(err.message); }
  });

  $("#hla-f-tourney-server").addEventListener("submit", async e => {
    e.preventDefault();
    const s = e.target.elements.server.value.trim();
    try {
      await adminRpc("hl_admin_set_tournament_server", { p_server: s });
      toast("Turnīra serveris saglabāts.");
      await loadOverview();
    } catch (err) { toast(err.message); }
  });

  $("#hla-f-start").addEventListener("submit", async e => {
    e.preventDefault();
    const dt = e.target.elements.local_dt.value;
    const tz = e.target.elements.tz.value || "+02:00";
    if (!dt) return;
    const iso = dt.length === 16 ? `${dt}:00${tz}` : `${dt}${tz}`;
    try {
      await adminRpc("hl_admin_set_tournament_start", { p_iso: iso });
      toast("Turnīra sākuma laiks saglabāts.");
      await loadOverview();
    } catch (err) { toast(err.message); }
  });

  $("#hla-f-prize").addEventListener("submit", async e => {
    e.preventDefault();
    const prize = e.target.elements.prize.value.trim();
    const note = e.target.elements.note.value.trim();
    try {
      await adminRpc("hl_admin_set_tournament_prize", { p_prize: prize, p_note: note });
      toast("Balvas teksts saglabāts.");
      await loadOverview();
    } catch (err) { toast(err.message); }
  });

  $("#hla-f-cap").addEventListener("submit", async e => {
    e.preventDefault();
    const max = Number(e.target.elements.max.value);
    try {
      await adminRpc("hl_admin_set_max_participants", { p_max: max });
      toast("Vietu limits saglabāts.");
      await loadOverview();
    } catch (err) { toast(err.message); }
  });

  $("#hla-f-ttl").addEventListener("submit", async e => {
    e.preventDefault();
    const ah = Number(e.target.elements.active_hours.value);
    const ed = Number(e.target.elements.expire_days.value);
    try {
      await adminRpc("hl_admin_set_ttl", { p_active_hours: ah, p_expire_days: ed });
      toast("TTL saglabāts.");
      await loadOverview();
    } catch (err) { toast(err.message); }
  });

  // Filter tabs
  $("#hla-clip-tabs").addEventListener("click", e => {
    const b = e.target.closest("[data-filter]");
    if (!b) return;
    clipFilter = b.getAttribute("data-filter");
    $$("#hla-clip-tabs .hla-tab").forEach(x => x.classList.toggle("is-on", x === b));
    renderClips();
  });
  $("#hla-res-tabs").addEventListener("click", e => {
    const b = e.target.closest("[data-filter]");
    if (!b) return;
    resFilter = b.getAttribute("data-filter");
    $$("#hla-res-tabs .hla-tab").forEach(x => x.classList.toggle("is-on", x === b));
    renderResults();
  });

  // Table action delegation
  $("#hla-clips-wrap").addEventListener("click", async e => {
    const row = e.target.closest("tr[data-clip-id]");
    if (!row) return;
    const id = row.getAttribute("data-clip-id");
    const act = e.target.getAttribute("data-clip-act");
    const del = e.target.getAttribute("data-clip-del");
    try {
      if (act){
        await adminRpc("hl_admin_set_clip_status", { p_id: id, p_status: act });
        toast("Klipa statuss atjaunots: " + act);
        await loadOverview();
      } else if (del){
        if (!window.confirm("Neatgriezeniski dzēst šo klipu?")) return;
        await adminRpc("hl_admin_delete_clip", { p_id: id });
        toast("Klips dzēsts.");
        await loadOverview();
      }
    } catch (err) { toast(err.message); }
  });

  $("#hla-results-wrap").addEventListener("click", async e => {
    const row = e.target.closest("tr[data-res-id]");
    if (!row) return;
    const id = row.getAttribute("data-res-id");
    const ver = e.target.getAttribute("data-res-verify");
    const del = e.target.getAttribute("data-res-del");
    try {
      if (ver !== null){
        await adminRpc("hl_admin_set_result_verified", { p_id: id, p_verified: ver === "true" });
        toast(ver === "true" ? "Rezultāts apstiprināts." : "Pārbaude noņemta.");
        await loadOverview();
      } else if (del){
        if (!window.confirm("Neatgriezeniski dzēst šo rezultātu?")) return;
        await adminRpc("hl_admin_delete_result", { p_id: id });
        toast("Rezultāts dzēsts.");
        await loadOverview();
      }
    } catch (err) { toast(err.message); }
  });

  $("#hla-players-wrap").addEventListener("click", async e => {
    const row = e.target.closest("tr[data-player-id]");
    if (!row || !e.target.getAttribute("data-player-del")) return;
    const id = row.getAttribute("data-player-id");
    if (!window.confirm("Dzēst šo spēlētāja ierakstu?")) return;
    try {
      await adminRpc("hl_admin_delete_player", { p_id: id });
      toast("Spēlētāja ieraksts dzēsts.");
      await loadOverview();
    } catch (err) { toast(err.message); }
  });

  $("#hla-signups-wrap").addEventListener("click", async e => {
    const row = e.target.closest("tr[data-signup-id]");
    if (!row || !e.target.getAttribute("data-signup-del")) return;
    const id = row.getAttribute("data-signup-id");
    if (!window.confirm("Dzēst šo turnīra pieteikumu?")) return;
    try {
      await adminRpc("hl_admin_delete_signup", { p_id: id });
      toast("Pieteikums dzēsts.");
      await loadOverview();
    } catch (err) { toast(err.message); }
  });

  $("#hla-export-signups").addEventListener("click", () => {
    const list = state.signups || [];
    const csvCell = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const rows = [["nickname","authority","lenny_paid","discord","email","created_at"]]
      .concat(list.map(s => [s.nickname, s.authority == null ? "" : s.authority, s.lenny_paid == null ? "" : (s.lenny_paid ? "yes" : "no"), s.discord || "", s.email || "", s.created_at]));
    const blob = new Blob([rows.map(r => r.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "heist-liga-signups.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  setAuthMode("signin");
  boot();
})();
