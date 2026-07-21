#!/usr/bin/env node
/**
 * Diagnose broken product images in the menswear catalog.
 *
 * Usage:
 *   node scripts/check-images.cjs
 *   node scripts/check-images.cjs --concurrency 40 --timeout 8000
 *   node scripts/check-images.cjs --deep   # also flag tiny / non-image responses
 *
 * Writes: broken-images-report.json (repo root)
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CATALOG_PATH = path.join(ROOT, "public/data/menswear-catalog.json");
const OUT_PATH = path.join(ROOT, "broken-images-report.json");

function parseArgs(argv) {
  const opts = { concurrency: 32, timeout: 10000, limit: 0, deep: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--concurrency") opts.concurrency = Math.max(1, Number(argv[++i]) || 32);
    else if (a === "--timeout") opts.timeout = Math.max(1000, Number(argv[++i]) || 10000);
    else if (a === "--limit") opts.limit = Math.max(0, Number(argv[++i]) || 0);
    else if (a === "--deep") opts.deep = true;
    else if (a === "--help" || a === "-h") {
      console.log("Usage: node scripts/check-images.cjs [--concurrency 32] [--timeout 10000] [--limit N] [--deep]");
      process.exit(0);
    }
  }
  return opts;
}

function loadItems() {
  const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  const items = Array.isArray(raw) ? raw : (raw.items || []);
  if (!items.length) throw new Error(`No items in ${CATALOG_PATH}`);
  return items;
}

function looksLikeImageMagic(buf) {
  if (!buf || buf.length < 3) return false;
  const hex = buf.slice(0, 3).toString("hex");
  if (hex === "ffd8ff") return true; // jpeg
  if (hex === "89504e") return true; // png
  const six = buf.slice(0, 6).toString("ascii");
  if (six === "GIF89a" || six === "GIF87a") return true;
  if (buf.slice(0, 4).toString("ascii") === "RIFF") return true; // webp
  if (buf.slice(0, 4).toString("ascii") === "<svg") return true;
  return false;
}

async function checkUrl(url, timeoutMs, deep) {
  if (!url || typeof url !== "string" || !url.trim()) {
    return { ok: false, status: null, bytes: null, contentType: null, error: "missing_url" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    "User-Agent": "VestraImageCheck/1.0 (+https://wearvestra.com)",
    Accept: "image/*,*/*",
    Referer: "https://wearvestra.com/",
  };
  try {
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers,
    });
    // Some CDNs reject HEAD — retry GET
    if (res.status === 405 || res.status === 501 || res.status === 403) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { ...headers, Range: "bytes=0-1023" },
      });
    }
    const status = res.status;
    const contentType = res.headers.get("content-type");
    const clHeader = res.headers.get("content-length");
    let bytes = clHeader != null ? Number(clHeader) : null;

    if (!(status >= 200 && status < 400)) {
      return { ok: false, status, bytes, contentType, error: `http_${status}` };
    }

    if (deep) {
      if (contentType && !/^image\//i.test(contentType) && !/octet-stream/i.test(contentType)) {
        return { ok: false, status, bytes, contentType, error: `bad_type_${contentType.split(";")[0]}` };
      }
      if (bytes != null && bytes < 500) {
        return { ok: false, status, bytes, contentType, error: `too_small_${bytes}` };
      }
      // Confirm magic bytes with a small GET when length unknown or suspicious
      if (bytes == null || bytes < 2000) {
        const get = await fetch(url, {
          method: "GET",
          redirect: "follow",
          signal: controller.signal,
          headers: { ...headers, Range: "bytes=0-2047" },
        });
        if (!(get.status >= 200 && get.status < 400)) {
          return { ok: false, status: get.status, bytes, contentType: get.headers.get("content-type"), error: `http_${get.status}` };
        }
        const buf = Buffer.from(await get.arrayBuffer());
        bytes = Number(get.headers.get("content-length")) || buf.length;
        if (bytes < 500 && buf.length < 500) {
          return { ok: false, status: get.status, bytes: buf.length, contentType: get.headers.get("content-type"), error: `too_small_${buf.length}` };
        }
        if (!looksLikeImageMagic(buf)) {
          return { ok: false, status: get.status, bytes: buf.length, contentType: get.headers.get("content-type"), error: "bad_magic" };
        }
      }
    }

    return { ok: true, status, bytes, contentType, error: null };
  } catch (err) {
    const name = err?.name || "Error";
    const msg = String(err?.message || err);
    if (name === "AbortError" || /aborted/i.test(msg)) {
      return { ok: false, status: null, bytes: null, contentType: null, error: "timeout" };
    }
    return { ok: false, status: null, bytes: null, contentType: null, error: msg.slice(0, 160) };
  } finally {
    clearTimeout(timer);
  }
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  const n = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

async function main() {
  const opts = parseArgs(process.argv);
  let items = loadItems();
  if (opts.limit > 0) items = items.slice(0, opts.limit);

  console.log(`Checking ${items.length} catalog images…`);
  console.log(`  catalog: ${CATALOG_PATH}`);
  console.log(`  concurrency=${opts.concurrency} timeout=${opts.timeout}ms deep=${opts.deep}`);

  const started = Date.now();
  let done = 0;
  const broken = [];

  await mapPool(items, opts.concurrency, async (item) => {
    const url = item.image || item.imageUrl || item.img || "";
    const result = await checkUrl(url, opts.timeout, opts.deep);
    done += 1;
    if (done % 100 === 0 || done === items.length) {
      const pct = ((done / items.length) * 100).toFixed(1);
      process.stdout.write(`\r  progress ${done}/${items.length} (${pct}%)  broken=${broken.length}   `);
    }
    if (!result.ok) {
      broken.push({
        key: item.key || null,
        id: item.id || null,
        name: item.name || null,
        family: item.family || item.type || null,
        retailer: item.retailer || null,
        image: url || null,
        status: result.status,
        bytes: result.bytes,
        contentType: result.contentType,
        error: result.error,
      });
    }
    return result;
  });

  process.stdout.write("\n");
  const elapsedMs = Date.now() - started;
  const total = items.length;
  const brokenCount = broken.length;
  const pctBroken = total ? (brokenCount / total) * 100 : 0;

  const byError = {};
  for (const row of broken) {
    const k = row.error || "unknown";
    byError[k] = (byError[k] || 0) + 1;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    catalogPath: "public/data/menswear-catalog.json",
    totalChecked: total,
    brokenCount,
    okCount: total - brokenCount,
    percentBroken: Number(pctBroken.toFixed(2)),
    elapsedMs,
    concurrency: opts.concurrency,
    timeoutMs: opts.timeout,
    deep: opts.deep,
    byError,
    broken,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));

  console.log("— Summary —");
  console.log(`  total checked: ${total}`);
  console.log(`  ok:            ${report.okCount}`);
  console.log(`  broken:        ${brokenCount} (${report.percentBroken}%)`);
  console.log(`  elapsed:       ${(elapsedMs / 1000).toFixed(1)}s`);
  console.log("  by error:", byError);
  console.log(`  wrote: ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
