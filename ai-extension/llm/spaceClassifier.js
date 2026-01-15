import fetch from "node-fetch";

const HF_API_KEY = process.env.HF_API_KEY;

// ✅ Supported Hugging Face Router endpoint
const HF_CHAT_ENDPOINT = "https://router.huggingface.co/v1/chat/completions";
const HF_MODEL = "mistralai/Mistral-7B-Instruct-v0.3";

/**
 * SPACE CLASSIFIER (PRODUCTION)
 * ✅ Rule-based primary (covers most cases)
 * ✅ LLM fallback for ambiguous cases
 * ✅ Normalized roomType (snake_case) for consistent prompts
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
  const text = (userMessage || "").toLowerCase();

  /* ===============================
     1️⃣ RULE-BASED (PRIMARY)
     =============================== */

  // ---- RESIDENTIAL (most common)
  const residential = [
    { roomType: "bedroom", keys: ["bedroom", "master bedroom", "guest room", "kids room", "nursery"] },
    { roomType: "living_room", keys: ["living room", "livingroom", "lounge", "family room"] },
    { roomType: "kitchen", keys: ["kitchen", "pantry"] },
    { roomType: "bathroom", keys: ["bathroom", "toilet", "cr", "powder room"] },
    { roomType: "dining_room", keys: ["dining room", "dining area"] },
    { roomType: "home_office", keys: ["home office", "study room", "workspace", "study"] },
    { roomType: "studio_apartment", keys: ["studio apartment", "studio unit", "small apartment"] },
    { roomType: "laundry_room", keys: ["laundry", "utility room"] },
    { roomType: "walk_in_closet", keys: ["walk in closet", "walk-in closet", "closet room"] },
    { roomType: "balcony", keys: ["balcony", "terrace"] },
    { roomType: "garage", keys: ["garage"] },
    { roomType: "entryway", keys: ["entryway", "foyer", "entrance"] },
  ];

  // ---- COMMERCIAL / HOSPITALITY
  const commercial = [
    { roomType: "coffee_shop", keys: ["coffee shop", "cafe", "coffee", "espresso bar"] },
    { roomType: "restaurant", keys: ["restaurant", "bistro", "diner"] },
    { roomType: "bar", keys: ["bar", "pub", "lounge bar"] },
    { roomType: "retail_store", keys: ["retail", "boutique", "clothing store", "store", "shop"] },
    { roomType: "salon", keys: ["salon", "barbershop", "barber"] },
    { roomType: "spa", keys: ["spa", "massage"] },
    { roomType: "gym", keys: ["gym", "fitness", "workout"] },
    { roomType: "office", keys: ["office", "corporate office", "workplace", "coworking", "co-working"] },
    { roomType: "reception", keys: ["reception", "front desk", "lobby"] },
    { roomType: "meeting_room", keys: ["meeting room", "conference room", "boardroom"] },
    { roomType: "hotel_room", keys: ["hotel room", "suite", "guest suite"] },
    { roomType: "airbnb_unit", keys: ["airbnb", "short stay", "rental unit"] },
    { roomType: "clinic_waiting_area", keys: ["waiting area", "waiting room"] },
  ];

  // ---- INSTITUTIONAL / EDUCATION / HEALTH
  const institutional = [
    { roomType: "classroom", keys: ["classroom", "lecture room"] },
    { roomType: "library", keys: ["library", "reading area"] },
    { roomType: "clinic", keys: ["clinic", "dental", "medical", "hospital"] },
    { roomType: "laboratory", keys: ["laboratory", "lab"] },
  ];

  // Priority matching helper (most specific phrase first)
  const matchFrom = (list, spaceType) => {
    for (const item of list) {
      for (const k of item.keys.sort((a, b) => b.length - a.length)) {
        if (text.includes(k)) {
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

  // Check order: commercial > institutional > residential (you can adjust)
  const ruleMatch =
    matchFrom(commercial, "commercial") ||
    matchFrom(institutional, "institutional") ||
    matchFrom(residential, "residential");

  if (ruleMatch) return ruleMatch;

  /* ===============================
     2️⃣ LLM FALLBACK (SECONDARY)
     =============================== */
  // If no HF key, skip LLM and return fallback.
  if (!HF_API_KEY) {
    return {
      spaceType: "residential",
      roomType: "generic",
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
    const res = await fetch(HF_CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: HF_MODEL,
        messages: [
          { role: "system", content: "You output strictly valid JSON only." },
          { role: "user", content: prompt },
        ],
        temperature: 0,
        top_p: 1,
        max_tokens: 80,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn("HF space error:", res.status, res.statusText, errText);
      throw new Error(`HF failed: ${res.status}`);
    }

    const data = await res.json();
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
      roomType: "generic",
      confidence: 0.35,
      source: "fallback",
    };
  }
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

  // minimal roomType validation (allow generic/unknown)
  if (!normalizedRoom) return null;

  return {
    roomType: normalizedRoom,
    spaceType: normalizedSpace,
  };
}
