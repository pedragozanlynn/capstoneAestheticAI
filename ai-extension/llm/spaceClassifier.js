import fetch from "node-fetch";

const HF_API_KEY = process.env.HF_API_KEY;

// ✅ HF Router Chat Completions endpoint
const HF_CHAT_ENDPOINT = "https://router.huggingface.co/v1/chat/completions";

// ✅ IMPORTANT: use chat-compatible models (do NOT use Mistral-7B-Instruct here)
const HF_CHAT_MODELS = [
  "meta-llama/Meta-Llama-3-8B-Instruct",
  "meta-llama/Llama-3.1-8B-Instruct",
  "meta-llama/Llama-3.2-3B-Instruct",
];

/**
 * SPACE CLASSIFIER (PRODUCTION)
 * ✅ Rule-based primary (covers most cases)
 * ✅ LLM fallback for ambiguous cases
 * ✅ Safer phrase matching (word boundaries)
 * ✅ Residential-first priority to reduce living_room → bar/coffee drift
 * ✅ Fallback roomType = "unknown" (no hidden bedroom defaults)
 *
 * Returns:
 * {
 *   spaceType: "residential" | "commercial" | "institutional",
 *   roomType: string, // normalized snake_case
 *   confidence: number,
 *   source: "rules" | "llm" | "fallback"
 * }
 */
export async function classifySpace(userMessage = "") {
  const text = String(userMessage || "").toLowerCase();

  /* ===============================
     1️⃣ RULE-BASED (PRIMARY)
     =============================== */

  // ---- RESIDENTIAL (most common)
  const residential = [
    { roomType: "bedroom", keys: ["master bedroom", "guest room", "kids room", "nursery", "bedroom"] },
    { roomType: "living_room", keys: ["living room", "livingroom", "family room", "lounge"] },
    { roomType: "kitchen", keys: ["kitchen", "pantry"] },
    { roomType: "bathroom", keys: ["powder room", "bathroom", "toilet", "cr"] },
    { roomType: "dining_room", keys: ["dining room", "dining area"] },
    { roomType: "home_office", keys: ["home office", "study room", "workspace", "study"] },
    { roomType: "studio_apartment", keys: ["studio apartment", "studio unit", "small apartment"] },
    { roomType: "laundry_room", keys: ["laundry room", "utility room", "laundry"] },
    { roomType: "walk_in_closet", keys: ["walk-in closet", "walk in closet", "closet room"] },
    { roomType: "balcony", keys: ["balcony", "terrace"] },
    { roomType: "garage", keys: ["garage"] },
    { roomType: "entryway", keys: ["entryway", "foyer", "entrance"] },
  ];

  // ---- COMMERCIAL / HOSPITALITY
  // NOTE: Removed overly-broad keywords ("coffee", "bar") to prevent matching "coffee table" / "bar stools" in residential prompts.
  const commercial = [
    { roomType: "coffee_shop", keys: ["coffee shop", "cafe", "espresso bar"] },
    { roomType: "restaurant", keys: ["restaurant", "bistro", "diner"] },
    { roomType: "bar", keys: ["lounge bar", "cocktail bar", "sports bar", "pub"] },
    { roomType: "retail_store", keys: ["clothing store", "retail store", "boutique", "retail", "shop", "store"] },
    { roomType: "salon", keys: ["barbershop", "barber", "salon"] },
    { roomType: "spa", keys: ["spa", "massage"] },
    { roomType: "gym", keys: ["gym", "fitness", "workout"] },
    { roomType: "office", keys: ["corporate office", "workplace", "coworking", "co-working", "office"] },
    { roomType: "reception", keys: ["front desk", "reception", "lobby"] },
    { roomType: "meeting_room", keys: ["conference room", "boardroom", "meeting room"] },
    { roomType: "hotel_room", keys: ["guest suite", "hotel room", "suite"] },
    { roomType: "airbnb_unit", keys: ["rental unit", "short stay", "airbnb"] },
    { roomType: "clinic_waiting_area", keys: ["waiting area", "waiting room"] },
  ];

  // ---- INSTITUTIONAL / EDUCATION / HEALTH
  const institutional = [
    { roomType: "classroom", keys: ["lecture room", "classroom"] },
    { roomType: "library", keys: ["reading area", "library"] },
    // NOTE: Keep order: "hospital" last to avoid accidentally classifying "hospitality" (if user writes it)
    { roomType: "clinic", keys: ["dental", "medical", "clinic", "hospital"] },
    { roomType: "laboratory", keys: ["laboratory", "lab"] },
  ];

  // Safer phrase matcher: uses word boundaries and escapes regex metacharacters.
  const hasPhrase = (fullText, phrase) => {
    const escaped = String(phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "i");
    return re.test(fullText);
  };

  // Priority matching helper (most specific phrase first)
  const matchFrom = (list, spaceType) => {
    for (const item of list) {
      const keys = [...item.keys].sort((a, b) => b.length - a.length);
      for (const k of keys) {
        if (hasPhrase(text, k)) {
          return {
            spaceType,
            roomType: item.roomType,
            confidence: 0.95,
            source: "rules",
          };
        }
      }
    }
    return null;
  };

  // ✅ Fix: Residential first to reduce living_room misrouting.
  const ruleMatch =
    matchFrom(residential, "residential") ||
    matchFrom(commercial, "commercial") ||
    matchFrom(institutional, "institutional");

  if (ruleMatch) return ruleMatch;

  /* ===============================
     2️⃣ LLM FALLBACK (SECONDARY)
     =============================== */
  if (!HF_API_KEY) {
    return {
      spaceType: "residential",
      roomType: "unknown",
      confidence: 0.35,
      source: "fallback",
    };
  }

  const allowedRoomTypes = [
    // Residential
    "bedroom",
    "living_room",
    "kitchen",
    "bathroom",
    "dining_room",
    "home_office",
    "studio_apartment",
    "laundry_room",
    "walk_in_closet",
    "entryway",

    // Commercial
    "coffee_shop",
    "restaurant",
    "bar",
    "retail_store",
    "salon",
    "spa",
    "gym",
    "office",
    "meeting_room",
    "reception",
    "hotel_room",
    "airbnb_unit",
    "clinic_waiting_area",

    // Institutional
    "classroom",
    "library",
    "clinic",
    "laboratory",

    // Generic
    "commercial_generic",
    "residential_generic",
    "unknown",
  ];

  const prompt = `
You are an expert interior architect.

Task:
Classify the roomType and spaceType.

Rules:
- Return ONLY valid JSON (no markdown, no extra text)
- roomType must be ONE of the allowed values
- spaceType must be: residential, commercial, or institutional

Allowed roomType values:
${allowedRoomTypes.join(", ")}

User request:
"${userMessage}"

Return JSON exactly:
{
  "roomType": "one_allowed_value",
  "spaceType": "residential|commercial|institutional"
}
`.trim();

  try {
    const data = await hfChatWithFallback({
      messages: [
        { role: "system", content: "You output strictly valid JSON only." },
        { role: "user", content: prompt },
      ],
      temperature: 0,
      max_tokens: 90,
    });

    const raw = data?.choices?.[0]?.message?.content;
    const parsed = safeParseJSON(raw);
    const normalized = normalizeSpace(parsed);

    if (normalized) {
      return {
        ...normalized,
        confidence: 0.65,
        source: "llm",
      };
    }

    throw new Error("Bad LLM JSON");
  } catch (err) {
    console.warn("⚠️ Space classifier fallback triggered:", err?.message || err);

    return {
      spaceType: "residential",
      roomType: "unknown",
      confidence: 0.35,
      source: "fallback",
    };
  }
}

