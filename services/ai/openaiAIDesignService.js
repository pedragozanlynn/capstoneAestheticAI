// services/openaiAIDesignService.js
// ✅ UPDATED: Gemini removed (cleaner + no dead code)
// ✅ DESIGN images use OpenAI Images API (gpt-image-1)
// ✅ CUSTOMIZE keeps true edit via Responses API image_generation tool (same room reference)
// ✅ NEW: AI IMAGE DETECTOR (blocks CUSTOMIZE if image is NOT a room/space)
// ✅ SPEED: shorter timeouts + lightweight prompts + small retries
// IMPORTANT: client keys are NOT secure for production.

const OPENAI_BASE = "https://api.openai.com/v1";

const DEFAULT_TEXT_MODEL = "gpt-4o-mini";
const DEFAULT_IMAGE_MODEL = "gpt-image-1"; // /images/generations
const DEFAULT_IMAGE_HOST_MODEL = "gpt-4.1-mini"; // Responses API host for image tool

// ✅ Vision detector model (must support input_image)
const DEFAULT_VISION_MODEL = "gpt-4.1-mini";

// ✅ Speed: use smaller timeouts (mobile friendly but faster fail/retry)
const REPORT_TIMEOUT_MS = 45_000;
const IMAGE_TIMEOUT_MS = 60_000;
const EDIT_TIMEOUT_MS = 75_000;
const DETECT_TIMEOUT_MS = 25_000;

// ------------------------------
// Extractors (OpenAI Responses API)
// ------------------------------
export const extractOutputText = (json) => {
  const direct = typeof json?.output_text === "string" ? json.output_text : "";
  if (direct.trim()) return direct;

  const out = Array.isArray(json?.output) ? json.output : [];
  for (const item of out) {
    const c = Array.isArray(item?.content) ? item.content : [];
    for (const part of c) {
      if (part?.type === "output_text" && typeof part?.text === "string") {
        return part.text;
      }
    }
  }
  return "";
};

// ✅ More robust: supports string base64 OR url OR nested result objects
export const extractImageBase64 = (json) => {
  const out = Array.isArray(json?.output) ? json.output : [];
  const calls = out.filter((x) => x?.type === "image_generation_call");
  const first = calls?.[0];
  const r = first?.result;

  if (typeof r === "string" && r.trim()) return r.trim();

  if (r && typeof r === "object") {
    const b64 =
      r?.b64_json ||
      r?.base64 ||
      r?.data?.[0]?.b64_json ||
      r?.data?.[0]?.base64 ||
      null;

    if (typeof b64 === "string" && b64.trim()) return b64.trim();

    const url = r?.url || r?.data?.[0]?.url || null;
    if (typeof url === "string" && url.trim()) return url.trim();
  }

  return null;
};

// ------------------------------
// Normalize backend image to usable URI
// ------------------------------
export const normalizeBackendImageToUri = (imageData) => {
  if (!imageData) return null;

  if (typeof imageData === "string") {
    const s = imageData.trim();
    if (!s || s === "null" || s === "undefined") return null;

    // raw base64 (no prefix)
    if (!s.startsWith("data:image/") && !s.startsWith("http") && s.length > 100) {
      return `data:image/png;base64,${s}`;
    }
    return s;
  }

  if (typeof imageData === "object") {
    const b64 = imageData?.base64 || imageData?.Base64 || imageData?.data || null;
    if (typeof b64 === "string" && b64.trim()) {
      return b64.startsWith("data:image/") ? b64 : `data:image/png;base64,${b64}`;
    }
  }

  return null;
};

// ------------------------------
// Merge payload helper
// ------------------------------
export const mergeBackendPayload = (result) => {
  const a = result?.data && typeof result.data === "object" ? result.data : {};
  const b = result && typeof result === "object" ? result : {};
  return { ...b, ...a };
};

// ------------------------------
// Helpers: timeout + error parsing + retries
// ------------------------------
const fetchWithTimeout = async (url, options = {}, timeoutMs) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const readErrorMessage = async (res) => {
  const status = res?.status;
  let errJson = null;
  let errText = "";

  try {
    errJson = await res.json();
  } catch {
    try {
      errText = await res.text();
    } catch {
      errText = "";
    }
  }

  const msg = errJson?.error?.message || errJson?.message || errText || `HTTP ${status}`;
  return { status, msg, raw: errJson || errText };
};

