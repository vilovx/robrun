(function(){
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const data = window.HL;
  let board = [];
  let signed = data.signedExample || 0;
  const t = (k, v) => window.t ? window.t(k, v) : k;
  const rpcErr = (msg, fb) => window.rpcErr ? window.rpcErr(msg, fb) : (msg || fb);
  const fmtAuth = (n) => window.formatAuthority ? window.formatAuthority(n) : String(n);
  const authUnit = (n) => window.authorityUnit ? window.authorityUnit(n) : "";


  function pad(n){ return String(n).padStart(2,"0"); }


  let currentServerRaw = "";
  function isTbaServer(v){
    const s = String(v || "").trim();
    if (!s) return true;
    const n = s.toLowerCase();
    return n === "tiks paziņots" || n === "to be announced" || n === "будет объявлен" || n === "будет объявлено";
  }
  function displayServer(raw){
    return isTbaServer(raw) ? t("server_tba") : String(raw).trim();
  }

  function tick(){
    const end = new Date(data.eventISO).getTime();
    const now = Date.now();
    let d = Math.max(0, end - now);
    const done = d === 0;
    const days = Math.floor(d / 86400000); d -= days*86400000;
    const hrs  = Math.floor(d / 3600000);  d -= hrs*3600000;
    const min  = Math.floor(d / 60000);    d -= min*60000;
    const sec  = Math.floor(d / 1000);
    $("#hl-d").textContent = pad(days);
    $("#hl-h").textContent = pad(hrs);
    $("#hl-m").textContent = pad(min);
    $("#hl-s").textContent = pad(sec);
    const count = $("#hl-countdown");
    if (done) count.setAttribute("data-live","starts");
  }

  function toast(msg){
    const el = $("#hl-toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 4200);
  }

  function videoCell(p){
    const href = (p.video || "").trim();
    if (href && /^https:\/\//i.test(href)) {
      return `<a class="hl-vid" href="${esc(href)}" target="_blank" rel="noopener">${t("video")}</a>`;
    }
    return p.example ? `<span class="hl-mute">${t("badge_example")}</span>` : "—";
  }
  function renderBoard(){
    const rows = $("#hl-rows");
    const sorted = board.slice().sort((a,b) => b.auth - a.auth || String(a.when).localeCompare(String(b.when), "lv"));
    const countEl = $("#hl-board-count");
    if (countEl) countEl.textContent = t("results_n", { n: sorted.length });
    if (!sorted.length){
      rows.innerHTML = `<tr class="hl-empty-row"><td colspan="6">${esc(t("board_empty"))}</td></tr>`;
      return;
    }
    rows.innerHTML = sorted.map((p,i) => {
      const top = i===0 ? "top1" : i===1 ? "top2" : i===2 ? "top3" : "";
      const st = p.example
        ? `<span class="hl-badge wait">${t("badge_example")}</span>`
        : p.verified
          ? `<span class="hl-badge ok">${t("badge_verified")}</span>`
          : `<span class="hl-badge wait">${t("badge_wait")}</span>`;
      const fresh = p.fresh ? " fresh" : "";
      return `<tr class="${top}${fresh}${p.example ? " is-example" : ""}">
        <td class="hl-rank">${i+1}</td>
        <td class="c-nick"><span class="hl-nick">${esc(p.nick)}</span></td>
        <td class="c-auth r"><span class="hl-auth">${esc(String(p.auth))}</span></td>
        <td class="c-when">${esc(p.when)}</td>
        <td class="c-vid">${videoCell(p)}</td>
        <td class="c-st">${st}</td>
      </tr>`;
    }).join("");
  }

  function formatWinnerDate(iso){
    if (!iso) return "";
    const d = new Date(iso + "T12:00:00+02:00");
    const month = t("month_" + String(d.getMonth()+1).padStart(2,"0"));
    return t("winner_date", { d: d.getDate(), month, y: d.getFullYear() });
  }
  function renderWinners(){
    const list = Array.isArray(data.winners) ? data.winners : [];
    if (!list.length){
      $("#hl-winners").innerHTML = `<p class="hl-empty">${esc(t("winners_empty"))}</p>`;
      return;
    }
    $("#hl-winners").innerHTML = list.map((w,i) => `
      <article class="hl-case">
        <header class="hl-case-tab">${t("case", { n: String(i+1).padStart(2,"0") })}</header>
        <div class="hl-case-body">
          <div class="hl-mugshot" aria-hidden="true">
            ${mugSvg()}
            <span class="hl-mug-label">${t("no_image")}</span>
          </div>
          <div class="hl-case-info">
            <p class="hl-case-date">${esc(formatWinnerDate(w.dateISO) || w.date || "")}</p>
            <h3>${esc(w.nick)}</h3>
            <p class="hl-auth">${esc(String(w.auth))}</p>
            <p class="hl-small">${esc(t("winner_note"))}</p>
            <span class="hl-badge ok">${t("badge_verified")}</span>
          </div>
        </div>
      </article>`).join("");
  }

  function mugSvg(){
    return `<svg viewBox="0 0 80 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="80" height="96" fill="#161a17"/>
      <circle cx="40" cy="36" r="16" stroke="#b6ff3b" stroke-width="1.6"/>
      <path d="M18 92c4-22 14-32 22-32s18 10 22 32" stroke="#b6ff3b" stroke-width="1.6"/>
      <path d="M28 34h24" stroke="#b6ff3b" stroke-width="2.2" stroke-linecap="round"/>
    </svg>`;
  }

  function esc(s){
    return String(s).replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
    }[c]));
  }

  async function postJSON(url, payload){
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("send-failed");
  }

  let maxSeats = data.maxParticipants || 32;
  function seatsFull(){ return signed >= maxSeats; }
  function renderSeats(){
    const full = seatsFull();
    // Public page never shows a participant cap or X/N seat counter.
    ["hl-seats-hero","hl-seats-form"].forEach(id => {
      const el = document.getElementById(id);
      if (el){ el.innerHTML = ""; el.hidden = true; }
    });
    const note = $("#hl-signed-note");
    if (note) note.textContent = "";
    // Cap is hidden and applies only to new nicknames; existing nicks can still update Authority.
    const btn = $("#hl-signup-btn");
    if (btn){
      btn.disabled = false;
      btn.textContent = t("btn_signup_save");
    }
    const cta = $("#hl-cta-signup");
    if (cta){
      cta.classList.remove("is-disabled");
      cta.textContent = t("btn_signup");
    }
    const form = $("#hl-signup");
    if (form){
      [...form.querySelectorAll("input,button[type=submit]")].forEach(i => { i.disabled = false; });
    }
  }

  let lastSignupList = [];
  function renderSignupList(list){
    if (Array.isArray(list)) lastSignupList = list;
    const el = $("#hl-signup-list");
    if (!el) return;
    const rows = Array.isArray(list) ? list : [];
    if (!rows.length){
      el.innerHTML = `<li class="hl-signup-empty">${esc(t("signup_list_empty"))}</li>`;
      return;
    }
    el.innerHTML = rows.map(s => {
      const nick = esc(s.nickname || "");
      const auth = s.authority;
      const authOk = typeof auth === "number" && Number.isFinite(auth);
      return `<li>${nick}${authOk ? ` · ${esc(fmtAuth(auth))}` : ""}</li>`;
    }).join("");
  }

  async function loadSeats(){
    try {
      const st = await hlRpc("hl_signup_state", {});
      if (st && typeof st.count === "number") signed = st.count;
      if (st && typeof st.max === "number") maxSeats = st.max;
      if (st && Array.isArray(st.signups)) renderSignupList(st.signups);
      renderSeats();
      updateTownMeta();
      return st;
    } catch (err) {
      renderSeats();
      return null;
    }
  }

  $("#hl-signup").addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const nick = (fd.get("nick")||"").trim();
    if (!nick) return;
    const authRaw = String(fd.get("authority") || "").trim();
    if (!/^\d+$/.test(authRaw)){ toast(t("signup_auth_invalid")); return; }
    const authority = Number(authRaw);
    if (!Number.isInteger(authority) || authority < 0 || authority > 99999){
      toast(t("signup_auth_invalid")); return;
    }
    try {
      const out = await hlRpc("hl_signup_add", {
        p_nickname: nick,
        p_authority: authority
      });
      if (!out || out.ok === false){
        toast(rpcErr(out && out.error, "signup_fail"));
        if (out && typeof out.count === "number"){
          signed = out.count;
          if (typeof out.max === "number") maxSeats = out.max;
          renderSeats();
        }
        return;
      }
      signed = typeof out.count === "number" ? out.count : signed;
      if (typeof out.max === "number") maxSeats = out.max;
      renderSeats();
      e.target.reset();
      toast(out.updated ? t("signup_updated") : t("signup_ok"));
      loadSeats();
    } catch (err) {
      toast(err.message || t("signup_fail_retry"));
    }
  });

  const RESULT_KEY = "hl_result";
  function resultMine(v){
    if (arguments.length) {
      if (v) localStorage.setItem(RESULT_KEY, JSON.stringify(v));
      else localStorage.removeItem(RESULT_KEY);
    }
    try { return JSON.parse(localStorage.getItem(RESULT_KEY) || "null"); }
    catch { return null; }
  }
  function liveToRow(r){
    return {
      id: r.id,
      nick: r.nickname,
      auth: r.authority,
      when: fmtWhen(r.created_at),
      video: r.video_url,
      verified: !!r.verified,
      live: true
    };
  }
  function mergeBoard(liveRows){
    board = (liveRows || []).map(liveToRow);
    renderBoard();
  }
  async function loadBoard(){
    try {
      const list = await hlRpc("hl_result_list", {});
      mergeBoard(Array.isArray(list) ? list : []);
    } catch (err) {
      board = [];
      renderBoard();
    }
  }

  $("#hl-submit").addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const nick = (fd.get("nick")||"").trim();
    const auth = Number(fd.get("auth"));
    const video = (fd.get("video")||"").trim();
    if (!nick || !auth || !video) return;
    const mine = resultMine();
    try {
      let out;
      if (mine && mine.id && mine.token){
        out = await hlRpc("hl_result_update", {
          p_id: mine.id,
          p_token: mine.token,
          p_authority: auth,
          p_video: video
        });
      } else {
        out = await hlRpc("hl_result_add", {
          p_nickname: nick,
          p_authority: auth,
          p_video: video
        });
      }
      if (!out || out.ok === false){
        toast(rpcErr(out && out.error, "result_fail"));
        return;
      }
      if (out.token && out.result){
        resultMine({ id: out.result.id, token: out.token, nickname: out.result.nickname });
      }
      await loadBoard();
      e.target.reset();
      toast(mine ? t("result_updated") : t("result_sent"));
      $("#tabula").scrollIntoView({behavior:"smooth", block:"start"});
    } catch (err) {
      toast(err.message || t("result_fail_retry"));
    }
  });


  /* ---- Presence: Kur spēlējam / Es spēlēju ---- */
  const PRESENCE_KEY = "hl_presence";
  function presenceMine(v){
    if (arguments.length) {
      if (v) localStorage.setItem(PRESENCE_KEY, JSON.stringify(v));
      else localStorage.removeItem(PRESENCE_KEY);
    }
    try { return JSON.parse(localStorage.getItem(PRESENCE_KEY) || "null"); }
    catch { return null; }
  }
  async function hlRpc(name, body){
    const url = data.api && data.api.url;
    const key = data.api && data.api.anonKey;
    if (!url || !key) throw new Error("API nav konfigurēts.");
    const res = await fetch(url + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: "Bearer " + key,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body || {})
    });
    const json = await res.json().catch(() => null);
    if (!res.ok){
      const msg = rpcErr((json && (json.message || json.error)), "err_connect");
      throw new Error(msg);
    }
    return json;
  }
  function fmtWhen(iso){
    if (!iso) return "";
    return new Date(iso).toLocaleString(window.hlLocale ? window.hlLocale() : "lv-LV", {
      timeZone:"Europe/Riga", day:"2-digit", month:"2-digit",
      hour:"2-digit", minute:"2-digit"
    }).replace(",", "");
  }
  function renderPresence(state){
    if (!state) return;
    currentServerRaw = isTbaServer(state.current_server) ? "" : String(state.current_server || "").trim();
    const srv = displayServer(currentServerRaw);
    const box = $("#hl-now-server");
    if (box){ box.textContent = srv; box.classList.toggle("is-tba", !currentServerRaw); }
    const inp = $("#hl-play-server");
    const nickInp = $("#hl-play") && $("#hl-play").elements.namedItem("nick");
    const mine = presenceMine();
    if (inp && (!inp.value || mine)) inp.value = (mine && mine.server) || currentServerRaw;
    if (nickInp && mine && mine.nickname && !nickInp.value) nickInp.value = mine.nickname;
    const joinBtn = $("#hl-play") && $("#hl-play").querySelector("button[type=submit]");
    if (joinBtn) joinBtn.textContent = mine ? t("btn_edit_entry") : t("i_play");
    const list = $("#hl-play-list");
    const players = Array.isArray(state.players) ? state.players : [];
    if (list){
      if (!players.length){
        list.innerHTML = `<li class="hl-play-empty">${t("empty_players")}</li>`;
      } else {
        list.innerHTML = players.map(p => {
          const mineRow = mine && mine.id === p.id;
          const cls = p.is_active ? "is-active" : "is-inactive";
          const badge = p.is_active ? "" : `<span class="hl-badge wait">${t("badge_inactive")}</span>`;
          const you = mineRow ? `<span class="hl-you">${t("you")}</span>` : "";
          return `<li class="hl-play-card ${cls}">
            <div class="hl-play-main">
              <b class="hl-nick">${esc(p.nickname)}</b> ${you}
              <span class="hl-play-srv">${esc(p.server_name || "")}</span>
            </div>
            <div class="hl-play-meta">
              <time>${esc(fmtWhen(p.last_renewed_at || p.created_at))}</time>
              ${badge}
            </div>
          </li>`;
        }).join("");
      }
    }
    const tools = $("#hl-play-mine");
    if (tools) tools.hidden = !(mine && players.some(p => p.id === mine.id));
  }
  async function loadPresence(){
    try {
      const state = await hlRpc("hl_public_state", {});
      renderPresence(state);
      townMeta.server = displayServer(currentServerRaw);
      const players = Array.isArray(state.players) ? state.players : [];
      const active = players.filter(p => p.is_active);
      townMeta.active = active.length;
      townMeta.listed = players.length;
      const recency = p => new Date(p.last_renewed_at || p.created_at || 0).getTime();
      const newest = active.slice().sort((a,b) => recency(b) - recency(a))[0];
      townMeta.latest = newest && newest.nickname ? newest.nickname : "";
      updateTownMeta();
      return state;
    } catch (err) {
      const list = $("#hl-play-list");
      if (list) list.innerHTML = `<li class="hl-play-empty">${t("list_fail")}</li>`;
      return null;
    }
  }
  async function initPresence(){
    if (!$("#hl-play")) return;
    await loadPresence();
    const form = $("#hl-play");
    const msg = $("#hl-play-msg");
    function showMsg(text, ok){
      if (!msg) return;
      msg.hidden = false;
      msg.textContent = text;
      msg.classList.toggle("is-ok", !!ok);
    }
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const fd = new FormData(form);
      const nick = (fd.get("nick")||"").trim();
      const server = (fd.get("server")||"").trim();
      const mine = presenceMine();
      try {
        let out;
        if (mine && mine.id && mine.token){
          out = await hlRpc("hl_player_update", {
            p_id: mine.id,
            p_token: mine.token,
            p_nickname: nick,
            p_server: server
          });
        } else {
          out = await hlRpc("hl_player_join", {
            p_nickname: nick,
            p_server: server
          });
        }
        if (!out || out.ok === false){
          showMsg(rpcErr(out && out.error, "err_save"), false);
          return;
        }
        const player = out.player || {};
        presenceMine({
          id: player.id || (mine && mine.id),
          token: out.token || (mine && mine.token),
          nickname: player.nickname || nick,
          server: player.server_name || server
        });
        showMsg(mine ? "Ieraksts labots." : "Tu esi sarakstā. Pēc 8 h atjauno, ja vēl spēlē.", true);
        await loadPresence();
      } catch (err) {
        showMsg(rpcErr(err.message, "err_save"), false);
      }
    });
    $("#hl-play-renew").addEventListener("click", async () => {
      const mine = presenceMine();
      if (!mine) return;
      try {
        const out = await hlRpc("hl_player_renew", { p_id: mine.id, p_token: mine.token });
        if (!out || out.ok === false){ toast(rpcErr(out && out.error, "err_renew")); return; }
        toast("Ieraksts atjaunots.");
        await loadPresence();
      } catch (err) { toast(err.message); }
    });
    $("#hl-play-leave").addEventListener("click", async () => {
      const mine = presenceMine();
      if (!mine) return;
      try {
        const out = await hlRpc("hl_player_delete", { p_id: mine.id, p_token: mine.token });
        if (!out || out.ok === false){ toast(rpcErr(out && out.error, "err_remove")); return; }
        presenceMine(null);
        toast("Tu esi noņemts no saraksta.");
        await loadPresence();
      } catch (err) { toast(err.message); }
    });
  }



  const townMeta = {
    server: t("server_tba"),
    tourneyServer: t("server_tba"),
    active: 0,
    listed: 0,
    latest: "",
    clips: 0
  };
  const isCoarse = () => window.matchMedia("(hover: none), (max-width: 800px)").matches;

  function activeCountLabel(){
    const n = townMeta.active;
    return n === 1 ? t("active_one") : t("active_many", { n });
  }
  function clipsCountLabel(){
    const n = townMeta.clips;
    if (n === 0) return t("card_clips_none");
    return n === 1 ? t("card_clips_one") : t("card_clips_many", { n });
  }
  function townCardHtml(spot){
    const closeBtn = `<button type="button" class="hl-card-close" aria-label="${esc(t("close_card"))}">&times;</button>`;
    return closeBtn + townCardBody(spot);
  }
  function townCardBody(spot){
    if (spot === "bank"){
      return `<p class="hl-card-kicker">${t("card_bank_kicker")}</p>
        <h3>${t("card_bank_title")}</h3>
        <p class="hl-card-meta"><b>${t("card_time")}</b> ${esc(formatEventDate())} ${t("riga_time")}</p>
        <p class="hl-card-meta"><b>${t("card_tourney_server")}</b> ${esc(townMeta.tourneyServer)}</p>
        <div class="hl-card-actions">
          <a class="hl-btn" href="#pieteikties">${t("btn_signup")}</a>
          <a class="hl-btn hl-btn-ghost" href="#tabula">${t("btn_board")}</a>
        </div>`;
    }
    if (spot === "pd"){
      const latest = townMeta.latest
        ? ` · ${esc(t("card_latest", { nick: townMeta.latest }))}`
        : "";
      const w = data.winners && data.winners[0];
      const win = w
        ? `<p class="hl-card-meta">${esc(t("card_last_winner", { nick: w.nick, auth: w.auth }))}</p>`
        : `<p class="hl-card-meta">${esc(t("winners_empty"))}</p>`;
      return `<p class="hl-card-kicker">${t("card_pd_kicker")}</p>
        <h3>${t("card_pd_title")}</h3>
        <p class="hl-card-meta">${esc(activeCountLabel())}${latest}</p>
        ${win}
        <div class="hl-card-actions">
          <a class="hl-btn" href="#spelejam">${t("btn_list")}</a>
          <a class="hl-btn hl-btn-ghost" href="#tabula">${t("btn_board")}</a>
          <a class="hl-btn hl-btn-ghost" href="#uzvaretaji">${t("btn_winners")}</a>
        </div>`;
    }
    if (spot === "tower"){
      return `<p class="hl-card-kicker">${t("card_tower_kicker")}</p>
        <h3>${t("card_tower_title")}</h3>
        <p class="hl-card-meta"><b>${t("current_server")}</b> ${esc(townMeta.server)}</p>
        <p class="hl-card-meta">${esc(activeCountLabel())}</p>
        <div class="hl-card-actions">
          <a class="hl-btn" href="#spelejam">${t("btn_play_now")}</a>
        </div>`;
    }
    return `<p class="hl-card-kicker">${t("card_cine_kicker")}</p>
      <h3>${t("card_cine_title")}</h3>
      <p class="hl-card-meta">${esc(clipsCountLabel())}</p>
      <div class="hl-card-actions"><a class="hl-btn" href="#klipi">${t("btn_clips")}</a></div>`;
  }

  function placeCard(btn){
    const card = $("#hl-town-card");
    const stage = card.parentElement;
    const sr = stage.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    card.hidden = false;
    card.style.top = "";
    card.style.left = "";
    if (isCoarse()){
      card.style.left = "";
      card.style.top = "";
      card.style.bottom = "";
      const ch = card.offsetHeight || 220;
      const br = btn.getBoundingClientRect();
      const visible = Math.max(120, window.innerHeight - ch - 28);
      const mid = br.top + br.height / 2;
      const target = 16 + visible / 2;
      if (mid < 16 || mid > visible - 8 || Math.abs(mid - target) > 28){
        window.scrollBy({ top: mid - target, behavior: "smooth" });
      }
      return;
    }
    card.style.bottom = "auto";
    const cw = Math.min(340, sr.width - 24);
    let left = br.left - sr.left + br.width / 2 - cw / 2;
    left = Math.max(12, Math.min(left, sr.width - cw - 12));
    let top = br.top - sr.top - 12;
    card.style.left = left + "px";
    card.style.top = "0px";
    const ch = card.offsetHeight || 200;
    top = top - ch;
    if (top < 12) top = br.bottom - sr.top + 8;
    if (top + ch > sr.height - 8) top = Math.max(12, sr.height - ch - 12);
    card.style.top = top + "px";
  }

  let townPinned = false;
  function closeTownCard(){
    const card = $("#hl-town-card");
    if (!card) return;
    townPinned = false;
    card.hidden = true;
    card.innerHTML = "";
    $$(".hl-spot").forEach(b => { b.classList.remove("is-on"); b.setAttribute("aria-expanded","false"); });
  }

  function openTownCard(btn){
    const card = $("#hl-town-card");
    const spot = btn.getAttribute("data-spot");
    $$(".hl-spot").forEach(b => { b.classList.toggle("is-on", b === btn); b.setAttribute("aria-expanded", b === btn ? "true" : "false"); });
    card.innerHTML = townCardHtml(spot);
    placeCard(btn);
  }

  function updateTownMeta(){
    const open = $(".hl-town-card") && !$("#hl-town-card").hidden;
    const on = $(".hl-spot.is-on");
    if (open && on) openTownCard(on);
  }

  let tourneyServerRaw = "";
  const liveSettings = {
    startISO: "",
    prize: "",
    prizeNote: ""
  };
  function formatEventDate(){
    const iso = liveSettings.startISO || data.eventISO;
    if (!iso) return t("event_date");
    if (String(iso).startsWith("2026-12-19T19:00:00")) return t("event_date");
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return t("event_date");
    const loc = window.hlLocale ? window.hlLocale() : "lv-LV";
    try {
      const wd = new Intl.DateTimeFormat(loc, { timeZone: "Europe/Riga", weekday: "long" }).format(d);
      const day = new Intl.DateTimeFormat(loc, { timeZone: "Europe/Riga", day: "numeric" }).format(d);
      const mon = new Intl.DateTimeFormat(loc, { timeZone: "Europe/Riga", month: "long" }).format(d);
      const hm = new Intl.DateTimeFormat(loc, { timeZone: "Europe/Riga", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
      const wdCap = wd.charAt(0).toUpperCase() + wd.slice(1);
      if (loc.startsWith("lv")) return `${wdCap}, ${day}. ${mon}, ${hm}`;
      return `${wdCap}, ${day} ${mon}, ${hm}`;
    } catch {
      return t("event_date");
    }
  }
  function formatTourneyName(){
    const iso = liveSettings.startISO || data.eventISO;
    if (!iso) return t("tourney_name");
    if (String(iso).startsWith("2026-12-19T19:00:00")) return t("tourney_name");
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return t("tourney_name");
    const loc = window.hlLocale ? window.hlLocale() : "lv-LV";
    try {
      return new Intl.DateTimeFormat(loc, { timeZone: "Europe/Riga", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
    } catch {
      return t("tourney_name");
    }
  }
  function applyLiveSettings(){
    if (liveSettings.startISO && !Number.isNaN(new Date(liveSettings.startISO).getTime())){
      data.eventISO = liveSettings.startISO;
      const count = $("#hl-countdown");
      if (count) count.removeAttribute("data-live");
      tick();
    }
    townMeta.tourneyServer = tourneyServerRaw.trim() || t("server_tba");
    townMeta.server = displayServer(currentServerRaw);
    const nowBox = $("#hl-now-server");
    if (nowBox && !currentServerRaw) { nowBox.textContent = t("server_tba"); nowBox.classList.add("is-tba"); }
    fillEventDate();
    fillBoardMeta();
    updateTownMeta();
  }
  async function loadTownSettings(){
    try {
      const url = data.api && data.api.url;
      const key = data.api && data.api.anonKey;
      if (!url || !key) return;
      const res = await fetch(url + "/rest/v1/hl_settings?select=key,value", {
        headers: { apikey: key, Authorization: "Bearer " + key }
      });
      const rows = await res.json();
      if (!Array.isArray(rows)) return;
      const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
      tourneyServerRaw = (map.tournament_server && String(map.tournament_server).trim()) || "";
      townMeta.tourneyServer = tourneyServerRaw || t("server_tba");
      currentServerRaw = isTbaServer(map.current_server) ? "" : String(map.current_server || "").trim();
      townMeta.server = displayServer(currentServerRaw);
      if (map.tournament_start_iso) liveSettings.startISO = map.tournament_start_iso;
      if (typeof map.tournament_prize === "string") liveSettings.prize = map.tournament_prize;
      if (typeof map.tournament_prize_note === "string") liveSettings.prizeNote = map.tournament_prize_note;
      if (map.max_participants && Number(map.max_participants) > 0) maxSeats = Number(map.max_participants);
      applyLiveSettings();
      renderSeats();
    } catch {}
  }

  function applyDiscordVisibility(){
    const url = String((data && data.discordInvite) || "").trim();
    const on = /^https:\/\//i.test(url);
    document.documentElement.classList.toggle("hl-has-discord", on);
    $$(".hl-discord-join").forEach(a => {
      if (on){
        a.href = url;
        a.removeAttribute("aria-disabled");
        a.classList.remove("is-soon");
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer");
      } else {
        a.href = "#";
        a.setAttribute("aria-disabled", "true");
        a.classList.add("is-soon");
        a.removeAttribute("target");
        a.removeAttribute("rel");
      }
    });
  }

  function initTown(){
    const stage = document.querySelector(".hl-town-stage");
    if (!stage) return;
    loadTownSettings();

    const coarse = () => isCoarse();
    $$(".hl-spot").forEach(btn => {
      btn.addEventListener("mouseenter", () => { if (!coarse()) openTownCard(btn); });
      btn.addEventListener("focus", () => openTownCard(btn));
      btn.addEventListener("click", e => {
        e.preventDefault();
        if (coarse()){
          if (btn.classList.contains("is-on")){
            /* second tap does not auto-navigate; use the card CTA */
            return;
          }
          openTownCard(btn);
          return;
        }
        townPinned = true;
        openTownCard(btn);
      });
    });
    stage.addEventListener("mouseleave", () => { if (!coarse() && !townPinned) closeTownCard(); });
    $("#hl-town-card").addEventListener("click", e => {
      if (e.target.closest(".hl-card-close")) closeTownCard();
    });
    document.addEventListener("click", e => {
      if (!e.target.closest(".hl-town-stage")) closeTownCard();
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeTownCard(); });
  }

  const CLIP_KEY = "hl_clip";
  function clipMine(v){
    if (arguments.length){
      if (v) localStorage.setItem(CLIP_KEY, JSON.stringify(v));
      else localStorage.removeItem(CLIP_KEY);
    }
    try { return JSON.parse(localStorage.getItem(CLIP_KEY) || "null"); }
    catch { return null; }
  }
  function ytId(url){
    const m = String(url||"").match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/))([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : "";
  }
  function clipPoster(c){
    const id = c.host === "youtube" ? ytId(c.video_url) : "";
    if (id){
      return `<button type="button" class="hl-clip-poster" data-host="youtube" data-id="${esc(id)}" data-url="${esc(c.video_url)}" aria-label="${esc(t("play_clip", { title: c.title }))}">
        <img src="https://i.ytimg.com/vi/${esc(id)}/hqdefault.jpg" alt="">
        <span class="hl-play" aria-hidden="true">▶</span>
      </button>`;
    }
    return `<button type="button" class="hl-clip-poster" data-host="${esc(c.host||"")}" data-url="${esc(c.video_url)}" aria-label="${esc(t("open_clip", { title: c.title }))}">
      <span class="hl-clip-ph">${esc((c.host||"klips").slice(0,8))}</span>
      <span class="hl-play" aria-hidden="true">▶</span>
    </button>`;
  }
  function renderClipGrid(list){
    const grid = $("#hl-clip-grid");
    if (!grid) return;
    if (!list.length){
      grid.innerHTML = `<p class="hl-play-empty">${t("empty_clips")}</p>`;
      return;
    }
    grid.innerHTML = list.map(c => `<article class="hl-clip-card">
      ${clipPoster(c)}
      <div class="hl-clip-body">
        <h3>${esc(c.title)}</h3>
        <p>${esc(c.nickname)}</p>
        <span class="hl-clip-host">${esc(c.host)}</span>
      </div>
    </article>`).join("");
  }
  async function refreshClipMine(){
    const box = $("#hl-clip-mine");
    const mine = clipMine();
    if (!box) return;
    if (!mine || !mine.id || !mine.token){ box.hidden = true; box.innerHTML = ""; return; }
    try {
      const out = await hlRpc("hl_clip_mine", { p_id: mine.id, p_token: mine.token });
      if (!out || out.ok === false || !out.clip){ box.hidden = true; return; }
      const c = out.clip;
      const st = c.status === "approved" ? t("clip_approved")
        : c.status === "hidden" ? t("clip_hidden")
        : t("clip_pending");
      box.hidden = false;
      box.className = "hl-clip-pending";
      box.innerHTML = `<b>${esc(c.title)}</b> · ${esc(c.nickname)}<br>${esc(st)}`;
    } catch {
      box.hidden = true;
    }
  }
  async function loadClips(){
    try {
      const raw = await hlRpc("hl_clip_list", {});
      const list = Array.isArray(raw) ? raw : [];
      townMeta.clips = list.filter(c => !c.status || c.status === "approved").length;
      renderClipGrid(list);
      updateTownMeta();
    } catch {
      townMeta.clips = 0;
      renderClipGrid([]);
      updateTownMeta();
    }
    await refreshClipMine();
  }
  function initClips(){
    const form = $("#hl-clip");
    const grid = $("#hl-clip-grid");
    if (form){
      form.addEventListener("submit", async e => {
        e.preventDefault();
        const fd = new FormData(form);
        const msg = $("#hl-clip-msg");
        try {
          const out = await hlRpc("hl_clip_add", {
            p_nickname: (fd.get("nick")||"").trim(),
            p_title: (fd.get("title")||"").trim(),
            p_video: (fd.get("video")||"").trim()
          });
          if (!out || out.ok === false){
            if (msg){ msg.hidden = false; msg.textContent = rpcErr(out && out.error, "err_submit"); msg.classList.remove("is-ok"); }
            toast(rpcErr(out && out.error, "err_clip"));
            return;
          }
          if (out.token && out.clip){
            clipMine({ id: out.clip.id, token: out.token });
          }
          form.reset();
          if (msg){ msg.hidden = false; msg.textContent = t("clip_ok"); msg.classList.add("is-ok"); }
          toast(t("clip_ok"));
          await refreshClipMine();
        } catch (err) {
          toast(rpcErr(err.message, "err_clip"));
        }
      });
    }
    if (grid){
      grid.addEventListener("click", e => {
        const btn = e.target.closest(".hl-clip-poster");
        if (!btn) return;
        const host = btn.getAttribute("data-host");
        const url = btn.getAttribute("data-url") || "";
        const id = btn.getAttribute("data-id") || "";
        if (host === "youtube" && id){
          const wrap = document.createElement("div");
          wrap.innerHTML = `<iframe src="https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=1" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen title="${t("clip_iframe")}"></iframe>`;
          btn.replaceWith(wrap.firstElementChild);
          return;
        }
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      });
    }
    loadClips();
  }


  function fillEventDate(){
    const dateEl = $("#hl-event-date");
    if (dateEl) dateEl.textContent = formatEventDate();
  }
  function fillBoardMeta(){
    const el = $("#hl-tourney-meta");
    if (!el) return;
    el.innerHTML = t("board_meta_html", { tourney: formatTourneyName() });
  }
  function refreshLang(){
    applyLiveSettings();
    renderSeats();
    renderSignupList(lastSignupList);
    renderBoard();
    renderWinners();
    if (typeof loadPresence === "function") loadPresence();
    if (typeof loadClips === "function") loadClips();
    document.querySelectorAll(".hl-spot").forEach(b => {
      const key = { pd:"spot_pd", bank:"spot_bank", tower:"spot_tower", cine:"spot_cine" }[b.getAttribute("data-spot")];
      if (key) b.setAttribute("aria-label", t(key));
    });
  }
  document.addEventListener("hl:lang", refreshLang);
  applyDiscordVisibility();
  renderSeats();
  fillEventDate();
  fillBoardMeta();
  tick();
  setInterval(tick, 1000);
  renderBoard();
  renderWinners();
  loadSeats();
  loadBoard();
  initPresence();
  initTown();
  initClips();
})();
