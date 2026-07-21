/**
 * Catalog product image with one-shot broken-image fallback.
 * Prevents infinite onError loops if the placeholder also fails.
 */
import React, { useCallback, useState } from "react";

/** Neutral SVG placeholder (data URI — no network). */
export const CATALOG_IMAGE_PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200" role="img" aria-label="Image unavailable">
      <rect width="200" height="200" fill="#E8E2D4"/>
      <rect x="28" y="28" width="144" height="144" rx="12" fill="#F6F1E7" stroke="#C9C2B0" stroke-width="2"/>
      <path d="M70 118 L90 92 L108 112 L122 98 L140 118 Z" fill="#C9C2B0"/>
      <circle cx="82" cy="78" r="10" fill="#C9C2B0"/>
      <text x="100" y="152" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="#8b877a">Image unavailable</text>
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
