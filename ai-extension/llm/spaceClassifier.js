import fetch from "node-fetch";

const HF_API_KEY = process.env.HF_API_KEY;

// ✅ HF Router Chat Completions endpoint
const HF_CHAT_ENDPOINT = "https://router.huggingface.co/v1/chat/completions";

// ✅ IMPORTANT: use chat-compatible models
const HF_CHAT_MODELS = [
  "meta-llama/Meta-Llama-3-8B-Instruct",
  "meta-llama/Llama-3.1-8B-Instruct",
  "meta-llama/Llama-3.2-3B-Instruct",
];

/**
 * SPACE CLASSIFIER (HOME + APARTMENT + SMALL BUSINESS ONLY)
 * ✅ Focus: bahay/apartment/condo + small businesses (PH/Taglish)
 * ✅ Weighted scoring (not first match), reduces false positives
 * ✅ Phrase boundary matching + flexible token matching
 * ✅ Negative cues
 * ✅ Mixed prompt boost: room mentioned near "design/layout/ayusin" actions
 *
 * ✅ FIX (BALCONY BUG):
 * - Phrases dominate over tokens
 * - Explicit room mention boost
 * - Adds PH synonyms: balkonahe/veranda/beranda
 *
 * ✅ FIX (KIDS BEDROOM):
 * - kids_bedroom is its own roomType (NOT lumped to bedroom)
 *
 * ✅ NEW (HOME OFFICE + STUDY ROOM):
 * - Study room is treated as home_office by default (recommended for stability)
 * - Still recognizes "study room / study area / study corner" strongly
 * - Also accepts "study_room" from LLM and normalizes it -> home_office
 */
