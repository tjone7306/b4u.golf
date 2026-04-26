# b4u.golf

> Everything you need before you tee off — pre-round weather, courses, checklist, etiquette, and a live scorecard. Built for the casual golfer who plays 5–20 rounds a year.

**Live site:** [b4u.golf](https://b4u.golf) (also at [b4ugolf.com](https://b4ugolf.com))

## What's here

A static Progressive Web App — pure HTML, CSS, and vanilla JavaScript. No build step, no framework, no server required for the site itself.

```
index.html         Course-flyover home page with Round Readiness Score
weather.html       Live weather + golf-specific guidance
courses.html       GPS course finder + tee-time deep links
checklist.html     Pre-round checklist (2 days / night before / morning of)
etiquette.html     Etiquette, pace of play, tipping
equipment.html     14-club rule, ball selection, full pack list
tips.html          Warm-up, mental game, course management
scorecard.html     Live scorecard preview (Pro)
members.html       Pricing & launch list signup
about.html         About + contact
styles.css         Shared stylesheet
script.js          Shared JS (geolocation, weather, scorecard)
manifest.json      Progressive Web App manifest
sw.js              Service worker (offline support)
CNAME              GitHub Pages custom domain
```

## Live data sources (no API keys required)

- **Weather:** [Open-Meteo](https://open-meteo.com) — free, no key
- **Geocoding:** Open-Meteo Geocoding API — free, no key
- **Course finder:** OpenStreetMap Overpass API — free, no key
- **Tee times:** GolfNow / GolfPass deep-link search URLs

## Deploy

Hosted on **GitHub Pages**. Pushing to `main` auto-deploys. Custom domain via the `CNAME` file (`b4u.golf`) and DNS records pointing at GitHub's IPs (see `HOW-TO-DEPLOY.md`).

## Local development

```bash
# Just open index.html in any browser, or:
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Roadmap

See [ROADMAP.md](ROADMAP.md) for phasing, pricing math, and the path to a native app.

## License

© 2026 b4u.golf. All rights reserved.
