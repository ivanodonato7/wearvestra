/**
 * Monetize outbound product URLs.
 * Prefer existing Awin deep links; optionally wrap merchant URLs via Skimlinks or Sovrn
 * when publisher credentials are configured.
 *
 * Env (optional):
 *   SKIMLINKS_SITE_ID  — enables go.skimresources.com wrapper
 *   SOVRN_COMPARISON_API_KEY / SOVRN_PUBLISHER_ID — reserved for future create-link API
 */
function isAwinUrl(url) {
  return /awin1\.com|awin\.com|productserve\.com/i.test(String(url || ""));
}

function skimlinksConfigured() {
  return Boolean(String(process.env.SKIMLINKS_SITE_ID || "").trim());
}

/**
 * @param {string} url
 * @param {{ preferAwin?: boolean }} [opts]
 * @returns {string}
 */
function monetizeProductUrl(url, opts = {}) {
  const raw = String(url || "").trim();
  if (!raw) return raw;
  if (opts.preferAwin !== false && isAwinUrl(raw)) return raw;

  const skimId = String(process.env.SKIMLINKS_SITE_ID || "").trim();
  if (skimId) {
    const encoded = encodeURIComponent(raw);
    return `https://go.skimresources.com/?id=${encodeURIComponent(skimId)}&xcust=vestra&sref=wearvestra&url=${encoded}`;
  }

  // Sovrn Create Link requires authenticated API + site approval — leave direct until configured.
  return raw;
}

/**
 * Apply monetization to a catalog-shaped product card (mutates shopUrl/clickUrl).
 */
function monetizeProductCard(card) {
  if (!card || typeof card !== "object") return card;
  if (card.source === "awin" || isAwinUrl(card.shopUrl) || isAwinUrl(card.clickUrl)) {
    return card;
  }
  const wrapped = monetizeProductUrl(card.shopUrl || card.clickUrl || "");
  if (!wrapped) return card;
  return {
    ...card,
    shopUrl: wrapped,
    clickUrl: wrapped,
    affiliateNetwork: skimlinksConfigured() ? "skimlinks" : "direct",
  };
}

module.exports = {
  isAwinUrl,
  skimlinksConfigured,
  monetizeProductUrl,
  monetizeProductCard,
};
