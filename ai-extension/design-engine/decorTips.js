import fetch from "node-fetch";
import crypto from "crypto";

const HF_API_KEY = process.env.HF_API_KEY;

// ✅ HF Router Chat Completions endpoint
const HF_CHAT_ENDPOINT = "https://router.huggingface.co/v1/chat/completions";

/**
 * ✅ Chat model fallback chain (router-compatible).
 * Reorder based on what works best for your account/plan.
 */
const HF_CHAT_MODELS = [
  "meta-llama/Meta-Llama-3-8B-Instruct",
  "meta-llama/Llama-3.1-8B-Instruct",
  "meta-llama/Llama-3.2-3B-Instruct",
];

/**
 * getDecorTips (UPDATED)
 * ✅ Tips/explanation are forced to align with:
 *   - user prompt (highest priority)
 *   - palette
 *   - layoutSuggestions (AI layout)
 *   - edit mode + image presence (reference vs generated)
 *
 * Notes:
 * - This does NOT "see" the image pixels (no vision model here).
 * - But it will strictly tie outputs to your prompt + palette + layoutSuggestions
 *   so UI text stays consistent with what you asked.
 */
export async function getDecorTips({
  style,
  roomType,
  palette,
  userMessage,
  imagePrompt,
  emphasis = null,

  // ✅ ADD (so tips can align with AI layout + edit flow)
  layoutSuggestions = [],
  isEdit = false,
  inputImage = null, // reference photo (data URL)
  outputImage = null, // generated image (data URL)
} = {}) {
  const safeStyle = style?.name || "Modern";
  const safeRoom = roomType || "room";
  const safeUser = (userMessage || "").trim();

  const paletteNames = Array.isArray(palette?.colors)
    ? palette.colors.map((c) => c?.name).filter(Boolean)
    : [];

  const paletteHex = Array.isArray(palette?.colors)
    ? palette.colors
        .slice(0, 6)
        .map((c) => String(c?.hex || "").toUpperCase())
        .filter(Boolean)
    : [];

  const safeLayoutSuggestions = Array.isArray(layoutSuggestions)
    ? layoutSuggestions.filter(Boolean).slice(0, 8)
    : [];

  const hasReferenceImage = Boolean(inputImage);
  const hasGeneratedImage = Boolean(outputImage);

  // ✅ Signature drives deterministic variation per prompt + layout + palette
  const signature = stableSignature(
    [
      safeRoom,
      safeStyle,
      paletteNames.join(","),
      paletteHex.join(","),
      safeLayoutSuggestions.join("|"),
      safeUser,
      imagePrompt || "",
      isEdit ? "EDIT" : "GEN",
      hasReferenceImage ? "HAS_REF" : "NO_REF",
      hasGeneratedImage ? "HAS_OUT" : "NO_OUT",
    ].join("||")
  );

  // Derive an emphasis if not provided (based on signature)
  const emphases = [
    "light flow",
    "material contrast",
    "spatial openness",
    "furniture proportion",
    "mood and atmosphere",
    "storage efficiency",
    "circulation/walkway clarity",
    "accent layering",
    "window treatment + glare control",
    "texture layering",
  ];
  const finalEmphasis = emphasis || emphases[signature.mod % emphases.length];

  // Rotate tip categories so tips are not always the same
  const tipBuckets = [
    "lighting",
    "layout",
    "materials",
    "color_accents",
    "storage",
    "window",
    "decor_layers",
    "rug_art",
    "plants",
    "hardware_finishes",
  ];
  const bucketA = tipBuckets[(signature.mod + 0) % tipBuckets.length];
  const bucketB = tipBuckets[(signature.mod + 3) % tipBuckets.length];
  const bucketC = tipBuckets[(signature.mod + 6) % tipBuckets.length];

  // Reject common generic phrases (your complaint)
  const bannedPhrases = [
    "balanced layout",
    "cohesive materials",
    "visually inviting atmosphere",
    "cozy atmosphere",
    "clean lines and neutral tones",
    "timeless look",
    "adds warmth and character",
  ];

  const prompt = buildPrompt({
    imagePrompt,
    safeUser,
    safeRoom,
    safeStyle,
    paletteNames,
    paletteHex,
    finalEmphasis,
    signature: signature.hex,
    buckets: [bucketA, bucketB, bucketC],
    bannedPhrases,
    layoutSuggestions: safeLayoutSuggestions,
    isEdit,
    hasReferenceImage,
    hasGeneratedImage,
  });

  // If no HF key, return deterministic varied fallback (now also respects palette + layout)
  if (!HF_API_KEY) {
    return variedFallback({
      safeRoom,
      safeStyle,
      signature,
      paletteNames,
      paletteHex,
      finalEmphasis,
      layoutSuggestions: safeLayoutSuggestions,
      isEdit,
    });
  }

  // Try once, then retry with stricter constraints if needed
  const first = await callHF(prompt, 0.85);
  const parsed1 = parseAndValidate(first, bannedPhrases);

  if (parsed1.ok) return parsed1.data;

  const retryPrompt =
    prompt +
    `

STRICT RETRY RULES:
- Avoid ALL generic interior design wording
- Each tip must start with a different verb
- Each tip must mention a concrete object (e.g., lamp, curtain, rug, shelf, mirror, chair, table)
- Tip #2 MUST explicitly reference the provided layout placements (e.g., "Bed: back wall (centered)")
- Tip #3 MUST explicitly reference at least one palette color name or hex
- Output must be exactly 2–3 sentences in EXPLANATION and exactly 3 bullet tips
`;

  const second = await callHF(retryPrompt, 0.65);
  const parsed2 = parseAndValidate(second, bannedPhrases);

  if (parsed2.ok) return parsed2.data;

  // Final fallback (still varied + respects palette + layout)
  return variedFallback({
    safeRoom,
    safeStyle,
    signature,
    paletteNames,
    paletteHex,
    finalEmphasis,
    layoutSuggestions: safeLayoutSuggestions,
    isEdit,
  });
}

