// visualization/imageGenerator.js
// ✅ Updated for Node.js v22+ stability
// ✅ Removes node-fetch (uses built-in fetch)
// ✅ Retry wrapper is Abort-safe (new AbortController per attempt)
// ✅ Drains failed responses to avoid dangling streams
// ✅ Keeps your existing prompt/object/edit-lock logic intact

// ❌ REMOVE node-fetch on Node 22
// import fetch from "node-fetch";

const HF_API_KEY = process.env.HF_API_KEY;

const HF_IMAGE_ENDPOINT =
  "https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-base-1.0";

/* ===============================
   💤 SLEEP
   =============================== */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ===============================
   🔁 RETRY WRAPPER (NETWORK + 5xx + 429)
   ✅ New AbortController per attempt
   ✅ Per-attempt timeout
   ✅ Drains response bodies on retry
   =============================== */
async function fetchWithRetry(
  url,
  options = {},
  {
    retries = 2,
    timeoutMs = 120_000, // HF can be slow; 90s sometimes aborts too early
    baseBackoffMs = 1500,
  } = {}
) {
  let lastErr = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Retry for transient HTTP errors
      if (!res.ok && attempt < retries && (res.status === 429 || res.status >= 500)) {
        // IMPORTANT: Drain body so the connection isn't left hanging
        try {
          await res.arrayBuffer();
        } catch {}

        const waitMs = baseBackoffMs * (attempt + 1);
        console.warn(
          `⚠️ HF transient HTTP ${res.status}, retrying in ${waitMs}ms...`
        );
        await sleep(waitMs);
        continue;
      }

      return res;
    } catch (err) {
      clearTimeout(timeoutId);
      lastErr = err;

      const msg = String(err?.message || "");
      const isAbort =
        err?.name === "AbortError" ||
        err?.type === "aborted" ||
        /aborted|timeout/i.test(msg);

      const isNetwork =
        isAbort ||
        /ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|network/i.test(msg);

      if (attempt < retries && isNetwork) {
        const waitMs = baseBackoffMs * (attempt + 1);
        console.warn("⚠️ HF image network/abort error, retrying...", msg);
        await sleep(waitMs);
        continue;
      }

      throw err;
    }
  }

  throw lastErr || new Error("HF request failed");
}

/* ===============================
   🧼 INPUT VALIDATION
   =============================== */
function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} must be a non-empty string`);
  }
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function toSnakeRoomType(t = "") {
  return String(t || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
}

/* ===============================
   ✅ INTERIOR OBJECTS (your existing)
   =============================== */
export const ROOM_OBJECT_PRESETS = {
  living_room: ["sofa", "coffee table", "tv console", "television", "area rug"],
  bedroom: ["bed", "nightstand", "wardrobe"],
  home_office: ["desk", "office chair"],
  kitchen: ["base cabinets", "countertop", "sink", "stove"],
  dining_room: ["dining table", "dining chairs"],
  bathroom: ["toilet", "vanity", "mirror", "shower"],
  cafe: ["service counter", "tables", "chairs"],
  retail_store: ["display racks", "display shelves", "cashier counter"],
  generic: ["primary seating", "side table", "lighting fixture"],
};

function normalizeInteriorPrompt(prompt) {
  const prefix =
    "high quality interior photograph, realistic architectural visualization, correct perspective, realistic scale, ";
  return `${prefix}${prompt}`;
}

function buildNegativePrompt(extra = "") {
  const base = [
    "low quality",
    "blurry",
    "distorted",
    "cartoon",
    "illustration",
    "sketch",
    "text",
    "watermark",
    "logo",
    "deformed",
    "duplicate furniture",
    "extra furniture",
    "missing furniture",
    "floating furniture",
    "warped walls",
    "broken perspective",
    "wrong room layout",
    "incorrect furniture placement",
    "different camera angle",
    "different viewpoint",
    "different composition",
    "wide angle lens",
    "fisheye",
    "zoomed in",
    "cropped",
    "tilted camera",
    "new room",
    "different room",
    "oversaturated random colors",
    "messy clutter",
  ].join(", ");
  return extra ? `${base}, ${extra}` : base;
}

function uniqClean(list) {
  return Array.from(
    new Set(
      (Array.isArray(list) ? list : [])
        .map((x) => String(x || "").trim())
        .filter(Boolean)
        .map((x) => x.toLowerCase())
    )
  );
}

function buildObjectConstraints({
  roomType = "generic",
  requiredObjects = [],
  optionalObjects = [],
  avoidObjects = [],
} = {}) {
  const rt = toSnakeRoomType(roomType || "generic");
  const preset = ROOM_OBJECT_PRESETS[rt] || ROOM_OBJECT_PRESETS.generic;

  const required = uniqClean([...preset, ...requiredObjects]).slice(0, 14);
  const optional = uniqClean(optionalObjects).slice(0, 12);
  const avoid = uniqClean(avoidObjects).slice(0, 18);

  const requiredBlock = required.length
    ? `
REQUIRED OBJECTS (MUST APPEAR + MUST BE VISIBLE IN FRAME):
${required.map((o) => `- ${o}`).join("\n")}

VISIBILITY RULES:
- Keep the same framing so REQUIRED OBJECTS remain visible.
- Do not crop the main furniture.
`.trim()
    : "";

  const optionalBlock = optional.length
    ? `
OPTIONAL OBJECTS (ADD IF NATURAL, DO NOT CROWD):
${optional.map((o) => `- ${o}`).join("\n")}
`.trim()
    : "";

  const avoidBlock = avoid.length
    ? `
