// design-engine/furnitureMatcher.js
// Goal: deterministic "accurate enough" furniture links + placement hints aligned with:
// - roomType (snake_case or natural text)
// - style.name
// - palette.colors (names / hex)
// - layoutSuggestions lines like "Bed: back wall (centered)"
//
// This file uses search links only (Shopee/Lazada/IKEA/FB Marketplace).
// It is deterministic and UI-safe.

function encodeQ(s = "") {
    return encodeURIComponent(String(s).trim().replace(/\s+/g, " "));
  }
  
  /* ===============================
     ✅ Region-safe Marketplace link
     =============================== */
  function buildSearchLinks(query) {
    const q = encodeQ(query);
    return {
      shopee: `https://shopee.ph/search?keyword=${q}`,
      lazada: `https://www.lazada.com.ph/catalog/?q=${q}`,
      ikea: `https://www.ikea.com/ph/en/search/?q=${q}`,
      marketplace: `https://www.facebook.com/marketplace/search/?query=${q}`,
    };
  }
  
  /* ===============================
     ✅ Normalization utilities
     =============================== */
  function normalizeText(s = "") {
    return String(s || "")
      .toLowerCase()
      .trim()
      .replace(/[_-]/g, " ")
      .replace(/[^\w\s]/g, "") // remove punctuation
      .replace(/\s+/g, " ")
      .trim();
  }
  
  function singularize(word = "") {
    // simple deterministic singularization for common marketplace nouns
    const w = normalizeText(word);
    if (w.endsWith("ies")) return w.slice(0, -3) + "y";
    if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
    return w;
  }
  
  /* ===============================
     ✅ Canonical needs + aliases
     =============================== */
  const NEED_ALIASES = new Map([
    // Bedroom
    ["bed", ["bed", "bed frame", "queen bed", "double bed"]],
    ["wardrobe", ["wardrobe", "closet", "closet cabinet", "cabinet wardrobe", "armoire"]],
    ["nightstand", ["nightstand", "night stand", "bedside table", "side table bedside"]],
    ["dresser", ["dresser", "chest of drawers", "drawer cabinet"]],
    ["desk", ["desk", "study desk", "work desk", "vanity desk"]],
    ["chair", ["chair", "desk chair", "study chair"]],
    ["rug", ["rug", "area rug", "carpet"]],
    ["mirror", ["mirror", "full length mirror"]],
  
    // Living
    ["sofa", ["sofa", "couch", "sectional sofa"]],
    ["coffee table", ["coffee table", "center table", "living table"]],
    ["side table", ["side table", "end table", "accent table"]],
    ["tv console", ["tv console", "tv stand", "entertainment unit", "media console"]],
    ["shelving", ["shelving", "shelves", "wall shelf", "display shelf"]],
    ["storage cabinet", ["storage cabinet", "cabinet", "credenza", "sideboard"]],
  
    // Office
    ["ergonomic chair", ["ergonomic chair", "office chair", "computer chair"]],
    ["bookshelf", ["bookshelf", "book shelf", "bookcase", "shelf rack"]],
  
    // Kitchen / Dining
    ["dining table", ["dining table", "table dining", "kitchen table"]],
    ["dining chair", ["dining chair", "dining chairs", "chair dining"]],
    ["kitchen island", ["kitchen island", "island cart", "kitchen cart"]],
    ["base cabinet", ["base cabinet", "kitchen cabinet", "lower cabinet"]],
    ["bar stool", ["bar stool", "stool", "counter stool"]],
  
    // Cafe / Retail
    ["service counter", ["service counter", "counter table", "front counter"]],
    ["display rack", ["display rack", "retail rack", "display shelf"]],
    ["cashier counter", ["cashier counter", "checkout counter", "payment counter"]],
    // Support cafe table even if room defaults include it
    ["cafe table", ["cafe table", "small table", "bistro table"]],
    // Optional decor-ish (can be detected from image if you implement CV)
    ["decor plant", ["decor plant", "plant", "potted plant"]],
  ]);
  
  function canonicalNeedKey(input = "") {
    const s = normalizeText(input);
  
    // Direct match to canonical keys
    for (const key of NEED_ALIASES.keys()) {
      if (s === key) return key;
    }
  
    // Match against aliases
    for (const [key, aliases] of NEED_ALIASES.entries()) {
      for (const a of aliases) {
        if (s === normalizeText(a)) return key;
      }
    }
  
    // Fallback normalization: singularize
    const s2 = s
      .split(" ")
      .map((w) => (w === "shelves" ? "shelf" : singularize(w)))
      .join(" ")
      .trim();
  
    for (const key of NEED_ALIASES.keys()) {
      if (s2 === key) return key;
    }
    for (const [key, aliases] of NEED_ALIASES.entries()) {
      for (const a of aliases) {
        if (s2 === normalizeText(a)) return key;
      }
    }
  
    return s2; // last resort
  }
  
  /* ===============================
     ✅ Room type detection (robust)
     =============================== */
  function normalizeRoomType(roomType = "") {
    return normalizeText(roomType);
  }
  
  function roomTypeToNeeds(roomType = "") {
    const t = normalizeRoomType(roomType);
  
    const isBedroom = /\b(bedroom|bed room|master|kids room|guest room)\b/.test(t);
    const isLiving = /\b(living|living room|lounge|family room)\b/.test(t);
    const isOffice = /\b(home office|office|workspace|study)\b/.test(t);
    const isKitchen = /\b(kitchen|pantry)\b/.test(t);
    const isDining = /\b(dining|dining room)\b/.test(t);
    const isCafe = /\b(cafe|coffee shop|coffeehouse)\b/.test(t);
    const isRetail = /\b(retail|store|shop|boutique)\b/.test(t);
  
    if (isBedroom) {
      return ["bed", "wardrobe", "nightstand", "dresser", "desk", "chair", "rug", "mirror"];
    }
    if (isLiving) {
      return ["sofa", "coffee table", "side table", "tv console", "rug", "shelving", "storage cabinet"];
    }
    if (isOffice) {
      return ["desk", "ergonomic chair", "bookshelf", "storage cabinet", "rug"];
    }
    if (isKitchen || isDining) {
      return ["dining table", "dining chair", "base cabinet", "kitchen island", "bar stool"];
    }
    if (isCafe) {
      return ["service counter", "cafe table", "dining chair", "shelving"];
    }
    if (isRetail) {
      return ["display rack", "shelving", "cashier counter", "storage cabinet"];
    }
  
    return ["sofa", "side table", "storage cabinet", "rug"];
  }
  
  /* ===============================
     ✅ Layout suggestions parsing
     - Supports "X: Y", "X - Y", "X — Y"
     - Canonicalizes left side for better matching
     =============================== */
  function parseLayoutSuggestions(layoutSuggestions = []) {
    const map = new Map();
    const lines = Array.isArray(layoutSuggestions) ? layoutSuggestions : [];
  
    for (const raw of lines) {
      const s = String(raw || "").trim();
      if (!s) continue;
  
      let left = "";
      let right = "";
  
      if (s.includes(":")) {
        [left, right] = s.split(/:(.+)/);
      } else if (s.includes(" - ")) {
        [left, right] = s.split(/ - (.+)/);
      } else if (s.includes(" — ")) {
        [left, right] = s.split(/ — (.+)/);
      } else {
        continue;
      }
  
      const key = canonicalNeedKey(left);
      const val = String(right || "").trim();
      if (key && val) map.set(key, val);
    }
  
    return map;
  }
  
  /* ===============================
     ✅ Palette -> keywords (improved)
     =============================== */
  function paletteToKeywords(palette) {
    const colors = Array.isArray(palette?.colors) ? palette.colors : [];
  
    const nameKW = colors
      .slice(0, 3)
      .map((c) => (c?.name ? normalizeText(c.name) : ""))
      .filter(Boolean)
      .map(colorNameToSearchToken);
  
    if (nameKW.length > 0) return nameKW.slice(0, 3);
  
    const hexKW = colors
      .slice(0, 3)
      .map((c) => hexToSearchColor(c?.hex))
      .filter(Boolean);
  
    return hexKW.slice(0, 2);
  }
  
  function colorNameToSearchToken(name = "") {
    const n = normalizeText(name);
    const map = {
      ivory: "ivory",
      beige: "beige",
      tan: "tan",
      cream: "cream",
      gray: "gray",
      grey: "gray",
      charcoal: "charcoal",
      black: "black",
      white: "white",
      walnut: "walnut",
      oak: "oak",
      wood: "wood",
      navy: "navy",
      teal: "teal",
      sage: "sage green",
      emerald: "emerald green",
      blush: "blush",
    };
    return map[n] || n;
  }
  
  function hexToSearchColor(hex) {
    const h = String(hex || "").replace("#", "").trim();
    if (h.length !== 6) return "";
  
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if ([r, g, b].some((n) => Number.isNaN(n))) return "";
  
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
  
    if (max < 55) return "black";
    if (min > 210) return "white";
    if (max - min < 18) return "gray";
  
    if (r > g + 35 && r > b + 35) return "brown";
    if (g > r + 35 && g > b + 35) return "green";
    if (b > r + 35 && b > g + 35) return "blue";
  
    if (r >= g && g >= b) return "beige";
    return "neutral";
  }
  
  /* ===============================
     ✅ Style -> keywords (searchable)
     =============================== */
  function styleToKeywords(style) {
    const name = normalizeText(style?.name || "");
  
    const map = {
      modern: ["modern", "contemporary"],
      minimalist: ["minimalist", "simple"],
      japandi: ["japandi", "light wood"],
      scandinavian: ["scandinavian", "light wood"],
      industrial: ["industrial", "metal", "matte black"],
      boho: ["boho", "rattan"],
      luxury: ["luxury", "marble", "gold accent"],
      rustic: ["rustic", "solid wood"],
      coastal: ["coastal", "beige", "light wood"],
      traditional: ["classic", "wood"],
    };
  
    return map[name] || (name ? [name] : []);
  }
  
  /* ===============================
     ✅ Need -> marketplace-friendly synonyms
     =============================== */
  function needToSynonyms(need = "") {
    const key = canonicalNeedKey(need);
  
    const map = {
      bed: ["bed frame", "bed"],
      wardrobe: ["wardrobe", "closet cabinet"],
      nightstand: ["nightstand", "bedside table"],
      dresser: ["dresser", "chest of drawers"],
      desk: ["study desk", "desk"],
      chair: ["chair", "desk chair"],
  
      sofa: ["sofa", "couch"],
      "coffee table": ["coffee table", "center table"],
      "side table": ["side table", "end table"],
      "tv console": ["tv console", "tv stand"],
      shelving: ["wall shelf", "shelving"],
      "storage cabinet": ["storage cabinet", "cabinet"],
  
      "ergonomic chair": ["ergonomic chair", "office chair"],
      bookshelf: ["bookshelf", "bookcase"],
  
      "base cabinet": ["kitchen cabinet", "base cabinet"],
      "kitchen island": ["kitchen island", "island cart"],
      "dining table": ["dining table", "table"],
      "dining chair": ["dining chair", "chair"],
      "bar stool": ["bar stool", "counter stool"],
  
      "service counter": ["service counter", "counter table"],
      "display rack": ["display rack", "retail rack"],
      "cashier counter": ["cashier counter", "checkout counter"],
      "cafe table": ["cafe table", "small table"],
  
      rug: ["area rug", "rug"],
      mirror: ["full length mirror", "mirror"],
  
      "decor plant": ["potted plant", "artificial plant"],
    };
  
    return map[key] || [need];
  }
  
  /* ===============================
     ✅ Query builder (higher precision)
     =============================== */
  function styleMaterialHints(styleKW = []) {
    const s = styleKW.join(" ");
    const hints = [];
  
    if (s.includes("light wood")) hints.push("oak");
    if (s.includes("rattan")) hints.push("rattan");
    if (s.includes("metal")) hints.push("metal");
    if (s.includes("marble")) hints.push("marble");
    if (s.includes("solid wood")) hints.push("wood");
  
    return hints.slice(0, 1);
  }
  
  function buildQuery({ need, styleKW, paletteKW }) {
    const synonyms = needToSynonyms(need);
    const materialHints = styleMaterialHints(styleKW);
  
    const parts = [
      ...styleKW.slice(0, 1),
      ...paletteKW.slice(0, 1),
      ...materialHints.slice(0, 1),
      ...synonyms.slice(0, 1),
      "furniture",
    ]
      .map((x) => String(x || "").trim())
      .filter(Boolean);
  
    const seen = new Set();
    const uniq = [];
    for (const p of parts) {
      const k = normalizeText(p);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      uniq.push(p);
    }
  
    return uniq.join(" ");
  }
  
  /* ===============================
     ✅ Display formatting
     =============================== */
  function toDisplayName(need = "") {
    const key = canonicalNeedKey(need);
    return String(key)
      .trim()
      .split(/\s+/g)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  
  function toId(need = "") {
    return canonicalNeedKey(need).replace(/\s+/g, "_");
  }
  
  /* ===============================
     ✅ Placement fallback (smarter)
     =============================== */
  function defaultPlacementForNeed(needKey = "") {
    const key = canonicalNeedKey(needKey);
  
    const map = {
      bed: "Place against a solid wall; keep both sides accessible if space allows; avoid blocking windows.",
      wardrobe: "Place on a wall with minimal openings; ensure doors can fully swing; keep near dressing zone.",
      nightstand: "Place beside the bed on the accessible side; align top height with mattress for usability.",
      dresser: "Place on a clear wall; maintain drawer clearance; keep near wardrobe/closet zone.",
      desk: "Place near natural light if possible; keep cable path close to outlets; avoid obstructing circulation.",
      sofa: "Anchor to the main seating wall; face focal point (TV/window); keep clear walking lane behind/side.",
      "coffee table": "Center in front of sofa; keep ~40–50 cm clearance from seating edge for legroom.",
      "tv console": "Place on the focal wall; center to seating; avoid glare from direct window alignment.",
      rug: "Position to unify seating zone; front legs of sofa/chairs on rug for a cohesive layout.",
      bookshelf: "Place on a clear wall; avoid tight corners that block access; keep near desk/reading zone.",
      shelving: "Mount/place on a low-traffic wall; keep reachable; avoid narrowing the main walkway.",
      "storage cabinet": "Place on low-traffic wall; keep door swing/drawer clearance; avoid blocking circulation.",
      "dining table": "Place centered in dining zone; keep chair pull-out clearance; avoid blocking kitchen circulation.",
      "dining chair": "Arrange around the table; keep aisles clear; avoid blocking door swings.",
      "kitchen island": "Center with clearance on all sides; keep prep-to-sink path clear.",
      "base cabinet": "Place along prep wall; keep access to appliances and sink zones.",
      "bar stool": "Place along counter edge; keep walkway behind stools clear.",
      "service counter": "Place near entry/ordering flow; keep queue line clear.",
      "display rack": "Place along walls or in islands; keep clear aisles for circulation.",
      "cashier counter": "Place near entry/exit; keep payment flow visible and unobstructed.",
      "cafe table": "Arrange with clear aisles between tables; keep service path unobstructed.",
    };
  
    return (
      map[key] ||
      "Place it where circulation stays clear; maintain a consistent walkway line and avoid blocking doors/windows."
    );
  }
  
  /* ===============================
     ✅ NEW: override needs support
     - If you pass detected objects from image (e.g., ["sofa","coffee table"]),
       it will build links for those exact objects.
     - Still deterministic and safe.
     =============================== */
  function sanitizeOverrideNeeds(overrideNeeds) {
    const arr = Array.isArray(overrideNeeds) ? overrideNeeds : [];
    const cleaned = arr
      .map((x) => canonicalNeedKey(x))
      .map((x) => String(x || "").trim())
      .filter(Boolean);
  
    // unique preserve order
    const seen = new Set();
    const out = [];
    for (const n of cleaned) {
      if (seen.has(n)) continue;
      seen.add(n);
      out.push(n);
    }
  
    // keep UI clean (avoid too many)
    return out.slice(0, 10);
  }
  
  /* ===============================
     ✅ Main export
     =============================== */
  export function getFurnitureMatches({
    roomType,
    style,
    palette,
    layoutSuggestions = [],
    overrideNeeds = null, // ✅ NEW
  } = {}) {
    const styleKW = styleToKeywords(style);
    const paletteKW = paletteToKeywords(palette);
  
    const override = sanitizeOverrideNeeds(overrideNeeds);
  
    // Needs from override OR room type (canonicalized)
    const needs =
      override.length > 0
        ? override
        : roomTypeToNeeds(roomType).map(canonicalNeedKey);
  
    const placements = parseLayoutSuggestions(layoutSuggestions);
  
    return needs.map((needKeyRaw) => {
      const needKey = canonicalNeedKey(needKeyRaw);
  
      const placementHint =
        placements.get(needKey) ||
        placements.get(normalizeText(needKey).split(" ")[0]) ||
        defaultPlacementForNeed(needKey);
  
      const query = buildQuery({
        need: needKey,
        styleKW,
        paletteKW,
      });
  
      return {
        id: toId(needKey),
        name: toDisplayName(needKey),
        placement: placementHint,
        query,
        links: buildSearchLinks(query),
      };
    });
  }
  