/* ===============================
   HF Call (chat-model fallback)
   =============================== */
async function callHF(prompt, temperature = 0.85) {
  let lastErrText = "";

  for (const model of HF_CHAT_MODELS) {
    try {
      const res = await fetch(HF_CHAT_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${HF_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: "You output strictly the requested format. No extra text." },
            { role: "user", content: prompt },
          ],
          temperature,
          top_p: 0.9,
          max_tokens: 380,
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        lastErrText = errText;

        // ✅ Skip models that router says aren't chat-compatible
        if (res.status === 400 && errText.includes("not a chat model")) continue;

        // ✅ Skip temporary overload/rate limits and try next model
        if (res.status === 429 || res.status === 503) continue;

        console.error("HF ERROR STATUS:", res.status, res.statusText, "MODEL:", model);
        console.error("HF ERROR BODY:", errText);
        continue;
      }

      const data = await res.json();
      return data?.choices?.[0]?.message?.content || "";
    } catch (e) {
      lastErrText = String(e?.message || e);
      continue;
    }
  }

  // No model worked
  if (lastErrText) {
    console.error("HF CALL ERROR (all models failed):", lastErrText);
  }
  return "";
}

/* ===============================
   Prompt Builder (UPDATED: palette + layout enforced)
   =============================== */
function buildPrompt({
  imagePrompt,
  safeUser,
  safeRoom,
  safeStyle,
  paletteNames,
  paletteHex,
  finalEmphasis,
  signature,
  buckets,
  bannedPhrases,
  layoutSuggestions,
  isEdit,
  hasReferenceImage,
  hasGeneratedImage,
}) {
  const paletteLine =
    paletteNames.length || paletteHex.length
      ? `${paletteNames.length ? paletteNames.join(", ") : ""}${
          paletteHex.length ? ` | HEX: ${paletteHex.join(", ")}` : ""
        }`.trim()
      : "neutral tones";

  const layoutLine =
    Array.isArray(layoutSuggestions) && layoutSuggestions.length
      ? layoutSuggestions.map((x) => `- ${x}`).join("\n")
      : "- (no layout suggestions provided)";

  const imageModeLine = isEdit
    ? `EDIT MODE: TRUE (must treat reference image as base; do not propose moving walls/doors/windows)`
    : `EDIT MODE: FALSE (text-to-image concept; still respect prompt + palette + layout)`;

  const imagePresenceLine = `IMAGES:
- reference_image_provided: ${hasReferenceImage ? "yes" : "no"}
- generated_image_provided: ${hasGeneratedImage ? "yes" : "no"}`;

  return `
You are a professional interior designer writing a DESIGN REPORT.

THIS DESIGN WAS GENERATED FROM THE FOLLOWING CONTEXT:
"""
${imagePrompt || "(no image context provided)"}
"""

USER REQUEST (HIGHEST PRIORITY):
"${safeUser}"

ROOM TYPE:
${safeRoom}

STYLE DIRECTION:
${safeStyle}

COLOR PALETTE (must be reflected in tips; do not invent a new dominant hue):
${paletteLine}

AI LAYOUT PLACEMENTS (tips must respect these placements):
${layoutLine}

${imageModeLine}
${imagePresenceLine}

DECOR EMPHASIS (must shape wording + tips):
${finalEmphasis}

PROMPT SIGNATURE (do not repeat, only use to diversify):
${signature}

TIP REQUIREMENTS (STRICT):
- Provide exactly 3 tips
- Tip #1 must focus on: ${buckets[0]}
- Tip #2 must focus on: ${buckets[1]} AND must explicitly reference at least one layout placement from "AI LAYOUT PLACEMENTS"
- Tip #3 must focus on: ${buckets[2]} AND must explicitly reference at least one palette name or hex code
- Tips must be actionable and reference concrete items AND placement (where to put it / what to adjust)
- Do not repeat the same verb across tips
- Do not contradict the AI layout placements

BANNED PHRASES (do not use these exact phrases):
${bannedPhrases.map((p) => `- ${p}`).join("\n")}

FORMAT (STRICT):
EXPLANATION:
<2–3 sentences. Must mention: user request, palette, and layout intent.>

TIPS:
- tip one
- tip two
- tip three
`.trim();
}

