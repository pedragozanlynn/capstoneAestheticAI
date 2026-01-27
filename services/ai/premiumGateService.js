// services/premiumGateService.js

export const MODE = { DESIGN: "design", CUSTOMIZE: "customize" };

export const normalizeText = (s = "") =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const DESIGN_TRIGGERS = [
  "design",
  "generate",
  "create",
  "make a",
  "make an",
  "new design",
  "redesign",
  "concept",
  "theme",
  "design a",
  "style a",
];

export const CUSTOMIZE_TRIGGERS = [
  "customize",
  "edit",
  "modify",
  "adjust",
  "move",
  "reposition",
  "change",
  "replace",
  "swap",
  "remove",
  "add",
  "resize",
  "color",
  "palette",
  "lighting",
  "brighten",
  "cozier",
  "layout",
  "change the style",
];

export const detectModeFromMessage = (message = "") => {
  const m = normalizeText(message);
  if (CUSTOMIZE_TRIGGERS.some((k) => m.includes(k))) return MODE.CUSTOMIZE;
  if (DESIGN_TRIGGERS.some((k) => m.includes(k))) return MODE.DESIGN;
  return MODE.DESIGN;
};

export const safeFirestoreImage = (v) => {
  if (!v) return null;
  const s = String(v);
  if (s.startsWith("data:image")) return null;
  if (s.startsWith("file://")) return null;
  if (!(s.startsWith("http://") || s.startsWith("https://"))) return null;
  if (s.length > 200000) return null;
  return s;
};

// ------------------------------
// Normalize layout + furniture from payload
// ------------------------------
export const normalizeLayoutSuggestions = (data) => {
  if (!data || typeof data !== "object") return [];
  const candidates = [
    data.layoutSuggestions,
    data.layout_suggestions,
    data.layoutSuggestion,
    data.layout,
    data.suggestions,
    data.layoutIdeas,
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length) return c.map((x) => String(x).trim()).filter(Boolean);
  }
  return [];
};

export const normalizeFurnitureArray = (data) => {
  if (!data || typeof data !== "object") return [];
  const candidates = [
    data.furnitureMatches,
    data.furniture_matches,
    data.furnitureSourcing,
    data.furniture_sourcing,
    data.furniture,
    data.items,
    data.products,
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length) return c;
  }
  return [];
};

const buildSearchLink = (provider, queryText) => {
  const q = encodeURIComponent(String(queryText || "").trim().replace(/\s+/g, " "));
  if (!q) return "";
  if (provider === "shopee") return `https://shopee.ph/search?keyword=${q}`;
  if (provider === "lazada") return `https://www.lazada.com.ph/catalog/?q=${q}`;
  if (provider === "ikea") return `https://www.ikea.com/ph/en/search/?q=${q}`;
  if (provider === "marketplace") return `https://www.facebook.com/marketplace/search/?query=${q}`;
  return "";
};

export const normalizeFurnitureItem = (f = {}) => {
  const name = String(f?.name || f?.title || f?.product || "").trim() || "Furniture";
  const queryText = String(f?.query || f?.keyword || name).trim();
  const links = f?.links && typeof f.links === "object" ? f.links : {};

  return {
    id: f?.id || `${name}-${Math.random().toString(16).slice(2)}`,
    name,
    placement: String(f?.placement || f?.where || "").trim(),
    query: queryText,
    links: {
      shopee: links.shopee || buildSearchLink("shopee", queryText),
      lazada: links.lazada || buildSearchLink("lazada", queryText),
      ikea: links.ikea || buildSearchLink("ikea", queryText),
      marketplace: links.marketplace || buildSearchLink("marketplace", queryText),
    },
  };
};

// ------------------------------
// Premium gating helper
// ------------------------------
export const applyPremiumGatingToPayload = ({
  mergedPayload,
  proNow,
}) => {
  const explanation = mergedPayload?.explanation || "Design report is currently unavailable. Please try again.";

  const tips =
    Array.isArray(mergedPayload?.tips) && mergedPayload.tips.length > 0 ? mergedPayload.tips : [];

  const palette = mergedPayload?.palette || null;

  const layoutSuggestions = proNow ? normalizeLayoutSuggestions(mergedPayload) : [];
  const rawFurniture = proNow ? normalizeFurnitureArray(mergedPayload) : [];
  const furnitureMatches = proNow ? rawFurniture.map(normalizeFurnitureItem) : [];

  return { explanation, tips, palette, layoutSuggestions, furnitureMatches };
};
