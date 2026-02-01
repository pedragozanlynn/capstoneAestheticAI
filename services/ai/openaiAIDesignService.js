// services/openaiAIDesignService.js
// OpenAI Responses API: JSON report + image_generation tool
// IMPORTANT: client keys are NOT secure for production.

const OPENAI_BASE = "https://api.openai.com/v1";
const DEFAULT_TEXT_MODEL = "gpt-4o-mini"; // ✅ safest default for most keys
const DEFAULT_TIMEOUT_MS = 90_000; // ✅ mobile networks may be slow

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

  // common: string base64
  if (typeof r === "string" && r.trim()) return r.trim();

  // sometimes tool returns an object
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
      return `data:image/jpeg;base64,${s}`;
    }
    return s;
  }

  if (typeof imageData === "object") {
    const b64 = imageData?.base64 || imageData?.Base64 || imageData?.data || null;
    if (typeof b64 === "string" && b64.trim()) {
      return b64.startsWith("data:image/") ? b64 : `data:image/jpeg;base64,${b64}`;
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
// Helpers: timeout + error parsing
// ------------------------------
const fetchWithTimeout = async (url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
};

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

  const msg =
    errJson?.error?.message ||
    errJson?.message ||
    errText ||
    `HTTP ${status}`;

  return { status, msg, raw: errJson || errText };
};

const mapBlockedReason = (status, msg) => {
  const lower = String(msg || "").toLowerCase();
  if (status === 401 || lower.includes("invalid_api_key")) return "INVALID_KEY";
  if (status === 403 || lower.includes("insufficient") || lower.includes("billing"))
    return "BILLING_OR_PERMISSIONS";
  if (status === 404 || lower.includes("model") && lower.includes("not"))
    return "MODEL_NOT_FOUND";
  if (status === 429 || lower.includes("rate limit")) return "RATE_LIMIT";
  if (lower.includes("must be verified") || lower.includes("verify organization"))
    return "ORG_NOT_VERIFIED";
  if (lower.includes("timeout") || lower.includes("aborted")) return "TIMEOUT";
  return "OPENAI_ERROR";
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
    required: [
      "explanation",
      "tips",
      "palette",
      "layoutSuggestions",
      "furnitureMatches",
      "imagePrompt",
    ],
  };

  const content = [
    {
      type: "input_text",
      text:
        `Task: Provide an interior design report for the user's request.\n` +
        `User request: ${String(message || "").trim()}\n\n` +
        `Rules:\n` +
        `- Keep explanation concise but helpful.\n` +
        `- Provide 5–10 decoration tips.\n` +
        `- Provide a color palette (name + up to 6 colors with hex).\n` +
        `- Provide imagePrompt (ONE paragraph) describing a realistic interior render: room type, style, key materials, lighting (warm/cool), camera angle (eye-level wide shot), cleanliness. No text overlays, no watermarks.\n` +
        `- If NOT premium, layoutSuggestions MUST be [] and furnitureMatches MUST be [].\n` +
        `- If premium, include layoutSuggestions (5–10 bullets) and furnitureMatches (3–8 items) with marketplace search links for PH (Shopee, Lazada, IKEA PH, Facebook Marketplace).\n` +
        `Premium status: ${proFlag ? "PREMIUM" : "FREE"}.`,
    },
  ];

  if (imageUrl) {
    content.push({ type: "input_image", image_url: String(imageUrl) });
  }

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

  let res;
  try {
    res = await fetchWithTimeout(`${OPENAI_BASE}/responses`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (e) {
    const msg = String(e?.message || e || "Network error");
    console.log("❌ OpenAI report fetch failed:", msg);
    const reason = mapBlockedReason(0, msg);
    // throw a readable error
    throw new Error(`OpenAI report failed: ${msg} (${reason})`);
  }

  if (!res.ok) {
    const { status, msg, raw } = await readErrorMessage(res);
    console.log("❌ OpenAI report error:", status, raw);
    const reason = mapBlockedReason(status, msg);
    const err = new Error(`OpenAI report failed (${status}): ${msg}`);
    err.blockedReason = reason;
    throw err;
  }

  const json = await res.json();
  const txt = extractOutputText(json);

  let parsed = null;
  try {
    parsed = JSON.parse(txt);
  } catch (e) {
    console.log("❌ OpenAI report JSON parse failed:", e?.message || e, txt);
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
// OpenAI image generation/edit call (Responses API tool)
// ------------------------------
export const callOpenAIImage = async ({
  apiKey,
  hostModel,
  message,
  mode,
  imageUrl,
  previousResponseId,
}) => {
  if (!apiKey) throw new Error("Missing EXPO_PUBLIC_OPENAI_API_KEY");

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const MODE = { DESIGN: "design", CUSTOMIZE: "customize" };
  const isCustomizeWithRef = mode === MODE.CUSTOMIZE && !!imageUrl;

  const finalHostModel = String(hostModel || "").trim() || DEFAULT_TEXT_MODEL;

  const toolConfig = {
    type: "image_generation",
    action: isCustomizeWithRef ? "edit" : "generate",
  };

  const input = [];

  if (isCustomizeWithRef) {
    input.push({
      role: "user",
      content: [
        {
          type: "input_text",
          text:
            `Edit the provided room image according to the user instruction.\n` +
            `Instruction: ${String(message || "").trim()}\n\n` +
            `Hard Rules (must follow):\n` +
            `- Preserve the exact room layout, architecture, walls, windows/doors, and camera angle.\n` +
            `- Do NOT change perspective, do NOT reposition the camera.\n` +
            `- Keep furniture positions the same unless explicitly requested.\n` +
            `- Only change materials, colors, decor, and lighting within the same geometry.\n` +
            `- Only apply requested styling changes; keep structure identical.\n` +
            `- Photorealistic result; consistent lighting and shadows.\n` +
            `- No text overlays, no watermarks.\n`,
        },
        { type: "input_image", image_url: String(imageUrl) },
      ],
    });
  } else {
    input.push({
      role: "user",
      content: [
        {
          type: "input_text",
          text:
            `Generate a realistic interior design image based on the user request.\n` +
            `Request: ${String(message || "").trim()}\n\n` +
            `Constraints:\n` +
            `- No text overlays, no watermarks.\n` +
            `- High quality, realistic styling.\n` +
            `- Compose a clean, well-lit interior scene.\n`,
        },
      ],
    });
  }

  const body = {
    model: finalHostModel,
    input,
    tools: [toolConfig],
    tool_choice: { type: "image_generation" },
  };

  if (previousResponseId) body.previous_response_id = String(previousResponseId);

  let res;
  try {
    res = await fetchWithTimeout(`${OPENAI_BASE}/responses`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (e) {
    const msg = String(e?.message || e || "Network error");
    console.log("❌ OpenAI image fetch failed:", msg);
    return { base64: null, responseId: null, blockedReason: mapBlockedReason(0, msg) };
  }

  if (!res.ok) {
    const { status, msg, raw } = await readErrorMessage(res);
    console.log("❌ OpenAI image error:", status, raw);
    return { base64: null, responseId: null, blockedReason: mapBlockedReason(status, msg) };
  }

  const json = await res.json();
  const b64OrUrl = extractImageBase64(json);
  return { base64: b64OrUrl || null, responseId: json?.id || null };
};

// ------------------------------
// ✅ Pollinations fallback (NO KEY) - keep for DESIGN only
// ------------------------------
export const callPollinationsImage = async ({ prompt }) => {
  const p = encodeURIComponent(String(prompt || "").trim().replace(/\s+/g, " "));
  if (!p) return { url: null };

  const url = `https://image.pollinations.ai/prompt/${p}?nologo=true&seed=${Date.now()}`;
  return { url };
};

// ------------------------------
// Gemini image generation (disabled / fail fast)
// ------------------------------
export const callGeminiImage = async ({
  apiKey,
  imageModel = "imagen-3.0-generate-002",
  prompt,
}) => {
  if (!apiKey) throw new Error("Missing EXPO_PUBLIC_GEMINI_API_KEY");

  const modelLower = String(imageModel || "").toLowerCase();
  if (modelLower.includes("imagen")) {
    throw new Error(`IMAGEN_NOT_SUPPORTED_ON_GENERATIVELANGUAGE: ${String(imageModel)}`);
  }
  throw new Error("GEMINI_IMAGE_MODEL_NOT_CONFIGURED");
};

// ------------------------------
// Single public function you call from screen
// ------------------------------
export const callAIDesignAPI = async ({
  apiKey,
  textModel,
  geminiApiKey,
  geminiImageModel = "imagen-3.0-generate-002",
  message,
  mode,
  image,
  sessionId,
  isPro,
  imageModel, // kept for backward compatibility
  useOpenAIForCustomize = true,
}) => {
  const refUrl = image ? String(image) : null;

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
    // ✅ surface a structured failure to UI
    const msg = String(e?.message || e || "OpenAI report failed");
    console.log("❌ callAIDesignAPI report failed:", msg);
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

  const imagePrompt =
    String(report?.parsed?.imagePrompt || "").trim() || String(message || "").trim();

  const MODE = { DESIGN: "design", CUSTOMIZE: "customize" };
  const wantsTrueEdit = useOpenAIForCustomize && mode === MODE.CUSTOMIZE && !!refUrl;

  let nextSessionId = report?.responseId || sessionId || null;

  // ✅ CUSTOMIZE: NEVER fallback to generators (they create a different room)
  if (wantsTrueEdit) {
    const img = await callOpenAIImage({
      apiKey,
      hostModel: String(textModel || "").trim() || DEFAULT_TEXT_MODEL,
      message,
      mode,
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
      image: img?.base64 || null,
      sessionId: nextSessionId,
    };
  }

  // ✅ DESIGN: generators allowed (Gemini/Pollinations)
  try {
    const g = await callGeminiImage({
      apiKey: geminiApiKey,
      imageModel: geminiImageModel,
      prompt: imagePrompt,
    });

    if (g?.base64) {
      return { data: report?.parsed || {}, image: g.base64, sessionId: nextSessionId };
    }
  } catch (e) {
    const msg = String(e?.message || e || "");
    if (!msg.startsWith("IMAGEN_NOT_SUPPORTED_ON_GENERATIVELANGUAGE")) {
      console.log("⚠️ Gemini image unavailable. Falling back to Pollinations:", msg);
    }
  }

  const p = await callPollinationsImage({ prompt: imagePrompt });
  return { data: report?.parsed || {}, image: p?.url || null, sessionId: nextSessionId };
};
