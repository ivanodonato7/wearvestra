/**
 * Netlify Function — Vestra AI outfit hero (FASHN Virtual Try-On)
 * Set FASHN_API_KEY in Netlify env (never expose client-side).
 *
 * POST /api/generate-hero
 *
 * Step mode (preferred — one garment per invocation, client chains):
 *   { modelImage, garmentImage, category?, gender? }
 *
 * Batch mode (chains all garments server-side; may hit Netlify timeout):
 *   { garmentImages: string[], gender, baseUrl?, categories?: string[] }
 *
 * Returns: { image, source: "fashn", steps? }
 */
const FASHN_BASE = "https://api.fashn.ai/v1";
const POLL_MS = 2000;
const MAX_POLLS = 20;
const MAX_GARMENTS = 5;

const BASE_MODELS = {
  woman: "/models/model-woman-everyday.jpg",
  man: "/models/model-man-everyday.jpg",
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function absoluteUrl(pathOrUrl, baseUrl) {
  const raw = String(pathOrUrl || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw) || raw.startsWith("data:")) return raw;
  const base = String(baseUrl || "").replace(/\/$/, "");
  if (!base) return raw;
  return `${base}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

function inferCategory(garmentUrl, explicit) {
  if (explicit) return explicit;
  const u = String(garmentUrl || "").toLowerCase();
  if (/trouser|pant|skirt|bottom/.test(u)) return "bottoms";
  if (/blazer|shirt|jacket|knit|top|hoodie/.test(u)) return "tops";
  return "auto";
}

async function runTryOn({ apiKey, modelImage, garmentImage, category }) {
  const runRes = await fetch(`${FASHN_BASE}/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_name: "tryon-v1.6",
      inputs: {
        model_image: modelImage,
        garment_image: garmentImage,
        category: category || "auto",
        garment_photo_type: "auto",
        return_base64: true,
      },
    }),
  });

  const runBody = await runRes.json().catch(() => ({}));
  if (!runRes.ok) {
    const msg = runBody?.error || runBody?.message || `FASHN run HTTP ${runRes.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }

  const predictionId = runBody.id || runBody.prediction_id;
  if (!predictionId) throw new Error("FASHN run missing prediction id");

  for (let i = 0; i < MAX_POLLS; i += 1) {
    await sleep(POLL_MS);
    const statusRes = await fetch(`${FASHN_BASE}/status/${predictionId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const statusBody = await statusRes.json().catch(() => ({}));
    if (!statusRes.ok) {
      throw new Error(statusBody?.error || `FASHN status HTTP ${statusRes.status}`);
    }

    const status = statusBody.status;
    if (status === "completed") {
      const output = statusBody.output;
      const first = Array.isArray(output) ? output[0] : output;
      if (!first) throw new Error("FASHN completed with empty output");
      if (typeof first === "string") return first;
      if (first?.url) return first.url;
      if (first?.base64) {
        return first.base64.startsWith("data:")
          ? first.base64
          : `data:image/jpeg;base64,${first.base64}`;
      }
      throw new Error("FASHN output format not recognized");
    }
    if (status === "failed" || status === "error") {
      const err = statusBody.error || statusBody.message || "try-on failed";
      throw new Error(typeof err === "string" ? err : JSON.stringify(err));
    }
  }
  throw new Error("FASHN try-on timed out");
}

exports.handler = async (event) => {
  const headers = corsHeaders();
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "POST only" }) };
  }

  const apiKey = process.env.FASHN_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({ error: "FASHN_API_KEY not configured" }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const gender = body.gender === "man" ? "man" : "woman";
  const baseUrl =
    body.baseUrl
    || process.env.URL
    || process.env.DEPLOY_PRIME_URL
    || "https://wearvestra.com";

  try {
    // --- Step mode: one garment ---
    if (body.garmentImage) {
      const garmentImage = absoluteUrl(body.garmentImage, baseUrl);
      const modelImage = absoluteUrl(
        body.modelImage || BASE_MODELS[gender],
        baseUrl,
      );
      if (!garmentImage || !modelImage) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "modelImage and garmentImage required" }),
        };
      }
      const image = await runTryOn({
        apiKey,
        modelImage,
        garmentImage,
        category: inferCategory(garmentImage, body.category),
      });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ image, source: "fashn", steps: 1, gender }),
      };
    }

    // --- Batch mode: chain all garments server-side ---
    const garmentImages = (Array.isArray(body.garmentImages) ? body.garmentImages : [])
      .map((u) => absoluteUrl(u, baseUrl))
      .filter(Boolean)
      .slice(0, MAX_GARMENTS);

    if (!garmentImages.length) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "garmentImages or garmentImage required" }),
      };
    }

    const categories = Array.isArray(body.categories) ? body.categories : [];
    let modelImage = absoluteUrl(BASE_MODELS[gender], baseUrl);
    let steps = 0;
    const errors = [];

    for (let i = 0; i < garmentImages.length; i += 1) {
      const garmentImage = garmentImages[i];
      try {
        modelImage = await runTryOn({
          apiKey,
          modelImage,
          garmentImage,
          category: inferCategory(garmentImage, categories[i]),
        });
        steps += 1;
      } catch (stepErr) {
        errors.push({ index: i, error: String(stepErr.message || stepErr) });
      }
    }

    if (!steps) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: "All try-on steps failed",
          detail: errors.slice(0, 5),
        }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        image: modelImage,
        source: "fashn",
        gender,
        steps,
        skipped: errors.length ? errors : undefined,
      }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: String(err.message || err) }),
    };
  }
};