const mapBlockedReason = (status, msg) => {
  const lower = String(msg || "").toLowerCase();

  if (status === 401 || lower.includes("invalid_api_key")) return "INVALID_KEY";

  // ✅ ADD THIS:
  if (status === 402 || lower.includes("insufficient_quota") || lower.includes("quota")) {
    return "INSUFFICIENT_QUOTA";
  }

  if (status === 403 || lower.includes("insufficient") || lower.includes("billing"))
    return "BILLING_OR_PERMISSIONS";
  if (status === 404 || (lower.includes("model") && lower.includes("not"))) return "MODEL_NOT_FOUND";
  if (status === 429 || lower.includes("rate limit")) return "RATE_LIMIT";
  if (lower.includes("must be verified") || lower.includes("verify organization"))
    return "ORG_NOT_VERIFIED";
  if (lower.includes("timeout") || lower.includes("aborted")) return "TIMEOUT";
  if (status >= 500) return "SERVER_ERROR";
  return "OPENAI_ERROR";
};

// ✅ retry for transient failures (429 / 5xx / network abort)
const shouldRetry = (status, msg) => {
  const lower = String(msg || "").toLowerCase();
  if (status === 429) return true;
  if (status >= 500) return true;
  if (lower.includes("network") || lower.includes("timeout") || lower.includes("aborted")) return true;
  return false;
};

const fetchJsonWithRetry = async (url, options, timeoutMs, maxTries = 2) => {
  let lastErr = null;

  for (let attempt = 1; attempt <= maxTries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, options, timeoutMs);

      if (!res.ok) {
        const { status, msg, raw } = await readErrorMessage(res);
        const err = new Error(msg || `HTTP ${status}`);
        err.status = status;
        err.raw = raw;

        if (attempt < maxTries && shouldRetry(status, msg)) {
          await sleep(450 * attempt);
          lastErr = err;
          continue;
        }
        throw err;
      }

      return await res.json();
    } catch (e) {
      const msg = String(e?.message || e || "Network error");
      const status = Number(e?.status || 0);

      if (attempt < maxTries && shouldRetry(status, msg)) {
        await sleep(450 * attempt);
        lastErr = e;
        continue;
      }
      throw e;
    }
  }

  throw lastErr || new Error("Request failed");
};

// Small utility: shorten prompts for image generation (helps reliability + speed)
const compressPrompt = (s, maxLen = 850) => {
  const t = String(s || "").trim().replace(/\s+/g, " ");
  return t.length > maxLen ? t.slice(0, maxLen) : t;
};

const normalizeBool = (v) => {
  if (v === true) return true;
  if (v === false) return false;
  const s = String(v || "").trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(s)) return true;
  if (["false", "no", "n", "0"].includes(s)) return false;
  return null;
};

// ------------------------------
// ✅ AI IMAGE DETECTOR (ROOM/SPACE ONLY)
// - blocks selfies/faces/objects
// - runs only for CUSTOMIZE
// ------------------------------
export const callOpenAIImageDetector = async ({
  apiKey,
  visionModel = DEFAULT_VISION_MODEL,
  imageUrl,
}) => {
  if (!apiKey) throw new Error("Missing EXPO_PUBLIC_OPENAI_API_KEY");
  if (!imageUrl) return { isRoom: false, reason: "Missing reference image." };

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  // Keep it SHORT for speed; strict schema for stable parse
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      isRoom: { type: "boolean" },
      reason: { type: "string" },
      confidence: { type: "number" },
      detected: {
        type: "string",
        description: "Short label: room | selfie | person | object | outdoor | screenshot | unclear",
      },
    },
    required: ["isRoom", "reason", "confidence", "detected"],
  };

  const body = {
    model: String(visionModel || DEFAULT_VISION_MODEL),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              "Task: Determine if the image is an interior room/space suitable for interior design (e.g., bedroom, living room, kitchen, office).\n" +
              "Return STRICT JSON by schema.\n" +
              "Rules:\n" +
              "- isRoom=true only if it clearly shows an interior space (walls/floor/ceiling/furniture context).\n" +
              "- isRoom=false for selfies, close-up faces, people-only photos, random objects, pets, memes, screenshots, outdoor scenes.\n" +
              "- confidence is 0..1.\n",
          },
          { type: "input_image", image_url: String(imageUrl) },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "room_detector",
        strict: true,
        schema,
      },
    },
  };

  let json;
  try {
    json = await fetchJsonWithRetry(
      `${OPENAI_BASE}/responses`,
      { method: "POST", headers, body: JSON.stringify(body) },
      DETECT_TIMEOUT_MS,
      2
    );
  } catch (e) {
    // If detector fails, DO NOT hard block (avoid breaking UX); just allow flow.
    return {
      isRoom: true,
      reason: "Detector unavailable; allowing request.",
      confidence: 0.0,
      detected: "unclear",
      blockedReason: mapBlockedReason(Number(e?.status || 0), String(e?.message || e || "")),
    };
  }

  const txt = extractOutputText(json);
  try {
    const parsed = JSON.parse(txt);
    const isRoom = normalizeBool(parsed?.isRoom);
    return {
      isRoom: isRoom === true,
      reason: String(parsed?.reason || "").trim() || (isRoom ? "Room detected." : "Not a room."),
      confidence: Number(parsed?.confidence || 0),
      detected: String(parsed?.detected || "unclear"),
    };
  } catch {
    // If parse fails, allow
    return {
      isRoom: true,
      reason: "Detector parse failed; allowing request.",
      confidence: 0.0,
      detected: "unclear",
    };
  }
};