export async function classifySpace(userMessage = "") {
  const rawText = String(userMessage || "");

  // ✅ normalize then expand synonyms (PH/Taglish)
  const text = expandSynonyms(normalizeText(rawText));

  /* ===============================
     1️⃣ RULE-BASED (PRIMARY)
     =============================== */

  const NEGATIVE_PHRASES = {
    coffee_shop: ["coffee table", "coffee-table", "coffee corner at home", "coffee nook at home"],
    restaurant: ["dining table", "dining area at home", "home dining", "kainan sa bahay"],
    retail_store: ["store room", "storeroom", "storage room", "bodega"],
    pharmacy: ["medicine cabinet", "home meds", "medicine shelf"],
    laundry_shop: ["laundry room", "labahan", "utility room"],
    sari_sari_store: ["sari-sari sa bahay", "home tindahan area"],

    // ✅ optional: prevent balcony being treated as bedroom if user says "balcony bedroom"
    balcony: ["balcony bedroom", "bed on balcony", "bed sa balcony"],

    // ✅ prevent kids phrases from boosting adult bedroom
    bedroom: ["kids bedroom", "children's bedroom", "kids room", "nursery", "toddler bedroom", "teen bedroom"],
  };

  const COMMERCIAL_CUES = [
    "customers", "customer", "client", "walk-in", "walk in",
    "sales", "selling", "counter", "cashier", "pos", "menu",
    "queue", "branding", "signage", "inventory", "merchandise",
    "checkout", "order", "orders", "pick up", "pickup",
    "display rack", "display shelves", "service counter", "storefront",
  ];

  const RESIDENTIAL_CUES = [
    "house", "home", "apartment", "condo", "unit", "studio", "family", "kids",
    "bahay", "tulugan", "kwarto", "sala", "kusina", "kainan", "banyo",
  ];

  const CATALOG = {
    residential: [
      // ✅ KIDS BEDROOM FIRST (so it beats bedroom)
      {
        roomType: "kids_bedroom",
        strong: [
          "kids bedroom",
          "kid's bedroom",
          "children's bedroom",
          "child bedroom",
          "nursery bedroom",
          "toddler bedroom",
          "teen bedroom",
          "shared kids bedroom",
        ],
        medium: [
          "kids room",
          "kid room",
          "children room",
          "child room",
          "nursery",
          "kwarto ng bata",
          "silid ng bata",
          "pambata na kwarto",
          "pang bata na kwarto",
          "kwarto pambata",
          "silid pambata",
        ],
        tokens: [
          "bunk",
          "bunk bed",
          "twin bed",
          "single bed",
          "crib",
          "toy",
          "toys",
          "playmat",
          "study desk",
          "kids desk",
          "homework",
        ],
      },

      {
        roomType: "bedroom",
        strong: ["master bedroom", "guest bedroom", "shared bedroom"],
        medium: ["bedroom", "guest room", "tulugan", "kwarto", "silid"],
        tokens: ["bed", "wardrobe", "nightstand", "dresser", "headboard"],
      },

      {
        roomType: "living_room",
        strong: ["living room", "family room", "tv room", "media room"],
        medium: ["livingroom", "lounge", "sala"],
        tokens: ["sofa", "couch", "tv", "coffee table", "entertainment", "console"],
      },

      {
        roomType: "kitchen",
        strong: ["dirty kitchen", "show kitchen", "outdoor kitchen"],
        medium: ["kitchen", "kusina"],
        tokens: ["stove", "cooktop", "rangehood", "fridge", "refrigerator", "countertop", "backsplash", "island"],
      },

      {
        roomType: "pantry",
        strong: ["walk-in pantry", "walk in pantry"],
        medium: ["pantry"],
        tokens: ["food storage", "shelves pantry"],
      },

      {
        roomType: "dining_room",
        strong: ["formal dining room"],
        medium: ["dining room", "dining area", "kainan"],
        tokens: ["dining table", "chairs", "buffet", "sideboard"],
      },

      {
        roomType: "bathroom",
        strong: ["powder room", "half bath", "master bathroom", "ensuite", "en suite"],
        medium: ["bathroom", "toilet", "restroom", "cr", "banyo", "palikuran"],
        tokens: ["shower", "toilet bowl", "vanity", "sink", "mirror", "towel"],
      },

      // ✅ HOME OFFICE / STUDY ROOM (one bucket for stability)
      {
        roomType: "home_office",
        strong: [
          "home office",
          "work from home setup",
          "wfh setup",
          "study room",
          "study area",
          "study corner",
          "workspace at home",
          "home workspace",
        ],
        medium: [
          "workspace",
          "study",
          "office room",
          "opisina sa bahay",
          "study zone",
          "study nook",
          "computer desk area",
        ],
        tokens: ["desk", "monitor", "keyboard", "shelves", "bookcase", "laptop", "office chair"],
      },

      {
        roomType: "kids_playroom",
        strong: ["play room", "kids playroom"],
        medium: ["playroom", "toy room"],
        tokens: ["toys", "playmat", "kids area"],
      },

      {
        roomType: "walk_in_closet",
        strong: ["walk-in closet", "walk in closet"],
        medium: ["closet room", "wardrobe room", "damitan"],
        tokens: ["hanger", "shelves", "shoe rack"],
      },

      {
        roomType: "laundry_room",
        strong: ["laundry room"],
        medium: ["utility room", "laundry", "labahan"],
        tokens: ["washer", "dryer", "laundry basket", "ironing"],
      },

      {
        roomType: "storage_room",
        strong: ["storage room"],
        medium: ["storeroom", "storage"],
        tokens: ["boxes", "shelves storage"],
      },

      {
        roomType: "service_area",
        strong: ["service area"],
        medium: ["utility area", "service kitchen"],
        tokens: ["utility", "service"],
      },

      {
        roomType: "maids_room",
        strong: ["maid's room", "helpers room", "house helper room"],
        medium: ["maids room", "helper room"],
        tokens: ["helper", "maid"],
      },

      {
        roomType: "garage",
        strong: ["two car garage", "2-car garage"],
        medium: ["garage", "carport", "garahe"],
        tokens: ["car", "motor", "tools"],
      },

      {
        roomType: "entryway",
        strong: ["main entry", "front entry"],
        medium: ["entryway", "foyer", "entrance", "mudroom"],
        tokens: ["shoe rack", "coat", "bench"],
      },

      {
        roomType: "hallway",
        strong: ["main corridor"],
        medium: ["hallway", "corridor", "passage"],
        tokens: ["hall", "walkway"],
      },

      {
        roomType: "stairs_area",
        strong: ["stair landing"],
        medium: ["stairs", "staircase", "hagdan"],
        tokens: ["railing", "steps"],
      },

      // ✅ BALCONY (no rooftop terms here)
      {
        roomType: "balcony",
        strong: ["balcony", "balcony area", "balkonahe", "veranda", "beranda"],
        medium: ["terrace", "lanai"],
        tokens: ["outdoor seating", "plants", "view", "railing", "balustrade"],
      },

      {
        roomType: "patio",
        strong: ["outdoor patio"],
        medium: ["patio"],
        tokens: ["outdoor", "chairs", "table"],
      },

      // ✅ ROOF DECK (keep separate from balcony)
      {
        roomType: "roof_deck",
        strong: ["roof deck", "rooftop deck", "rooftop terrace", "roof terrace", "roof top deck", "roof top terrace"],
        medium: ["rooftop", "roof top"],
        tokens: ["deck", "rooftop", "outdoor seating", "plants", "view"],
      },

      {
        roomType: "garden",
        strong: ["backyard garden", "front yard"],
        medium: ["garden", "yard", "bakuran", "landscape"],
        tokens: ["plants", "grass", "outdoor"],
      },

      {
        roomType: "studio_apartment",
        strong: ["studio apartment", "studio unit"],
        medium: ["small apartment", "one room apartment", "studio"],
        tokens: ["open plan", "compact"],
      },

      {
        roomType: "residential_generic",
        strong: [],
        medium: ["home renovation", "house interior", "bahay interior", "apartment interior", "condo interior"],
        tokens: ["residential"],
      },
    ],

    // ✅ SMALL BUSINESS (already included)
    commercial: [
      {
        roomType: "sari_sari_store",
        strong: ["sari-sari store", "sari sari store"],
        medium: ["tindahan", "corner store", "mini store"],
        tokens: ["tingi", "paninda", "display", "counter", "cashier"],
      },
      {
        roomType: "retail_store",
        strong: ["clothing store", "retail store", "convenience store"],
        medium: ["boutique", "retail", "shop", "store"],
        tokens: ["display rack", "mannequin", "fitting room", "inventory", "checkout"],
      },
      {
        roomType: "bakery",
        strong: ["bread shop", "bakeshop"],
        medium: ["bakery", "panaderya"],
        tokens: ["pastries", "oven", "display case", "bread"],
      },
      {
        roomType: "milktea_shop",
        strong: ["milk tea shop", "milktea shop"],
        medium: ["milktea", "milk tea"],
        tokens: ["cups", "sealing machine", "menu"],
      },
      {
        roomType: "coffee_shop",
        strong: ["coffee shop", "espresso bar"],
        medium: ["cafe", "café"],
        tokens: ["barista", "espresso machine", "brew bar", "menu"],
      },
      {
        roomType: "restaurant",
        strong: ["fast food", "fine dining"],
        medium: ["restaurant", "bistro", "diner", "canteen", "karinderya"],
        tokens: ["menu", "tables", "service counter", "kitchen line"],
      },
      {
        roomType: "computer_shop",
        strong: ["computer shop", "internet cafe", "internet café"],
        medium: ["comshop", "net cafe", "pisonet"],
        tokens: ["computers", "pcs", "gaming", "internet"],
      },
      {
        roomType: "printing_shop",
        strong: ["printing shop", "print shop"],
        medium: ["xerox", "tarpaulin", "printing services"],
        tokens: ["printer", "printing", "laminate", "photocopy"],
      },
      {
        roomType: "laundry_shop",
        strong: ["laundry shop", "laundromat"],
        medium: ["wash and dry", "wash dry fold"],
        tokens: ["laundry service", "drop off", "pickup"],
      },
      {
        roomType: "pharmacy",
        strong: ["pharmacy", "drugstore"],
        medium: ["botika"],
        tokens: ["medicines", "prescription", "counter", "cashier"],
      },
      {
        roomType: "commercial_generic",
        strong: [],
        medium: ["small business", "commercial space", "shop interior", "small shop"],
        tokens: ["commercial"],
      },
    ],
  };

  const resultFromRules = scoreAndPick({
    text,
    rawText,
    catalog: CATALOG,
    negativePhrases: NEGATIVE_PHRASES,
    commercialCues: COMMERCIAL_CUES,
    residentialCues: RESIDENTIAL_CUES,
  });

  if (resultFromRules) return resultFromRules;

  /* ===============================
     2️⃣ LLM FALLBACK
     =============================== */

  if (!HF_API_KEY) {
    return { spaceType: "residential", roomType: "unknown", confidence: 0.35, source: "fallback" };
  }

  // ✅ NOTE: we allow "study_room" but normalize it to "home_office"
  const allowedRoomTypes = [
    // Residential
    "kids_bedroom",
    "bedroom",
    "living_room",
    "kitchen",
    "pantry",
    "bathroom",
    "dining_room",
    "home_office",
    "study_room", // accepted input -> normalized to home_office
    "kids_playroom",
    "studio_apartment",
    "laundry_room",
    "walk_in_closet",
    "storage_room",
    "service_area",
    "maids_room",
    "entryway",
    "hallway",
    "stairs_area",
    "balcony",
    "garden",
    "patio",
    "roof_deck",
    "garage",
    "residential_generic",

    // Commercial
    "sari_sari_store",
    "retail_store",
    "bakery",
    "milktea_shop",
    "coffee_shop",
    "restaurant",
    "computer_shop",
    "printing_shop",
    "laundry_shop",
    "pharmacy",
    "commercial_generic",

    "unknown",
  ];

  const prompt = `
You are an expert interior architect.

Return ONLY valid JSON (no markdown, no extra text).

roomType MUST be one of the allowed values.
spaceType MUST be: residential or commercial.
If unclear, use roomType="unknown".

Allowed roomType values:
${allowedRoomTypes.join(", ")}

Now classify:
"${rawText}"

Return JSON exactly:
{
  "roomType": "one_allowed_value",
  "spaceType": "residential|commercial"
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
      return { ...normalized, confidence: 0.65, source: "llm" };
    }

    throw new Error("Bad LLM JSON");
  } catch (err) {
    console.warn("⚠️ Space classifier fallback triggered:", err?.message || err);
    return { spaceType: "residential", roomType: "unknown", confidence: 0.35, source: "fallback" };
  }
}

/* ===============================
   RULE ENGINE (SCORING)
   =============================== */

function scoreAndPick({ text, rawText, catalog, negativePhrases, commercialCues, residentialCues }) {
  const lcRaw = String(rawText || "").toLowerCase();
  const cueCommercial = countAny(text, commercialCues);
  const cueResidential = countAny(text, residentialCues);

  const candidates = [];

  for (const [spaceType, items] of Object.entries(catalog)) {
    for (const item of items) {
      const score = scoreItem(text, item);
      if (score <= 0) continue;

      const negList = negativePhrases?.[item.roomType] || [];
      const negHits = countAny(lcRaw, negList);
      const negPenalty = negHits > 0 ? negHits * 3.0 : 0;

      let contextBoost = 0;
      if (spaceType === "commercial") contextBoost += cueCommercial * 0.8;
      if (spaceType === "residential") contextBoost += cueResidential * 0.8;

      if (spaceType === "commercial" && /\b(small business|negosyo|business|shop|store)\b/i.test(rawText)) {
        contextBoost += 1.2;
      }
      if (spaceType === "residential" && /\b(bahay|home|house|apartment|condo|unit|studio)\b/i.test(rawText)) {
        contextBoost += 1.2;
      }

      const requestBoost = boostIfRequested(rawText, item.roomType);

      // ✅ Explicit room word boost
      const explicitRoomWordBoost = hasPhrase(text, item.roomType.replace(/_/g, " ")) ? 2.0 : 0;

      const finalScore = score + contextBoost + requestBoost + explicitRoomWordBoost - negPenalty;

      if (finalScore > 0) {
        candidates.push({ spaceType, roomType: item.roomType, score: finalScore, baseScore: score });
      }
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score);

  const best = candidates[0];
  const second = candidates[1];

  const separation = second ? best.score - second.score : best.score;
  const confidence = clamp(
    0.55 +
      Math.min(0.35, best.baseScore * 0.06) +
      Math.min(0.15, separation * 0.05),
    0.55,
    0.96
  );

  if (best.score < 2.2) {
    return {
      spaceType: guessSpaceTypeFromCues(best.spaceType, cueResidential, cueCommercial),
      roomType: "unknown",
      confidence: 0.35,
      source: "fallback",
    };
  }

  // ✅ normalize in case rule engine yields something we want to collapse
  const normalizedRoomType = normalizeRoomType(best.roomType);

  return { spaceType: best.spaceType, roomType: normalizedRoomType, confidence, source: "rules" };
}

function scoreItem(text, item) {
  const strongHits = countPhrases(text, item.strong);
  const mediumHits = countPhrases(text, item.medium);
  const tokenHits = countTokens(text, item.tokens);

  let score = 0;

  // 🔥 Phrases dominate
  score += strongHits * 4.2;
  score += mediumHits * 3.0;

  // 🔽 Tokens weak evidence
  score += tokenHits * 0.55;

  // ✅ If room mentioned by phrase, strong boost
  if (strongHits + mediumHits > 0) score += 2.2;

  // Small label boost
  if (item.roomType && hasPhrase(text, item.roomType.replace(/_/g, " "))) score += 1.2;

  return score;
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
        body: JSON.stringify({ model, messages, temperature, top_p: 1, max_tokens }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");

        if (res.status === 400 && body.includes("not a chat model")) {
          lastErr = new Error(`${model} not chat-compatible`);
          continue;
        }

        if (res.status === 429 || res.status === 503) {
          lastErr = new Error(`${model} temporarily unavailable`);
          continue;
        }

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

function normalizeRoomType(roomType) {
  const rt = String(roomType || "").toLowerCase().trim();

  // ✅ collapse study_room into home_office (stability)
  if (rt === "study_room") return "home_office";

  return rt;
}

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[_/]+/g, " ")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandSynonyms(text) {
  const s = ` ${String(text || "").toLowerCase()} `;

  const pairs = [
    [" kwarto ", " bedroom "],
    [" silid ", " bedroom "],
    [" tulugan ", " bedroom "],
    [" sala ", " living room "],
    [" kusina ", " kitchen "],
    [" kainan ", " dining room "],
    [" banyo ", " bathroom "],
    [" palikuran ", " bathroom "],
    [" cr ", " bathroom "],
    [" labahan ", " laundry "],
    [" bodega ", " storage "],
    [" hagdan ", " stairs "],
    [" bakuran ", " garden "],
    [" garahe ", " garage "],

    // ✅ Kids bedroom PH synonyms
    [" kwarto ng bata ", " kids bedroom "],
    [" silid ng bata ", " kids bedroom "],
    [" pambata na kwarto ", " kids bedroom "],
    [" pang bata na kwarto ", " kids bedroom "],
    [" kwarto pambata ", " kids bedroom "],
    [" silid pambata ", " kids bedroom "],
    [" pambata ", " kids bedroom "],
    [" pang bata ", " kids bedroom "],

    // ✅ Study/Home office PH synonyms (normalize toward home_office intent)
    [" study room ", " home office "],
    [" study area ", " home office "],
    [" study corner ", " home office "],
    [" aralan ", " home office "],
    [" study ", " home office "], // optional; remove if it overfires
    [" work from home ", " home office "],
    [" wfh ", " home office "],
    [" opisina sa bahay ", " home office "],

    // ✅ Balcony PH synonyms
    [" balkonahe ", " balcony "],
    [" veranda ", " balcony "],
    [" beranda ", " balcony "],
    [" terasa ", " terrace "], // optional

    // Small business
    [" tindahan ", " sari sari store "],
    [" sari sari ", " sari sari store "],
    [" panaderya ", " bakery "],
    [" karinderya ", " restaurant "],
    [" botika ", " pharmacy "],
    [" comshop ", " computer shop "],
    [" pisonet ", " computer shop "],
    [" xerox ", " printing shop "],
    [" photocopy ", " printing shop "],
    [" negosyo ", " small business "],
  ];

  let out = s;
  for (const [a, b] of pairs) out = out.replaceAll(a, ` ${b} `);
  return out.replace(/\s+/g, " ").trim();
}

function hasPhrase(fullText, phrase) {
  const p = String(phrase || "").trim();
  if (!p) return false;
  const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const flexible = escaped.replace(/\s+/g, "[\\s-]+");
  const re = new RegExp(`\\b${flexible}\\b`, "i");
  return re.test(fullText);
}

function countPhrases(text, phrases = []) {
  if (!Array.isArray(phrases) || phrases.length === 0) return 0;
  let c = 0;
  for (const p of phrases) if (hasPhrase(text, p)) c++;
  return c;
}

function countTokens(text, tokens = []) {
  if (!Array.isArray(tokens) || tokens.length === 0) return 0;
  let c = 0;
  for (const t of tokens) {
    const token = String(t || "").trim();
    if (!token) continue;
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "i");
    if (re.test(text)) c++;
  }
  return c;
}

function countAny(text, list = []) {
  if (!Array.isArray(list) || list.length === 0) return 0;
  let hits = 0;
  for (const x of list) {
    if (!x) continue;
    if (String(x).includes(" ")) {
      if (hasPhrase(text, x)) hits++;
    } else {
      const escaped = String(x).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`\\b${escaped}\\b`, "i");
      if (re.test(text)) hits++;
    }
  }
  return hits;
}

function boostIfRequested(rawText, roomType) {
  if (!rawText || !roomType) return 0;

  const rt = String(roomType).replace(/_/g, " ");
  const verbs = "(design|renovate|layout|ayusin|i-design|idesign|gawin|setup|set up|decorate|interior)";
  const re = new RegExp(
    `\\b${verbs}\\b[\\s\\S]{0,40}\\b${rt}\\b|\\b${rt}\\b[\\s\\S]{0,40}\\b${verbs}\\b`,
    "i"
  );

  return re.test(rawText) ? 1.5 : 0;
}

function guessSpaceTypeFromCues(defaultSpace, cueResidential, cueCommercial) {
  if (cueCommercial > cueResidential + 1) return "commercial";
  if (cueResidential > cueCommercial + 1) return "residential";
  return defaultSpace || "residential";
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

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

  let normalizedRoom = roomType.toLowerCase().replace(/\s+/g, "_");
  const normalizedSpace = spaceType.toLowerCase();

  // ✅ accept study_room but normalize to home_office
  normalizedRoom = normalizeRoomType(normalizedRoom);

  const allowedSpaces = new Set(["residential", "commercial"]);
  if (!allowedSpaces.has(normalizedSpace)) return null;
  if (!normalizedRoom) return null;

  return { roomType: normalizedRoom, spaceType: normalizedSpace };
}