/* ===============================
   Parsing + Validation
   =============================== */
function parseAndValidate(text, bannedPhrases) {
  if (!text || typeof text !== "string") return { ok: false };

  const expMatch = text.match(/EXPLANATION:\s*([\s\S]*?)\bTIPS:\b/i);
  const tipsMatch = text.match(/\bTIPS:\s*([\s\S]*)/i);
  if (!expMatch || !tipsMatch) return { ok: false };

  const explanation = expMatch[1].trim();
  const tipsRaw = tipsMatch[1]
    .split("\n")
    .map((l) => l.replace(/^[-•\d.]+\s*/, "").trim())
    .filter(Boolean);

  const tips = tipsRaw.slice(0, 3);
  if (!explanation || tips.length !== 3) return { ok: false };

  const sentenceCount = explanation
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean).length;
  if (sentenceCount < 2 || sentenceCount > 3) return { ok: false };

  const lower = (explanation + "\n" + tips.join("\n")).toLowerCase();
  for (const p of bannedPhrases) {
    if (lower.includes(p.toLowerCase())) return { ok: false };
  }

  const normTips = tips.map((t) => t.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim());
  if (new Set(normTips).size !== 3) return { ok: false };
  if (tips.some((t) => t.length < 18)) return { ok: false };

  const starts = tips.map((t) => (t.split(" ")[0] || "").toLowerCase());
  if (new Set(starts).size < 3) return { ok: false };

  return { ok: true, data: { explanation, tips } };
}

/* ===============================
   Deterministic Signature
   =============================== */
function stableSignature(input) {
  const hash = crypto.createHash("sha256").update(String(input)).digest("hex");
  const mod = (parseInt(hash.slice(0, 8), 16) >>> 0) || 0;
  return { hex: hash, mod };
}

/* ===============================
   Varied Fallback (palette + layout)
   =============================== */
function variedFallback({
  safeRoom,
  safeStyle,
  signature,
  paletteNames,
  paletteHex,
  finalEmphasis,
  layoutSuggestions = [],
  isEdit = false,
}) {
  const verbs = ["Shift", "Add", "Swap", "Layer", "Move", "Anchor", "Frame", "Raise", "Group", "Trim"];
  const v1 = verbs[(signature.mod + 1) % verbs.length];
  const v2 = verbs[(signature.mod + 4) % verbs.length];
  const v3 = verbs[(signature.mod + 7) % verbs.length];

  const paletteHint =
    paletteNames.length
      ? paletteNames.slice(0, 3).join(", ")
      : paletteHex.length
      ? paletteHex.slice(0, 3).join(", ")
      : "neutral tones";

  const layoutHint =
    Array.isArray(layoutSuggestions) && layoutSuggestions.length
      ? layoutSuggestions.slice(0, 2).join("; ")
      : "the suggested furniture placements";

  const editLine = isEdit
    ? "Because this is an edit flow, the advice assumes the same room structure and furniture positions are preserved."
    : "The advice assumes a realistic, buildable interior based on the brief.";

  return {
    explanation:
      `This ${safeRoom} follows a ${safeStyle.toLowerCase()} direction with decisions centered on ${finalEmphasis}. ` +
      `It prioritizes the user request while keeping ${paletteHint} as the dominant palette and aligning with ${layoutHint}. ` +
      `${editLine}`,
    tips: [
      `${v1} a task light (desk lamp or wall sconce) toward the main activity zone, then keep ambient lighting soft so the palette reads consistently.`,
      `${v2} one key item to match the layout placement (“${layoutHint}”) and maintain a clear walkway line between primary pieces.`,
      `${v3} accents (curtain, rug, throw pillows) using ${paletteHint} so the image and styling do not drift into unrelated dominant colors.`,
    ],
  };
}