// ------------------------------
// OpenAI report call (json_schema)
// ------------------------------
export const callOpenAIReport = async ({
  apiKey,
  textModel,
  message,
  proFlag,
  imageUrl,
  previousResponseId,
}) => {
  if (!apiKey) throw new Error("Missing EXPO_PUBLIC_OPENAI_API_KEY");

  const finalTextModel = String(textModel || "").trim() || DEFAULT_TEXT_MODEL;

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      explanation: { type: "string" },
      tips: { type: "array", items: { type: "string" } },
      palette: {
        type: ["object", "null"],
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          colors: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: { name: { type: "string" }, hex: { type: "string" } },
              required: ["name", "hex"],
            },
          },
        },
        required: ["name", "colors"],
      },
      layoutSuggestions: { type: "array", items: { type: "string" } },
      furnitureMatches: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            placement: { type: "string" },
            query: { type: "string" },
            links: {
              type: "object",
              additionalProperties: false,
              properties: {
                shopee: { type: "string" },
                lazada: { type: "string" },
                ikea: { type: "string" },
                marketplace: { type: "string" },
              },
              required: ["shopee", "lazada", "ikea", "marketplace"],
            },
          },
          required: ["name", "placement", "query", "links"],
        },
      },
      imagePrompt: { type: "string" },
    },
    required: ["explanation", "tips", "palette", "layoutSuggestions", "furnitureMatches", "imagePrompt"],
  };

  const content = [
    {
      type: "input_text",
      text:
        `Generate a short interior design report.\n` +
        `User: ${String(message || "").trim()}\n` +
        `Premium: ${proFlag ? "YES" : "NO"}\n` +
        `Return STRICT JSON by schema.\n` +
        `Rules:\n` +
        `- explanation: 2-5 sentences.\n` +
        `- tips: 5-8 bullets.\n` +
        `- palette: name + up to 6 colors (hex).\n` +
        `- imagePrompt: ONE paragraph for photorealistic render; eye-level wide shot; no text/watermark.\n` +
        `- If NOT premium: layoutSuggestions=[], furnitureMatches=[].\n` +
        `- If premium: layoutSuggestions 5-8; furnitureMatches 3-6 w/ PH links.\n`,
    },
  ];

  if (imageUrl) content.push({ type: "input_image", image_url: String(imageUrl) });

  const body = {
    model: finalTextModel,
    input: [{ role: "user", content }],
    text: {
      format: {
        type: "json_schema",
        name: "aesthetic_ai_report",
        strict: true,
        schema,
      },
    },
  };

  if (previousResponseId) body.previous_response_id = String(previousResponseId);

  let json;
  try {
    json = await fetchJsonWithRetry(
      `${OPENAI_BASE}/responses`,
      { method: "POST", headers, body: JSON.stringify(body) },
      REPORT_TIMEOUT_MS,
      2
    );
  } catch (e) {
    const msg = String(e?.message || e || "Report request failed");
    const reason = mapBlockedReason(Number(e?.status || 0), msg);
    const err = new Error(`OpenAI report failed: ${msg}`);
    err.blockedReason = reason;
    throw err;
  }

  const txt = extractOutputText(json);

  let parsed = null;
  try {
    parsed = JSON.parse(txt);
  } catch {
    parsed = {
      explanation: "Design report is currently unavailable. Please try again.",
      tips: [],
      palette: null,
      layoutSuggestions: [],
      furnitureMatches: [],
      imagePrompt: String(message || "").trim(),
    };
  }

  if (!proFlag) {
    parsed.layoutSuggestions = [];
    parsed.furnitureMatches = [];
  }

  if (!parsed.imagePrompt || !String(parsed.imagePrompt).trim()) {
    parsed.imagePrompt = String(message || "").trim();
  }

  return { parsed, responseId: json?.id || null };
};

