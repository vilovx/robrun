# Heist Līga

Unofficial ROB RUN fan-community site in Latvia. The tournament brand is **Heist Līga**. ROB RUN appears only in descriptive text, not in the logo. Not affiliated with Kefir.

**Live:** [https://robrun.flowathletiq.com](https://robrun.flowathletiq.com)  
**GitHub Pages:** [https://vilovx.github.io/robrun/](https://vilovx.github.io/robrun/)

This is a static HTML/CSS/JS site. Live sign-ups, results and “I’m playing” go to Supabase (`hl_` tables and RPCs). The public page never sends email or Discord to anonymous clients.

## Local preview

```bash
python3 -m http.server 8766
```

Open `http://127.0.0.1:8766/`. The yellow preview banner is shown on localhost only and is hidden in production.

Organiser panel: `/admin.html` (noindex).

## DNS

Custom domain: `robrun.flowathletiq.com`. At the `flowathletiq.com` registrar (GoDaddy), add:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| CNAME | `robrun` | `vilovx.github.io` | default |
