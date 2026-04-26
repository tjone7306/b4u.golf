# b4u.golf — Strategy & roadmap

A working memo on where this product can go. Treat as draft — we'll revise as we learn.

---

## 1. Positioning recap

**Promise:** "Everything you need *before* you tee off."

**Why it works:** every meaningful competitor (18Birdies, Hole19, GolfLogix, Arccos, The Grint) leads with *during-the-round* features — GPS yardages, shot tracking, scorecards. Pre-round prep is genuinely under-served, especially for the casual / 5–20-rounds-a-year golfer who doesn't already know what slope rating means.

**Target audience:** the ~60% of US golfers (per NGF data) who play between 5 and 20 rounds a year. Not the scratch player who already owns Arccos. Not the once-a-decade hacker. The middle.

**Brand voice:** confident but not snobby. Educational, never condescending. We assume the reader doesn't know terminology and explain it without making them feel dumb.

---

## 2. Pricing strategy

**Current plan (locked in 2026-04-26):**
- Free Forever — weather, courses, checklist, etiquette, equipment, tips, basic scorecard. No ads.
- Pro — **$1.99/mo or $14.99/yr** — GPS, scorecard sync, stats, handicap, live competitions.

**Why this price:**

| Competitor | Monthly | Annual |
|---|---|---|
| Arccos | $12.99 | $99 |
| 18Birdies | $4.99 | $49 |
| The Grint | $5.00 | $40 |
| Hole19 | – | $50 (~$4.17/mo) |
| GolfLogix | – | $39 |
| **b4u.golf** | **$1.99** | **$14.99** |

We're 60%+ below the cheapest meaningful competitor. That's a deliberate "Spotify undercut" — at this price, none of the incumbents can match without their own revenue collapse.

**Unit economics at $1.99/mo:**
- Stripe fees: ~3% + $0.30 → net ~$1.63/mo
- At $14.99/yr (annual): one transaction, ~$0.74 fee → net ~$14.25/yr (~$1.19/mo equivalent)
- Break-even at small scale: ~30–40 paid users covers hosting/Supabase/domain costs (~$50/mo).
- 1,000 paid Monthly = ~$1,630/mo gross, ~$19,500/yr.
- 5,000 paid users = ~$8,150/mo gross, ~$98K/yr.
- 10,000 paid users = ~$16,300/mo gross, ~$195K/yr.

**Risks of the low price:**
- Some users equate price with quality. Mitigation: lead with "no ads, ever" and "free tier is real" rather than apologizing for being cheap.
- Doesn't fund hardware/AI features. Mitigation: stay in our lane — pre-round prep + simple scorecard + social competitions, not professional shot tracking.

---

## 3. Product roadmap

### Phase 1 — Site live (now)
✅ Multi-page site on GoDaddy
✅ PWA install support (manifest + service worker)
✅ Live weather (Open-Meteo, no API key)
✅ Course finder (geolocation + OpenStreetMap)
✅ Tee-time deep-links (GolfNow, GolfPass)
✅ Pricing page with launch-list signup
✅ Live scorecard UI preview (frontend only)

### Phase 2 — Make Pro real (next 4–8 weeks)
- **Stripe integration** for subscription billing (Payment Links + customer portal — no custom backend yet).
- **Email capture & launch announcements** via Buttondown or Mailchimp (free tiers handle our scale).
- **Supabase backend** for user accounts, scorecards, live multiplayer (free tier covers 50K rows + 2GB egress).
- **Scorecard live multiplayer** — room codes, real-time score sync via Supabase Realtime channels.
- **Skins, Nassau, match play, scrambles** game modes.
- **Cloud round history** for Pro users.
- **Analytics** — Google Analytics 4 + Plausible (whichever Tim prefers).

### Phase 3 — Native apps (Q3–Q4 2026)
- Wrap the PWA in **Capacitor** (one codebase → iOS + Android).
- Submit to App Store and Google Play.
- Add native-only features: push notifications for tee-time deals, Apple Watch glance for live scorecard.
- Cost: ~$99/yr Apple Developer + $25 one-time Google Play. No additional development if PWA is solid.

### Phase 4 — Course operator program (2027)
- **Free course listings** for any pro shop / course operator who wants a profile page on b4u.golf.
- **Paid features for operators** (~$29–49/mo): featured placement, custom tee-time deal alerts to nearby b4u.golf members, branded scorecard for their course.
- This is the long-term margin opportunity — we get to charge B2B without hurting consumer pricing.

### Phase 5 — League / club mode (2027+)
- Per-seat add-on for league managers (~$1/seat/mo).
- Run a club championship, weekly scrambles, match-play brackets.
- This is the LimitLock competition vibe extended to recurring leagues.

---

## 4. Acquisition strategy

We're not going to outspend 18Birdies on Facebook ads. Channels that fit:

1. **SEO** — long-tail informational queries: "what to wear to golf", "what is slope rating", "golf etiquette tipping". Our content pages target these naturally.
2. **Reddit** — r/golf, r/golftips have ~3M members. Genuine helpful posts (not promo spam) on common pre-round questions can drive massive referral traffic.
3. **TikTok / Instagram Reels** — short "did you know" videos of pre-round tips. Our content is already structured for this.
4. **Pro shop partnerships** — a printed QR code at the starter desk = "scan for the weather forecast and course tips before you tee off." Free for them, awareness for us.
5. **Word of mouth via competitions** — when one player creates a live scorecard room and 3 friends join, that's 3 new users at zero CAC.

---

## 5. What we're explicitly NOT doing (yet)

- Hardware sensors / clubs with chips (Arccos territory — capital-intensive)
- AI swing analysis (SwingU territory — needs ML infrastructure)
- Professional handicap services (USGA-approved — heavy compliance burden)
- Full social network (Instagram for golfers — already exists at 18Birdies, slow burn)

Our discipline: pre-round + simple scorecard + casual competitions. Anything else is a distraction in 2026.

---

## 6. Decisions we still need to make

- [ ] **Logo / brand mark** — currently using a styled "B4U" text mark. A real designed logo would help.
- [ ] **Email provider** — Mailchimp (familiar) vs Buttondown (cleaner) vs ConvertKit (creator-focused)?
- [ ] **Stripe vs Paddle** — Paddle handles VAT/sales tax automatically (worth the slightly higher fee at scale).
- [ ] **Domain canonicalization** — `b4u.golf` primary with `b4ugolf.com` 301-redirecting (recommended), or vice versa?
- [ ] **Beta launch date** — soft-launch to a hand-picked group of 20–50 golfers before going public.

---

## 7. North-star metric

For now: **monthly active users who completed a pre-round checkin** (looked up weather, checked the checklist, or pulled up their scorecard within 24 hours of a tee time). That's the behavior we built the brand around. Everything else (signups, page views, paid conversions) is downstream.
