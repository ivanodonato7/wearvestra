# Real-time web product search — scoping report

**Date:** 2026-07-23  
**Status:** Implemented (hybrid Serper path) — see `netlify/functions/lib/hybridWebSearch.cjs` + `serperShopping.cjs`. Requires `SERPER_API_KEY` on Netlify.

**Original scope:** Research only for Vestra menswear stylist. Do not implement until approved.

---

## 1. Search API comparison (pure usage-based / no monthly floor)

Requirement: **$0 if unused that day** (Claude-like), with structured shopping fields: title, price, image URL, retailer, product link.

| Provider | Billing model | Per-query cost (approx) | Free / trial | Monthly minimum? | Shopping fields | Fit for Vestra |
|---|---|---|---|---|---|---|
| **Serper** (`google.serper.dev/shopping`) | Prepaid credit packs; no subscription | **$0.001** (Starter $50/50k) → **$0.0003** at Ultimate | **2,500** free queries (one-time) | **No monthly fee.** Credits expire in **6 months**. Idle day = $0. | `title`, `price`, `imageUrl`/`thumbnail`, `source` (retailer), `link` | **Best default.** Fast (1–2s), shopping endpoint, Claude-like economics. |
| **Scrapingdog** Google Shopping | PAYG top-ups **or** monthly plans | PAYG: **$10 → 25k credits**; Shopping = **10 credits/req** → **~$0.004/query** | 200 free credits | **No monthly fee on PAYG.** Credits **don’t expire**. | `title`, `price`/`extracted_price`, `thumbnail`, `source`, `product_link` | Strong backup. Slightly pricier than Serper; richer price parsing. |
| **SearchAPI.io** | **Monthly subscription only** | $4 → ~$1 / 1k on higher plans | 100 trial searches | **Yes — $40/mo floor** | Full shopping SERP | **Fails requirement** (monthly minimum). |
| **DataForSEO** Merchant / Google Shopping | Account balance PAYG | Priority ~**$0.002**/product|SERP; standard $0.001 but up to **45 min** queue | $1 test credit | **$50 min top-up** (not a monthly fee). Idle day = $0 after balance loaded. | Products / sellers / reviews | Viable but async priority latency is awkward for live stylist UX unless using priority queue. |
| **SerpAPI** | Monthly plans | ~$25–$75+/mo typical | Limited trial | **Yes — monthly floor** | Excellent shopping schema | **Fails requirement.** |

### Recommendation
**Primary: Serper Shopping API.**  
**Fallback / bake-off: Scrapingdog PAYG** if Serper retailer links or image quality disappoint in a menswear spot-check.

**Caveats (Serper):**
- Credits expire after 6 months → size packs to ~1–2 quarters of expected volume.
- Links are often Google Shopping / merchant URLs, **not** Awin deep links — monetization needs a separate wrapper (below).
- Confirm live sample response shapes for menswear queries before locking schema.

---

## 2. Link monetization (retailers outside Awin)

| Network | Join cost | How it works | Commission cut | Covers non–individually-approved retailers? |
|---|---|---|---|---|
| **Sovrn Commerce** | **Free** to sign up | Site approval + install (JS / Create Link / API). Once approved, access to **tens of thousands** of merchants without per-brand applications. CPA + CPC; auto-routes to better payout when both apply. | Merchant rates vary; Sovrn is the network (you earn their published rates). Not a “25% of your cut” middleman like Skimlinks’ classic model. | **Yes** — once *your site* is approved, you inherit their merchant roster (unlike Awin per-program joins). |
| **Skimlinks** | **Free** to join | Publisher domain approval; JS auto-wrap, Link Generator, or API. One contract → **~48.5k merchants / 50+ networks**. | Classic publisher split: Skimlinks keeps **~25%**, publisher **~75%** of the affiliate commission (industry-standard reporting). | **Yes** — monetizes outbound product links across their catalog without you joining each brand on Awin. |

### Recommendation for Vestra
Use **Skimlinks or Sovrn as a link wrapper** on real-time search outbound URLs (and optionally as a fallback when Awin has no program). Keep **Awin deep links** when the item is already in our affiliate catalog (higher take-rate, cleaner tracking).

Practical pattern:
1. Prefer Awin `clickUrl` when retailer/product is already in catalog.
2. Else pass merchant URL through Skimlinks/Sovrn create-link / redirect API.
3. Never promise commission on every Google Shopping hit — coverage is high but not 100%.

