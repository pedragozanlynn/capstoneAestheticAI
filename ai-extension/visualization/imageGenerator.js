import fetch from "node-fetch";

const HF_API_KEY = process.env.HF_API_KEY;

// ✅ SDXL via HF Router (supported inference endpoint for images)
const HF_IMAGE_ENDPOINT =
  "https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-base-1.0";

/* ===============================
   🔁 RETRY WRAPPER (NETWORK + 5xx)
   =============================== */
async function fetchWithRetry(url, options, retries = 2) {
  try {
    const res = await fetch(url, options);

    // Retry only on transient errors
    if (!res.ok && retries > 0 && (res.status === 429 || res.status >= 500)) {
      const waitMs = 1500 * (3 - retries);
      console.warn(`⚠️ HF image transient error ${res.status}, retrying in ${waitMs}ms...`);
      await sleep(waitMs);
      return fetchWithRetry(url, options, retries - 1);
    }

    return res;
  } catch (err) {
    if (retries <= 0) throw err;
    const waitMs = 1500 * (3 - retries);
    console.warn("⚠️ HF image network error, retrying...", err?.message || err);
    await sleep(waitMs);
    return fetchWithRetry(url, options, retries - 1);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ===============================
   🧼 INPUT VALIDATION
   =============================== */
function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} must be a non-empty string`);
  }
}

/* ===============================
   ✅ ADD: INTERNAL STYLE-PRESERVING GUARDRAILS
   (Does not change your existing logic; only prepends prompt + optional overrides)
   =============================== */
function normalizeInteriorPrompt(prompt) {
  // Preserve camera/layout while allowing prompt-driven styling.
  // Kept lightweight to avoid overpowering user intent.
  const prefix =
    "interior photo, same room geometry, same camera angle, preserve layout, keep walls and openings, realistic materials, ";
  return `${prefix}${prompt}`;
}

// Optional: allow callers to enforce "keep identity/layout" more strongly without rewriting prompt everywhere
function buildNegativePrompt(extra = "") {
  const base =
    "low quality, blurry, distorted, cartoon, illustration, sketch, text, watermark, logo, deformed, duplicated objects, extra furniture, wrong room layout, warped walls, broken perspective";
  return extra ? `${base}, ${extra}` : base;
}

/**
 * Generate interior image using SDXL (HF Router)
 *
 * Returns: data URL (png base64)
 *
 * Notes:
 * - HF SDXL endpoint expects raw image bytes (arrayBuffer) response.
 * - For img2img, HF supports `inputs: { prompt, image }` with base64 image.
 * - We add negative_prompt + output_format to improve consistency.
 */
export async function generateInteriorImage({
  prompt,
  initImage = null,
  strength,
  // Optional overrides:
  guidanceScale = 7.5,
  negativePrompt = "low quality, blurry, distorted, cartoon, illustration, sketch, text, watermark, logo, deformed",
} = {}) {
  if (!HF_API_KEY) throw new Error("HF_API_KEY is missing");
  assertNonEmptyString(prompt, "prompt");

  const isEdit = Boolean(initImage);

  /* ===============================
     ✅ ADD: prompt + negativePrompt guardrails (non-breaking)
     =============================== */
  const finalPrompt = normalizeInteriorPrompt(prompt);
  const finalNegativePrompt = buildNegativePrompt(negativePrompt);

  /* ===============================
     🔒 STRENGTH SAFETY
     =============================== */
  const finalStrength = isEdit
    ? clamp(strength ?? 0.18, 0.12, 0.35) // allow a bit more for edits if needed
    : clamp(strength ?? 0.85, 0.65, 0.95);

  /* ===============================
     🖼 INIT IMAGE CLEANUP
     =============================== */
  const cleanImage =
    isEdit && typeof initImage === "string"
      ? initImage.replace(/^data:image\/\w+;base64,/, "").trim()
      : null;

  // If isEdit but initImage invalid, fall back to text2img
  const useImg2Img = isEdit && !!cleanImage;

  /* ===============================
     📦 REQUEST BODY
     =============================== */
  const body = useImg2Img
    ? {
        inputs: {
          prompt: finalPrompt, // ✅ ADD: use normalized prompt
          image: cleanImage,
          negative_prompt: finalNegativePrompt, // ✅ ADD: stronger negatives
        },
        parameters: {
          strength: finalStrength,
          guidance_scale: guidanceScale,
          // Some HF providers accept this, harmless if ignored:
          num_inference_steps: 30,
        },
        // Some providers accept output_format (harmless if ignored):
        output_format: "png",
      }
    : {
        inputs: finalPrompt, // ✅ ADD: use normalized prompt
        parameters: {
          guidance_scale: guidanceScale,
          num_inference_steps: 30,
          // Some providers accept negative_prompt in parameters for text2img:
          negative_prompt: finalNegativePrompt, // ✅ ADD: stronger negatives
        },
        output_format: "png",
      };

  /* ===============================
     ⏱ TIMEOUT PROTECTION
     =============================== */
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000); // 90s for SDXL

  let response;
  try {
    response = await fetchWithRetry(
      HF_IMAGE_ENDPOINT,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${HF_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "image/png",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
      2
    );
  } catch (err) {
    clearTimeout(timeout);
    console.error("❌ HF IMAGE NETWORK ERROR:", err?.message || err);
    throw new Error("Image generation network failure");
  } finally {
    clearTimeout(timeout);
  }

  /* ===============================
     ❌ HF ERROR RESPONSE (LOG BODY)
     =============================== */
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("❌ HF IMAGE ERROR:", {
      status: response.status,
      statusText: response.statusText,
      body: errText,
      strength: finalStrength,
      isEdit: useImg2Img,
    });

    // Helpful error messages
    if (response.status === 401 || response.status === 403) {
      throw new Error("HF image auth failed (check HF_API_KEY permissions)");
    }
    if (response.status === 429) {
      throw new Error("HF image rate-limited (try again later)");
    }

    throw new Error(`Image generation failed: ${response.status} ${response.statusText}`);
  }

  /* ===============================
     ✅ SUCCESS (BUFFER -> base64 png)
     =============================== */
  const buffer = await response.arrayBuffer();

  if (!buffer || buffer.byteLength < 2000) {
    // Sometimes HF returns tiny buffers on provider errors
    throw new Error("Image generation returned an invalid image buffer");
  }

  return `data:image/png;base64,${Buffer.from(buffer).toString("base64")}`;
}

/* ===============================
   Helpers
   =============================== */
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