FORBIDDEN OBJECTS (MUST NOT APPEAR):
${avoid.map((o) => `- ${o}`).join("\n")}
`.trim()
    : "";

  const negativeExtra = avoid.length ? avoid.join(", ") : "";

  return { requiredBlock, optionalBlock, avoidBlock, negativeExtra };
}

/* ===============================
   ✅ IMAGE INPUT NORMALIZER
   =============================== */
function normalizeInitImage(initImage) {
  if (!initImage) return null;

  if (Buffer.isBuffer(initImage)) {
    return initImage.toString("base64").trim();
  }

  if (typeof initImage === "string") {
    const s = initImage.trim();

    if (s.startsWith("data:image/")) {
      return s.replace(/^data:image\/\w+;base64,/, "").trim();
    }

    if (/^[A-Za-z0-9+/=\s]+$/.test(s) && s.length > 100) {
      return s.replace(/\s/g, "");
    }
  }

  return null;
}

/* ===============================
   ✅ EDIT PROMPT LOCK
   Keeps same angle/layout and only applies requested change
   =============================== */
function buildEditLockedPrompt(userPrompt) {
  return [
    "IMPORTANT EDIT RULES:",
    "- Preserve the same room, same furniture positions, same layout, same camera angle, same composition.",
    "- Do not change viewpoint, do not crop/zoom, do not rearrange furniture unless explicitly asked.",
    "- Only apply the requested modification below.",
    "",
    `REQUESTED MODIFICATION: ${userPrompt}`,
  ].join("\n");
}

/**
 * ✅ generateInteriorImage
 */
export async function generateInteriorImage({
  prompt,

  mode = "generate", // "generate" | "edit"
  initImage = null,

  // Optional: specify edit type to auto-tune strength
  // "lighting" | "style" | "layout" | "general"
  editType = "general",

  strength,

  roomType = "generic",
  requiredObjects = [],
  optionalObjects = [],
  avoidObjects = [],

  // Controls
  guidanceScale = 7.0, // slightly lower for edit stability
  steps = 30, // fewer steps reduces drift
  width = 1024,
  height = 1024,
  seed = undefined,

  negativePrompt = "",
} = {}) {
  if (!HF_API_KEY) throw new Error("HF_API_KEY is missing");
  assertNonEmptyString(prompt, "prompt");

  const normalizedMode = String(mode || "generate").toLowerCase();
  const wantsEdit = normalizedMode === "edit" || normalizedMode === "update";

  const cleanImage = normalizeInitImage(initImage);

  // Only do img2img if mode says edit AND image is valid
  const useImg2Img = wantsEdit && !!cleanImage;

  const obj = buildObjectConstraints({
    roomType,
    requiredObjects,
    optionalObjects,
    avoidObjects,
  });

  // Lock prompt for edits to preserve same layout/angle
  const lockedUserPrompt = useImg2Img ? buildEditLockedPrompt(prompt) : prompt;

  const promptWithObjects = [
    lockedUserPrompt,
    obj.requiredBlock || "",
    obj.optionalBlock || "",
    obj.avoidBlock || "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const finalPrompt = normalizeInteriorPrompt(promptWithObjects);

  // Strength policy:
  const autoEditStrength = (() => {
    const t = String(editType || "general").toLowerCase();
    if (t === "lighting") return 0.18;
    if (t === "style") return 0.28;
    if (t === "layout") return 0.32; // only if you REALLY want layout changes
    return 0.22; // general safe
  })();

  const finalStrength = useImg2Img
    ? clamp(strength ?? autoEditStrength, 0.12, 0.3) // tight clamp for same-angle edits
    : clamp(strength ?? 0.85, 0.6, 0.92);

  // Negative prompt: base + caller + forbidden objects
  const finalNegativePrompt = buildNegativePrompt(
    [negativePrompt, obj.negativeExtra].filter(Boolean).join(", ")
  );

  const parametersCommon = {
    guidance_scale: guidanceScale,
    num_inference_steps: steps,
    width,
    height,
    ...(typeof seed === "number" ? { seed } : {}),
    negative_prompt: finalNegativePrompt,
  };

  const body = useImg2Img
    ? {
        inputs: {
          prompt: finalPrompt,
          image: cleanImage,
        },
        parameters: {
          ...parametersCommon,
          strength: finalStrength,
        },
        output_format: "png",
      }
    : {
        inputs: finalPrompt,
        parameters: {
          ...parametersCommon,
        },
        output_format: "png",
      };

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
      },
      {
        retries: 2,
        timeoutMs: 120_000,
        baseBackoffMs: 1500,
      }
    );
  } catch (err) {
    console.error("❌ HF IMAGE NETWORK ERROR:", err?.message || err);
    throw new Error("Image generation network failure");
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("❌ HF IMAGE ERROR:", {
      status: response.status,
      statusText: response.statusText,
      body: errText,
      mode: normalizedMode,
      useImg2Img,
      strength: finalStrength,
      guidanceScale,
      steps,
      width,
      height,
      seed,
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error("HF image auth failed (check HF_API_KEY permissions)");
    }
    if (response.status === 429) {
      throw new Error("HF image rate-limited (try again later)");
    }
    throw new Error(`Image generation failed: ${response.status} ${response.statusText}`);
  }

  // Read image bytes
  const buffer = await response.arrayBuffer();
  if (!buffer || buffer.byteLength < 2000) {
    throw new Error("Image generation returned an invalid image buffer");
  }

  return `data:image/png;base64,${Buffer.from(buffer).toString("base64")}`;
}