Both require **publisher approval** (site review). Plan for that lead time before launch.

---

## 3. Architecture proposal (how it slots in)

### Current path (keep)
`prompt → catalogPayloadForStylist (local Awin cache) → Claude picks keys → outfit floor / hero → shop sheet`

Fast, deterministic, already monetized via Awin.

### Proposed hybrid (recommended)
**Blend, don’t replace.**

```
prompt
  → Claude (or rules) emits garment search intents
      e.g. { role: "shirt", query: "mens navy oxford shirt slim", budget, formality }
  → Parallel Serper shopping calls (1 per core slot, capped)
  → Normalize → style/formality/palette rank (reuse styleAttributes / formality helpers)
  → Prefer Awin catalog match when close; else attach live web product card
  → Existing outfit floor still requires shirt+trouser+shoe+belt shape
  → Shop sheet: Awin link OR Skimlinks/Sovrn-wrapped merchant URL
```

**Why hybrid:** preserves today’s snappy Awin path as default; live search fills gaps (shoes/belts/sunglasses/out-of-stock / style genres thin in feed).

### Separate path only if…
You want an explicit “Shop the web” mode. Higher latency every time; worse cold-start UX. Not recommended as the only path.

### Latency flags
| Step | Estimate |
|---|---|
| Current local catalog + Claude | ~2–8s (already live) |
| + N Serper calls (parallel, N≈4–6 core slots) | **+1–2s** wall clock if parallel |
| + second Claude curation pass | **+2–6s** (avoid if possible — rank in code first) |
| Worst case sequential search + 2× Claude | **10–20s+** → feels broken on mobile |

**Mitigations:** parallel search; skip second Claude pass; cache query→results ~6–24h; only invoke live search when catalog coverage for that role/formality is thin; hard timeout budget (e.g. 3s for search, fall back to Awin-only).

### Soft Pro fair-use interaction
This report assumes the new **100/mo Pro soft cap** ships first. Live search multiplies cost per stylist request (~4–6 Serper calls + Claude). Soft cap protects Anthropic + Serper outliers without changing free-tier-3.

---

## 4. Cost estimate (search API only)

Assumptions for **current / near-term Vestra traffic** (conservative product guess — replace with analytics when available):

| Scenario | Stylist requests / month | Live-search enabled? | Serper calls / request | Serper calls / mo | Cost @ $0.001/query (Starter) | Cost @ $0.0005/query |
|---|---|---|---|---|---|---|
| **Quiet** (early) | 200 total (mix free+Pro) | 50% of requests | 5 | 500 | **~$0.50** | ~$0.25 |
| **Modest** | 1,000 | 50% | 5 | 2,500 | **~$2.50** | ~$1.25 |
| **Growing** | 5,000 | 60% | 5 | 15,000 | **~$15** | ~$7.50 |
| **Pro outlier stress** (before soft cap) | 1 user × 500 req | 100% | 5 | 2,500 | **~$2.50** just for that user | — |
| **Pro soft-capped** | 1 user × 100 req | 100% | 5 | 500 | **~$0.50**/user/mo search | — |

**Claude cost** (already paid) dominates; Serper at Vestra’s likely scale is **single-digit to low tens of USD/month** until traffic is large.

**vs Pro revenue:** at $8.99/mo, even **one** paying Pro covers thousands of Serper shopping queries on Starter pricing. Search API cost is unlikely to be the blocker; **Claude tokens + abuse** are. Soft fair-use (100) is the right cost control for the combined stack.

**If unused that day:** Serper/Scrapingdog/DataForSEO charge **$0** (no subscription floor). SearchAPI.io / SerpAPI do **not** meet that bar.

---

## 5. Suggested decision checklist (before build)

1. Approve **Serper** as primary (or Scrapingdog bake-off).
2. Approve **Skimlinks or Sovrn** publisher application start (lead time).
3. Confirm hybrid architecture + latency budget (search only when catalog thin).
4. Keep soft Pro fair-use at **100** before turning search on for Pro.
5. Spot-check 20 menswear queries for field quality (image HTTPS, price parse, retailer name, deep link usability).

**Implemented.** Enable with `SERPER_API_KEY` (optional `SKIMLINKS_SITE_ID`).
