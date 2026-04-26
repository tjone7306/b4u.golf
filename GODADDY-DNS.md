# GoDaddy DNS — point b4u.golf and b4ugolf.com at GitHub Pages

After you've pushed the repo to GitHub and enabled Pages, run these DNS changes in GoDaddy.

> ⚠️ **Order matters.** Do GitHub Pages first. Add CNAME file (already in repo). THEN do DNS. Otherwise GitHub will refuse to provision SSL until DNS resolves.

## Step 1 — Verify the site is up at the GitHub URL

Before changing DNS, confirm `https://tjone7306.github.io/b4u.golf` loads. Wait 1–2 minutes after enabling Pages for the first build.

## Step 2 — DNS for `b4u.golf` (the primary domain)

Log in to GoDaddy → **My Products** → click **DNS** next to `b4u.golf`. Delete any existing A records pointing at GoDaddy's parking page. Then add these:

### A records (apex / root domain → GitHub Pages servers)

| Type | Name | Value           | TTL    |
|------|------|-----------------|--------|
| A    | @    | 185.199.108.153 | 1 hour |
| A    | @    | 185.199.109.153 | 1 hour |
| A    | @    | 185.199.110.153 | 1 hour |
| A    | @    | 185.199.111.153 | 1 hour |

### AAAA records (optional — IPv6, recommended)

| Type | Name | Value                       | TTL    |
|------|------|-----------------------------|--------|
| AAAA | @    | 2606:50c0:8000::153         | 1 hour |
| AAAA | @    | 2606:50c0:8001::153         | 1 hour |
| AAAA | @    | 2606:50c0:8002::153         | 1 hour |
| AAAA | @    | 2606:50c0:8003::153         | 1 hour |

### CNAME for www subdomain

| Type  | Name | Value                  | TTL    |
|-------|------|------------------------|--------|
| CNAME | www  | tjone7306.github.io   | 1 hour |

> The trailing dot after `github.io` doesn't matter — GoDaddy adds it automatically.

## Step 3 — Wait for propagation (5 min – 2 hours)

DNS changes take time to ripple out. Test it from a terminal:

```bash
dig b4u.golf +short
# should return four lines: 185.199.108.153, 185.199.109.153, etc.
```

Or use a free checker: <https://dnschecker.org/#A/b4u.golf>

## Step 4 — Tell GitHub Pages to use your custom domain

The `CNAME` file in your repo already says `b4u.golf` — GitHub auto-detects that. Once DNS resolves:

1. Go to <https://github.com/tjone7306/b4u.golf/settings/pages>
2. Under **Custom domain**, you should already see `b4u.golf` populated.
3. Wait for the green check (DNS verification — takes 5–30 min).
4. Tick **Enforce HTTPS**. (May be greyed out at first — comes online once GitHub provisions a free Let's Encrypt SSL cert. Usually within 1 hour.)

That's it for `b4u.golf`. The site will load at:
- ✅ `https://b4u.golf`
- ✅ `https://www.b4u.golf` (auto-redirects to apex)

## Step 5 — Mirror `b4ugolf.com` to `b4u.golf`

You don't need to host two copies of the site — pick one canonical URL (b4u.golf) and forward the other.

In GoDaddy → **My Products** → click **DNS** next to `b4ugolf.com` → click **Forwarding** in the side menu:

- **Forward to:** `https://b4u.golf`
- **Forward type:** `Permanent (301)`
- **Settings:** ☑ **Forward only** · ☑ **Update my nameservers and DNS settings to support this change**

Save. After 5–30 min, anyone typing `b4ugolf.com` lands on `b4u.golf`.

> Why a 301 redirect, not a duplicate site? Google penalizes duplicate content. A redirect tells search engines "these are the same site, index the canonical one." Better SEO, simpler to maintain.

## Troubleshooting

**Site shows "404 — There isn't a GitHub Pages site here."**
→ GitHub Pages not enabled yet. Check `Settings → Pages → Source: Deploy from a branch · main · /`.

**"DNS_PROBE_FINISHED_NXDOMAIN" in browser**
→ DNS hasn't propagated yet. Wait 30 min, try again.

**SSL certificate error**
→ GitHub takes up to 1 hour to provision SSL after DNS resolves. Be patient. If still broken after 24 hours, in repo Settings → Pages, remove the custom domain, save, re-add it. Triggers a fresh cert.

**"Domain is already taken" when adding to GitHub Pages**
→ You (or someone) already added it on a different repo. Check your other GitHub repos.

**Forwarding from b4ugolf.com loops or shows GoDaddy parking**
→ Make sure under DNS for b4ugolf.com, you've checked "Update my nameservers and DNS settings to support this change" when setting up forwarding.

## Reference

- GitHub Pages custom domain docs: <https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site>
- GitHub's IP addresses (don't change often, but verify if these stop working): <https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site#configuring-an-apex-domain>
