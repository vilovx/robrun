/* Heist Līga — wanted-poster page: modals, start-gated result button, localized date. Data logic stays in app.js. */
(function(){
  const $ = (s) => document.querySelector(s);
  const t = (k) => window.t ? window.t(k) : k;
  const DEFAULT_ISO = "2026-12-19T19:00:00";

  function openDlg(id){
    const d = document.getElementById(id);
    if (!d) return;
    if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", "");
    const first = d.querySelector("input");
    if (first) setTimeout(() => first.focus(), 30);
  }
  function closeDlg(d){ if (d.open) { typeof d.close === "function" ? d.close() : d.removeAttribute("open"); } }

  $("#wp-open-signup").addEventListener("click", () => openDlg("wp-signup"));
  $("#wp-open-rules").addEventListener("click", () => openDlg("wp-rules"));
  $("#wp-open-result").addEventListener("click", () => openDlg("wp-result"));
  document.querySelectorAll(".wp-modal").forEach(d => {
    d.addEventListener("click", e => {
      if (e.target === d || e.target.closest("[data-close]")) closeDlg(d);
    });
  });
  /* app.js resets a form only after a successful save; close its modal then. */
  ["hl-signup", "hl-submit"].forEach(id => {
    const f = document.getElementById(id);
    if (f) f.addEventListener("reset", () => { const d = f.closest("dialog"); if (d) closeDlg(d); });
  });

  /* Results button stays hidden until the start time. */
  function gate(){
    const iso = window.HL && window.HL.eventISO;
    const start = iso ? new Date(iso).getTime() : NaN;
    const started = Number.isFinite(start) && Date.now() >= start;
    $("#wp-open-result").hidden = !started;
    $("#wp-open-signup").hidden = false;
  }

  /* Big date line: static text for the default start, localized if the organiser moves the start. */
  function fillDate(){
    const iso = (window.HL && window.HL.eventISO) || "";
    const el = document.querySelector(".wp-date");
    if (!el) return;
    if (!iso || String(iso).startsWith(DEFAULT_ISO)){
      el.innerHTML = `<span>${t("w_date")}</span> <b>19:00</b>`;
      return;
    }
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return;
    const loc = window.hlLocale ? window.hlLocale() : "lv-LV";
    try {
      const day = new Intl.DateTimeFormat(loc, { timeZone: "Europe/Riga", day: "numeric", month: "long" }).format(d);
      const hm = new Intl.DateTimeFormat(loc, { timeZone: "Europe/Riga", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
      el.innerHTML = "";
      const s = document.createElement("span"); s.textContent = day;
      const b = document.createElement("b"); b.textContent = hm;
      el.append(s, " ", b);
    } catch {}
  }

  /* Old links to the former home-page sections still land somewhere useful. */
  function openFromHash(){
    const h = (location.hash || "").slice(1);
    if (h === "noteikumi") openDlg("wp-rules");
    else if (h === "pieteikties") openDlg("wp-signup");
    else if (h === "iesniegt" && !$("#wp-open-result").hidden) openDlg("wp-result");
  }

  function refresh(){ gate(); fillDate(); }
  document.addEventListener("hl:lang", refresh);
  refresh();
  setInterval(gate, 15000);
  /* hl_settings may move the start after load. */
  setTimeout(refresh, 2500);
  openFromHash();
  window.addEventListener("hashchange", openFromHash);
})();
