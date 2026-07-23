/**
 * Catalog product image with one-shot broken-image fallback.
 * Prevents infinite onError loops if the placeholder also fails.
 */
import React, { useCallback, useState } from "react";

/** Neutral SVG placeholder (data URI — no network). */
export const CATALOG_IMAGE_PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200" role="img" aria-label="No image available">
      <rect width="200" height="200" fill="#faf6ec"/>
      <rect x="24" y="24" width="152" height="152" rx="10" fill="#F6F1E7" stroke="rgba(198,165,103,0.55)" stroke-width="1.5"/>
      <path d="M68 122 L90 94 L108 114 L124 98 L142 122 Z" fill="#C6A567" fill-opacity="0.35"/>
      <circle cx="80" cy="78" r="9" fill="#C6A567" fill-opacity="0.45"/>
      <text x="100" y="154" text-anchor="middle" font-family="Georgia, 'Playfair Display', serif" font-size="11" fill="#8b877a">No image available</text>
    </svg>`,
  );

/**
 * @param {object} props
 * @param {string} [props.src]
 * @param {string} [props.alt]
 * @param {string} [props.className]
 * @param {string} [props.loading]
 * @param {string} [props.decoding]
 * @param {string} [props.fetchPriority]
 */
export function CatalogImage({
  src,
  alt = "",
  className,
  loading = "lazy",
  decoding = "async",
  fetchPriority,
  ...rest
}) {
  const [failed, setFailed] = useState(false);
  const resolved = !src || failed ? CATALOG_IMAGE_PLACEHOLDER : src;

  const onError = useCallback((e) => {
    // One-shot: never retry after falling back to the data-URI placeholder
    if (e.currentTarget.dataset.fallback === "1") {
      e.currentTarget.onerror = null;
      return;
    }
    e.currentTarget.dataset.fallback = "1";
    e.currentTarget.onerror = null;
    setFailed(true);
  }, []);

  return (
    <img
      className={className}
      src={resolved}
      alt={alt}
      loading={loading}
      decoding={decoding}
      fetchPriority={fetchPriority}
      onError={onError}
      {...rest}
    />
  );
}

export default CatalogImage;