/* ===============================
   HF Chat helper with model fallback
   =============================== */

async function hfChatWithFallback({ messages, temperature = 0, max_tokens = 120 }) {
  let lastErr = null;

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
          messages,
          temperature,
          top_p: 1,
          max_tokens,
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");

        // ✅ If router says "not a chat model", try next model
        if (res.status === 400 && body.includes("not a chat model")) {
          console.warn(`HF model not chat-compatible: ${model}`);
          lastErr = new Error(`${model} not chat-compatible`);
          continue;
        }

        // ✅ If model/provider is unavailable or rate-limited, try next
        if (res.status === 429 || res.status === 503) {
          console.warn(`HF model temporarily unavailable: ${model} (${res.status})`);
          lastErr = new Error(`${model} temporarily unavailable`);
          continue;
        }

        console.warn("HF space error:", model, res.status, res.statusText, body);
        lastErr = new Error(`HF failed: ${model} ${res.status} ${body}`);
        continue;
      }

      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error("HF chat failed: no compatible model worked");
}

/* ===============================
   Helpers
   =============================== */

function safeParseJSON(raw) {
  if (!raw || typeof raw !== "string") return null;

  try {
    return JSON.parse(raw);
  } catch {}

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function normalizeSpace(obj) {
  if (!obj || typeof obj !== "object") return null;

  const roomType = typeof obj.roomType === "string" ? obj.roomType.trim() : "";
  const spaceType = typeof obj.spaceType === "string" ? obj.spaceType.trim() : "";

  const normalizedRoom = roomType.toLowerCase().replace(/\s+/g, "_");
  const normalizedSpace = spaceType.toLowerCase();

  const allowedSpaces = new Set(["residential", "commercial", "institutional"]);
  if (!allowedSpaces.has(normalizedSpace)) return null;

  if (!normalizedRoom) return null;

  return {
    roomType: normalizedRoom,
    spaceType: normalizedSpace,
  };
}