// ------------------------------
// ✅ OpenAI Images API (DESIGN)
// returns { image: <b64_or_url>, kind: "b64" | "url" }
// ------------------------------
export const callOpenAIImagesGenerate = async ({
  apiKey,
  prompt,
  imageModel = DEFAULT_IMAGE_MODEL,
  size = "1024x1024",
}) => {
  if (!apiKey) throw new Error("Missing EXPO_PUBLIC_OPENAI_API_KEY");

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const body = {
    model: String(imageModel || DEFAULT_IMAGE_MODEL),
    prompt: compressPrompt(prompt, 850),
    size,
    n: 1,
  };

  let json;
  try {
    json = await fetchJsonWithRetry(
      `${OPENAI_BASE}/images/generations`,
      { method: "POST", headers, body: JSON.stringify(body) },
      IMAGE_TIMEOUT_MS,
      2
    );
  } catch (e) {
    const status = Number(e?.status || 0);
    const msg = String(e?.message || e || "Image generate request failed");
  
    const raw = e?.raw ?? null;
    const errorDetail =
      raw == null
        ? msg
        : typeof raw === "string"
        ? raw
        : JSON.stringify(raw);
  
    return {
      image: null,
      kind: null,
      blockedReason: mapBlockedReason(status, msg),
      errorDetail: `status=${status} | ${errorDetail}`.slice(0, 900),
    };
  }
  const b64 = json?.data?.[0]?.b64_json || null;
  if (typeof b64 === "string" && b64.trim()) return { image: b64.trim(), kind: "b64" };

  const url = json?.data?.[0]?.url || null;
  if (typeof url === "string" && url.trim()) return { image: url.trim(), kind: "url" };

  return { image: null, kind: null, blockedReason: "IMAGE_EMPTY" };
};

// ------------------------------
// OpenAI image EDIT (CUSTOMIZE) via Responses API tool
// ------------------------------
export const callOpenAIImageEdit = async ({
  apiKey,
  hostModel,
  message,
  imageUrl,
  previousResponseId,
}) => {
  if (!apiKey) throw new Error("Missing EXPO_PUBLIC_OPENAI_API_KEY");
  if (!imageUrl) return { base64: null, responseId: null, blockedReason: "MISSING_REFERENCE_IMAGE" };

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const finalHostModel = String(hostModel || "").trim() || DEFAULT_IMAGE_HOST_MODEL;

  // ✅ IMPORTANT: Remove action to avoid tool errors on Responses API
  const toolConfig = { type: "image_generation" };

  const input = [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text:
            `Edit this room photo.\n` +
            `Instruction: ${String(message || "").trim()}\n` +
            `Rules:\n` +
            `- Keep SAME camera angle/perspective and SAME room layout/architecture.\n` +
            `- Only change materials/colors/decor/lighting unless user explicitly says move items.\n` +
            `- Photorealistic. No text/watermark.\n`,
        },
        { type: "input_image", image_url: String(imageUrl) },
      ],
    },
  ];

  const body = {
    model: finalHostModel,
    input,
    tools: [toolConfig],
    tool_choice: { type: "image_generation" },
  };

  if (previousResponseId) body.previous_response_id = String(previousResponseId);

  let json;
  try {
    json = await fetchJsonWithRetry(
      `${OPENAI_BASE}/responses`,
      { method: "POST", headers, body: JSON.stringify(body) },
      EDIT_TIMEOUT_MS,
      2
    );
  } catch (e) {
    const msg = String(e?.message || e || "Image edit request failed");
    return { base64: null, responseId: null, blockedReason: mapBlockedReason(Number(e?.status || 0), msg) };
  }

  const b64OrUrl = extractImageBase64(json);
  if (!b64OrUrl) {
    return { base64: null, responseId: json?.id || null, blockedReason: "EDIT_EMPTY" };
  }

  return { base64: b64OrUrl, responseId: json?.id || null };
};

