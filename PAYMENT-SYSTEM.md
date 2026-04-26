# How to charge for b4u.golf — explained for someone used to the App Store

You said you're used to charging via the App Store. Web subscriptions work differently. The good news: it's actually simpler in some ways, and your fees are much lower (3% vs Apple's 15–30%). The bad news: you have to assemble a few pieces yourself, where Apple gives you one box.

This memo walks through the model, then gives you three concrete options ranked by complexity.

---

## 1. The mental model: App Store vs. Web

### App Store (what you're used to)

```
                          ┌─────────────────────────┐
   User taps "Subscribe"  │      THE APP STORE      │
        ────────────────► │  Apple does everything: │
                          │   • Auth (Apple ID)     │
                          │   • Payment (their card)│
                          │   • Receipt + entitlement│
                          │   • Renewal             │
                          │   • Refunds             │
                          └─────────────────────────┘
                                      │
                          You get 70-85% of revenue
```

Apple is the entire system. You don't know who the user really is, you don't see their card, you don't run the renewal logic. You ship the app, you get a check.

### Web (what we're building)

```
   User clicks "Subscribe"
            │
            ▼
   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
   │  AUTH           │    │   PAYMENT       │    │   ENTITLEMENT   │
   │  Who is this    │ +  │  Charge their   │ +  │  Is this user   │
   │  user?          │    │  card on a      │    │  paid? Block    │
   │  (Firebase)     │    │  recurring basis│    │  premium UI     │
   │                 │    │  (Stripe)       │    │  if not.        │
   └─────────────────┘    └─────────────────┘    └─────────────────┘
                                      │
                          You get 96-97% of revenue
```

Three separate things. You wire them together once and they run forever. Apple charges 15–30%; Stripe charges 2.9% + 30¢ per transaction. On $1.99/mo, you keep $1.63 vs Apple's $1.39–1.69. On $14.99/yr, you keep ~$14.25 vs Apple's $10.50–12.75.

---

## 2. The three pieces, in plain English

### Auth (who is this person?)

When someone signs up, you give them an account. Email + password is fine but boring. Better: **magic link** (they enter their email, you send them a one-tap login link — no password to forget). **Firebase Auth** does both for free, plus Google/Apple/Facebook sign-in if you want.

You'll store: `userId`, `email`, `created_at`. Nothing else, ever — keep it simple.

### Payment (charging the card)

You **never touch credit card numbers** — that's a compliance nightmare (PCI). Instead, you redirect the user to a **Stripe Checkout** page hosted by Stripe. They type their card on Stripe's page; Stripe charges it monthly; Stripe sends you the money minus their fee.

When they pay successfully, Stripe sends a **webhook** (a one-line "hey, this user just paid" message) to a URL you control. That URL tells your database "user X is now paid through next month."

### Entitlement (is this user paid? gate the features)

Your database has a flag: `userId → isPro: true/false`. Every time the page loads, you check that flag:

```javascript
if (currentUser.isPro) {
  showLiveGPS();
  enableLiveCompetitions();
} else {
  showUpgradePrompt();
}
```

That's it. The "paywall" is just a JavaScript if-statement. The real security is on the backend — even if a clever user changes `isPro: true` in their browser, the data they need to see (live GPS yardages, premium course info, scorecard sync) lives on your server, and your server only sends it if Firebase says they're actually paid.

---

## 3. "Can people just bypass the paywall?"

Short answer: **the JavaScript paywall is a UX hint, not the real security.**

Long answer:
- **Free features** (weather, course finder, checklists, etiquette) are just static HTML and CSS. Anyone can view them — that's fine, those are free anyway.
- **Pro features** (live GPS, scorecard sync, stats, live competitions) **require a backend round-trip**. The user's browser asks Firebase: "give me the GPS data for hole 7 at Pebble Beach." Firebase checks: "is this user marked as Pro? No → 401 unauthorized." The browser never gets the data.

So even if someone hacks their local JavaScript to flip `isPro: true`, they won't see Pro features — because Pro features aren't IN the page until the server sends them, and the server checks payment first.

**This is the same model Spotify, Netflix, and the New York Times use.** It works. The crackable part is just the UI shimmer; the actual valuable stuff is gated server-side.

The one thing you can't prevent: someone sharing their account with three friends. Easy mitigations: limit to ~2 active devices, alert on weird behavior. Not worth obsessing over for a $1.99 product.

---

## 4. Three concrete paths — pick one

I'll give you the actual path lengths. All three end with you charging $1.99/mo to real users.

### Path A — Stripe Payment Links (MVP, ~30 min to set up)

The cheapest, fastest, dumbest version. Good for the launch list.

**What you do:**
1. Sign up at stripe.com (free).
2. In Stripe dashboard → Products → Create product "b4u.golf Pro" → $1.99/month, recurring.
3. Click "Create payment link." Stripe gives you a URL like `https://buy.stripe.com/abc123`.
4. On `members.html`, change the "Get Pro" button's `href` to that URL.

**What the user experiences:**
- Clicks "Get Pro" → goes to Stripe's hosted checkout.
- Pays → gets a Stripe receipt by email.
- Returns to your site... and there's no "logged in" state, because you don't have auth yet.

**Why this is OK for an MVP:**
- You collect real money.
- You see who paid in your Stripe dashboard.
- You email them a "welcome to Pro" message manually.
- You manually grant them Pro access when you build the real auth (Phase 2).

**Limitations:**
- No automatic Pro features yet (nothing's actually gated).
- Paying customers can't "log in" to get their benefit until Phase 2.
- You're essentially pre-selling the product.

**Cost:** $0/mo + 2.9% + 30¢ per transaction.
**Time:** 30 min.

---

### Path B — Firebase + Stripe (full system, ~6 hours to build)

The real deal. This is the architecture I'd build for you given that you already have a Firebase account.

```
┌──────────────────┐   1. Sign up    ┌────────────────────┐
│   Browser        │ ──────────────► │  Firebase Auth     │
│   (b4u.golf)     │   email + PW    │  (free)            │
└──────────────────┘                 └────────────────────┘
        │
        │ 2. Click "Get Pro"
        ▼
┌────────────────────┐   3. Pay      ┌────────────────────┐
│  Stripe Checkout   │ ◄──────────── │  Stripe (free,     │
│  (Stripe-hosted)   │               │  charges 2.9%+30¢) │
└────────────────────┘               └────────────────────┘
        │
        │ 4. Stripe sends webhook
        ▼
┌────────────────────────┐   5. Set isPro: true
│  Firebase Cloud Func.  │ ────────────────────────────────►
│  (free tier: 2M/mo)    │                                  │
└────────────────────────┘                                  │
                                                            ▼
                                            ┌──────────────────┐
                                            │  Firestore DB    │
                                            │  users/{uid}     │
                                            │  { isPro: true } │
                                            └──────────────────┘
                                                            │
                                            6. Browser reads isPro,
                                               shows Pro features
```

**The pieces:**

1. **Firebase Auth** — drops two lines into `members.html` for sign up / log in. Free for the first 50,000 users.

2. **Stripe Checkout** — same as Path A, but the user is logged in first, so we can attach their userId to the Stripe customer record.

3. **Firebase Cloud Function** — a tiny piece of server code (~30 lines) listening for Stripe webhooks. When Stripe says "user paid," the function updates Firestore: `users/{uid} → isPro: true, expiresAt: ...`.

4. **Firestore database** — stores user records + their subscription status. Free tier covers 50K reads/day, 20K writes/day.

5. **Frontend gates** — every Pro feature page checks `currentUser.isPro` before rendering. Server-side, Firestore security rules block non-Pro users from reading premium data.

**What I'd build:**
- A new page `login.html` with sign-up / log-in.
- Update `members.html` to require login before showing the "Get Pro" button.
- A Cloud Function in a `functions/` folder (deployed via `firebase deploy`).
- Updated `scorecard.html` and a new `gps.html` page that check Pro status before loading.

**Cost at small scale:**
- Firebase: $0/mo (free tier covers ~5K active users)
- Stripe: 2.9% + 30¢/transaction
- Total: $0/mo + Stripe fees on actual revenue.

**Cost at scale (10K paid users, ~$20K/mo gross):**
- Firebase: ~$25/mo (Blaze plan, pay-as-you-go)
- Stripe: ~$600/mo (3% of revenue)
- Total: ~$625/mo, margin ~97%.

**Time to build (mine):** 4–6 hours of pair work. You'd need to:
- Create the Firebase project (5 min on console.firebase.google.com)
- Create the Stripe account + product (15 min)
- Plug in your API keys to a `.env` file (5 min)
- Watch me deploy the Cloud Function (10 min)

---

### Path C — Memberstack or Outseta (managed, ~1 hour, costs ~$25/mo)

If you don't want to maintain the auth + Stripe wiring yourself, services like **Memberstack**, **Outseta**, or **Clerk + Stripe** do all of Path B as a hosted product. You drop a JavaScript snippet into your HTML and they handle login, payment, and entitlement checks.

**Pros:**
- Almost no code. ~30 minutes of setup.
- They handle Stripe webhooks, auth, lockouts, password resets.
- Beautiful pre-built sign-up / log-in / billing UIs.

**Cons:**
- $25–49/mo (Memberstack starts at $25/mo).
- Lock-in: hard to migrate users out later.
- Smaller ecosystem than Firebase if you ever want to add features.

**Cost at small scale:**
- Memberstack: $25/mo (covers ~1K members)
- Stripe: 2.9% + 30¢/transaction
- Total: $25/mo + Stripe fees

**Cost at scale (10K paid users):**
- Memberstack: $99/mo
- Stripe: ~$600/mo
- Total: ~$700/mo, margin ~96%.

**Time to build (mine):** 1 hour.

---

## 5. My recommendation for you

Given that:
- You already have a Firebase account
- You want to live-multiplayer the scorecard (Firestore is perfect for this)
- You're price-sensitive and don't want $25/mo just for auth
- You have an existing app (LimitLock) so you're comfortable with technical concepts

→ **Do Path A this week** (Stripe Payment Link, takes 30 min, real money in by tomorrow).
→ **Do Path B in May/June** (full Firebase wiring) once you have your first 10–20 paying users from Path A and have proven the demand.

This way:
1. You start collecting revenue and validating the market in days, not weeks.
2. You don't burn 6 hours of build time on a product no one's bought yet.
3. When you're ready for the real system, Firebase is a $0 step up — not a $25/mo new vendor.

---

## 6. The actual numbers

Per paying user, monthly:

| Layer        | Cost                          |
|--------------|-------------------------------|
| Stripe fee   | $0.36 (2.9% × $1.99 + $0.30)  |
| Firebase     | $0.00 at small scale          |
| GitHub Pages | $0.00                         |
| **Net to you** | **$1.63 per user/month**    |

Per paying user, annually ($14.99):

| Layer        | Cost                            |
|--------------|---------------------------------|
| Stripe fee   | $0.74 (2.9% × $14.99 + $0.30)   |
| Firebase     | $0.00 at small scale            |
| GitHub Pages | $0.00                           |
| **Net to you** | **$14.25 per user/year**      |

**Compared to App Store:**
- App Store small business program (under $1M revenue): 15% fee
- $1.99/mo → Apple takes ~$0.30 → you get ~$1.69
- We're $1.63 vs Apple's $1.69 — practically identical

**But you also avoid:**
- Apple's 30-day review process for any change
- The "you can't even mention there's a website where it's cheaper" rule
- The annual $99 developer fee
- The mandatory App Store privacy disclosure paperwork
- Sign in with Apple (mandatory if you offer any other social login)
- The "we deserve a cut of your hardware sensor sales too" debate

The web is the freer path. You just have to do a tiny bit of plumbing yourself.

---

## 7. Anti-piracy / sharing — what to actually worry about

Realistic threats, in order:

1. **One person shares password with their foursome.** Mitigation: limit to 2 active sessions per account, alert on suspicious country jumps. Cost: a few hours of code in Phase 2.
2. **Someone uses the free tier forever and never pays.** Not a problem — that's the design. The free tier is the funnel.
3. **Someone scrapes your free pages and republishes them.** Not worth fighting. Your free content is brand marketing.
4. **Someone hacks the JS to bypass the UI paywall.** Doesn't matter — Pro data is server-gated.
5. **Someone reverse-engineers your API to steal Pro data without paying.** Mitigation: rate-limit, require auth tokens. This is what you'd actually spend engineering time on if it became a real problem. Today, it isn't.

> The absolute worst version of someone "stealing" your product is they get everything you'd give them anyway in the free tier. Don't lose sleep over this.

---

## 8. What I'd build right now if you say "go"

**Phase 1 (this week, ~30 min):**
- You: create Stripe account, create $1.99/mo product, generate Payment Link.
- Me: wire that link into the "Get Pro" buttons on `members.html` and the home page CTA.
- Me: add a `success.html` page that thanks them and asks them to email you for early access.
- Result: real money flowing in within 24 hours.

**Phase 2 (May, ~6 hours):**
- You: share Firebase project ID + Stripe API keys (I'll show you where).
- Me: wire Firebase Auth into `members.html`, add `login.html`, build the Cloud Function for Stripe webhooks, gate `scorecard.html` Pro features behind auth.
- Result: full self-serve sign-up and Pro access.

**Phase 3 (June+, ~10 hours):**
- Me: live multiplayer scorecard via Firestore Realtime (the LimitLock-style competitions).
- Me: GPS yardages page using Firebase + a course-data source.
- You: marketing push — Reddit, TikTok, pro shop QR codes.

Tell me when you've got Stripe set up and I'll wire Phase 1 immediately.