// ------------------------------
// Single public function you call from screen
// ------------------------------
export const callAIDesignAPI = async ({
  apiKey,
  textModel,
  message,
  mode,
  image,
  sessionId,
  isPro,
  imageModel,
  useOpenAIForCustomize = true,
  imageSize = "1024x1024",
  // optional: allow UI to skip detection (default false)
  skipRoomDetection = false,
}) => {
  const refUrl = image ? String(image) : null;

  const MODE = { DESIGN: "design", CUSTOMIZE: "customize" };
  const wantsTrueEdit = useOpenAIForCustomize && mode === MODE.CUSTOMIZE && !!refUrl;

  // ✅ NEW: room/space detection (CUSTOMIZE only)
  if (wantsTrueEdit && !skipRoomDetection) {
    const det = await callOpenAIImageDetector({
      apiKey,
      visionModel: DEFAULT_VISION_MODEL,
      imageUrl: refUrl,
    });

    if (det?.isRoom === false) {
      const reason =
        det?.detected === "selfie" || det?.detected === "person"
          ? "Detected a selfie/person image, not a room."
          : det?.reason || "The uploaded photo does not look like a room/space.";

      return {
        data: {
          explanation:
            "I can only customize a REAL room/space photo.\n\n" +
            "Please upload a picture that clearly shows the room (walls/floor + furniture).\n" +
            `Why blocked: ${reason}`,
          tips: [],
          palette: null,
          layoutSuggestions: [],
          furnitureMatches: [],
          imagePrompt: String(message || "").trim(),
        },
        image: null,
        sessionId: sessionId || null,
        blockedReason: "NOT_ROOM_IMAGE",
        detector: det,
      };
    }
  }

  // 1) Report (always)
  let report;
  try {
    report = await callOpenAIReport({
      apiKey,
      textModel,
      message,
      proFlag: isPro,
      imageUrl: refUrl,
      previousResponseId: sessionId || null,
    });
  } catch (e) {
    const msg = String(e?.message || e || "OpenAI report failed");
    return {
      data: {
        explanation: msg,
        tips: [],
        palette: null,
        layoutSuggestions: [],
        furnitureMatches: [],
        imagePrompt: String(message || "").trim(),
      },
      image: null,
      sessionId: sessionId || null,
      blockedReason: e?.blockedReason || "REPORT_FAILED",
    };
  }

  const imagePrompt = compressPrompt(
    String(report?.parsed?.imagePrompt || "").trim() || String(message || "").trim(),
    850
  );

  let nextSessionId = report?.responseId || sessionId || null;

  // 2) CUSTOMIZE: true edit only (no fallbacks)
  if (wantsTrueEdit) {
    const img = await callOpenAIImageEdit({
      apiKey,
      hostModel: DEFAULT_IMAGE_HOST_MODEL,
      message,
      imageUrl: refUrl,
      previousResponseId: report?.responseId || sessionId || null,
    });

    if (!img?.base64) {
      return {
        data: report?.parsed || {},
        image: null,
        sessionId: nextSessionId,
        blockedReason: img?.blockedReason || "EDIT_FAILED",
      };
    }

    nextSessionId = img?.responseId || nextSessionId;

    return {
      data: report?.parsed || {},
      image: img?.base64 || null, // can be base64 OR url
      sessionId: nextSessionId,
    };
  }

  // 3) DESIGN: OpenAI Images API only
  const img = await callOpenAIImagesGenerate({
    apiKey,
    prompt: imagePrompt,
    imageModel: String(imageModel || "").trim() || DEFAULT_IMAGE_MODEL,
    size: imageSize,
  });

  if (!img?.image) {
    return {
      data: report?.parsed || {},
      image: null,
      sessionId: nextSessionId,
      blockedReason: img?.blockedReason || "IMAGE_GENERATE_FAILED",
      errorDetail: img?.errorDetail || null,
    };
  }

  const outImage = img.kind === "b64" ? `data:image/png;base64,${img.image}` : img.image;

  return {
    data: report?.parsed || {},
    image: outImage,
    sessionId: nextSessionId,
  };
};
