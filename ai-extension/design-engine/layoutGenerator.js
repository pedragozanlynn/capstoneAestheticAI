// design-engine/layoutGenerator.js
// ✅ COMPLETE UPDATED VERSION
//
// Goal:
// - If detections exist: treat them as "existing furniture from the photo"
// - Then generate a BETTER SUGGESTED LAYOUT (not copying the photo positions)
// - Return both existingItems and suggestedItems, plus human-friendly placements + changes
//
// Supported detections formats:
// A) { image:{width,height}, objects:[{label,score,bbox:{x,y,w,h}}] }   // bbox may be px or normalized
// B) { boxes:[{label,x,y,w,h,score|confidence}] }                      // normalized 0..1 (recommended)
// C) { objects:["sofa","bed"] }                                        // no boxes -> fallback procedural

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function prettifyId(id) {
  return String(id || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function normalizeLabel(s = "") {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[_-]/g, " ")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");
}

/* ===============================
   ✅ Canonical mapping: detector label -> layout item id
   Extend as needed to match your detector classes
   =============================== */
const LABEL_TO_ID = new Map([
  // Living
  ["sofa", "sofa"],
  ["couch", "sofa"],
  ["armchair", "accent_chair"],
  ["accent chair", "accent_chair"],
  ["chair", "chair"],
  ["coffee table", "coffee_table"],
  ["center table", "coffee_table"],
  ["table", "coffee_table"],
  ["tv", "tv_console"],
  ["television", "tv_console"],
  ["tv stand", "tv_console"],
  ["media console", "tv_console"],
  ["cabinet", "storage_cabinet"],
  ["storage cabinet", "storage_cabinet"],
  ["shelf", "bookshelf"],
  ["shelves", "bookshelf"],
  ["bookshelf", "bookshelf"],
  ["rug", "rug"],
  ["carpet", "rug"],

  // Bedroom
  ["bed", "bed"],
  ["bed frame", "bed"],
  ["wardrobe", "wardrobe"],
  ["closet", "wardrobe"],
  ["nightstand", "nightstand"],
  ["bedside table", "nightstand"],
  ["desk", "desk"],
  ["mirror", "mirror"],

  // Kitchen / Dining
  ["dining table", "dining_table"],
  ["dining chair", "dining_chair"],
  ["kitchen island", "island"],
  ["island", "island"],
  ["stool", "bar_stool"],
  ["bar stool", "bar_stool"],

  // Cafe / Retail
  ["counter", "service_counter"],
  ["service counter", "service_counter"],
  ["cashier", "cashier"],
  ["rack", "rack"], // rack -> left/right decided by bbox center
  ["display rack", "rack"],
]);

/* ===============================
   ✅ More accurate position description
   Uses wall proximity instead of rough 33/66 split
   =============================== */
function describePosition(it, room) {
  const W = room.width;
  const L = room.length;

  const cx = it.x + it.width / 2;
  const cy = it.y + it.height / 2;

  const nx = W > 0 ? cx / W : 0.5;
  const ny = L > 0 ? cy / L : 0.5;

  const distLeft = nx;
  const distRight = 1 - nx;
  const distFront = ny;
  const distBack = 1 - ny;

  const wallThresh = 0.18;
  let horiz = "center";
  let vert = "middle";

  if (distLeft < wallThresh) horiz = "left wall";
  else if (distRight < wallThresh) horiz = "right wall";
  else if (nx < 0.4) horiz = "left side";
  else if (nx > 0.6) horiz = "right side";

  if (distFront < wallThresh) vert = "front area";
  else if (distBack < wallThresh) vert = "back wall";
  else if (ny < 0.4) vert = "front-middle";
  else if (ny > 0.6) vert = "back-middle";

  return `${vert}, ${horiz}`;
}

function reasonForItem(id, roomType) {
  const t = String(roomType || "").toLowerCase();
  const k = String(id || "").toLowerCase();

  if (k.includes("bed")) return "Anchors the room and keeps circulation straightforward";
  if (k.includes("wardrobe")) return "Maximizes storage while staying near the wall edge";
  if (k.includes("nightstand")) return "Keeps essentials reachable from the bed";
  if (k.includes("desk")) return "Supports productivity and uses available light efficiently";
  if (k.includes("sofa")) return "Defines the main seating zone and improves conversation flow";
  if (k.includes("tv")) return "Aligns viewing angles with the seating position";
  if (k.includes("coffee")) return "Improves accessibility and comfort within the seating zone";
  if (k.includes("rug")) return "Visually defines the main zone and adds warmth";

  if ((t.includes("retail") || t.includes("store")) && k.includes("rack"))
    return "Keeps a central aisle clear for browsing flow";
  if ((t.includes("cafe") || t.includes("coffee")) && k.includes("counter"))
    return "Supports ordering workflow and queue flow";

  return "Improves usability and maintains clear circulation";
}

function inferZones(roomType) {
  const t = String(roomType || "").toLowerCase();

  if (t === "bedroom") {
    return [
      { name: "Sleep Zone", description: "Bed area acts as the primary anchor of the room" },
      { name: "Storage Zone", description: "Wardrobe/storage placed along edges to keep the center open" },
      { name: "Task Zone", description: "Desk area near window (if available) for better light" },
    ];
  }

  if (t === "living_room") {
    return [
      { name: "Seating Zone", description: "Sofa + coffee table grouped for conversation flow" },
      { name: "Media Zone", description: "TV/console aligned to seating for better viewing angles" },
      { name: "Circulation Zone", description: "Clear paths around the rug and focal area" },
    ];
  }

  if (t === "home_office" || t === "office") {
    return [
      { name: "Work Zone", description: "Desk area positioned for focus and ergonomic access" },
      { name: "Storage Zone", description: "Shelving/bookshelf placed along wall edges" },
    ];
  }

  if (t === "kitchen") {
    return [
      { name: "Prep Zone", description: "Base cabinets support main prep workflow" },
      { name: "Cook/Work Zone", description: "Island (if present) supports extra prep and serving" },
    ];
  }

  if (t === "coffee_shop" || t === "cafe") {
    return [
      { name: "Service Zone", description: "Counter near front for ordering and workflow" },
      { name: "Customer Zone", description: "Open area kept for circulation and queueing" },
    ];
  }

  if (t === "retail_store" || t === "retail" || t === "store") {
    return [
      { name: "Display Zone", description: "Racks along sides for browsing flow" },
      { name: "Main Aisle", description: "Center walkway kept open for customer circulation" },
      { name: "Checkout Zone", description: "Cashier near entry for visibility and control" },
    ];
  }

  return [{ name: "Main Zone", description: "Primary furniture grouped to support the room’s use" }];
}

/* ===============================
   ✅ Detection parsing (robust)
   Converts possible detection formats into normalized boxes list:
   [{label, score, x, y, w, h, isNormalized:true}]
   =============================== */
function normalizeDetections(detections) {
  const out = { image: detections?.image || null, boxes: [] };

  // Format B: detections.boxes (normalized 0..1)
  if (Array.isArray(detections?.boxes) && detections.boxes.length > 0) {
    out.boxes = detections.boxes
      .map((b) => {
        const label = normalizeLabel(b?.label || b?.name);
        const score = Number(b?.score ?? b?.confidence ?? 0);
        const x = Number(b?.x);
        const y = Number(b?.y);
        const w = Number(b?.w ?? b?.width);
        const h = Number(b?.h ?? b?.height);
        if (!label || [x, y, w, h].some((n) => !Number.isFinite(n) || n <= 0)) return null;

        const isNormalized = x <= 1.2 && y <= 1.2 && w <= 1.2 && h <= 1.2;
        return { label, score, x, y, w, h, isNormalized };
      })
      .filter(Boolean);

    return out;
  }

  // Format A: detections.objects with bbox
  if (Array.isArray(detections?.objects) && detections.objects.length > 0) {
    // If objects are strings only, no boxes
    if (typeof detections.objects[0] === "string") return out;

    const imgW = Number(detections?.image?.width);
    const imgH = Number(detections?.image?.height);

    out.boxes = detections.objects
      .map((o) => {
        const label = normalizeLabel(o?.label);
        const score = Number(o?.score ?? o?.confidence ?? 0);
        const bb = o?.bbox || o?.box || {};
        const x = Number(bb?.x);
        const y = Number(bb?.y);
        const w = Number(bb?.w ?? bb?.width);
        const h = Number(bb?.h ?? bb?.height);
        if (!label || [x, y, w, h].some((n) => !Number.isFinite(n) || n <= 0)) return null;

        // If we have image dims, we can detect if bbox is px
        const looksPx =
          Number.isFinite(imgW) &&
          Number.isFinite(imgH) &&
          (x > 1.5 || y > 1.5 || w > 1.5 || h > 1.5);

        const isNormalized = !looksPx; // if px -> not normalized
        return { label, score, x, y, w, h, isNormalized };
      })
      .filter(Boolean);

    return out;
  }

  return out;
}

/* ===============================
   ✅ Convert normalized/px boxes -> EXISTING room items (meters)
   - Deduplicate by canonical item id (keep highest score)
   - Uses bbox size as approximate footprint
   =============================== */
function detectionsToItems({ room, detections, scoreMin = 0.25 } = {}) {
  const W = room.width;
  const L = room.length;

  const norm = normalizeDetections(detections);
  const boxes = Array.isArray(norm.boxes) ? norm.boxes : [];
  if (boxes.length === 0) return [];

  const imgW = Number(detections?.image?.width);
  const imgH = Number(detections?.image?.height);

  const best = new Map();

  for (const b of boxes) {
    const score = Number.isFinite(b.score) ? b.score : 0;
    if (score < scoreMin) continue;

    const id = LABEL_TO_ID.get(b.label);
    if (!id) continue;

    let nx = b.x,
      ny = b.y,
      nw = b.w,
      nh = b.h;

    if (!b.isNormalized) {
      if (!Number.isFinite(imgW) || !Number.isFinite(imgH) || imgW <= 0 || imgH <= 0) continue;
      nx = b.x / imgW;
      ny = b.y / imgH;
      nw = b.w / imgW;
      nh = b.h / imgH;
    }

    nx = clamp(nx, 0, 0.98);
    ny = clamp(ny, 0, 0.98);
    nw = clamp(nw, 0.02, 1);
    nh = clamp(nh, 0.02, 1);

    const prev = best.get(id);
    if (!prev || score > prev.score) best.set(id, { id, score, nx, ny, nw, nh, rawLabel: b.label });
  }

  const items = [];

  for (const d of best.values()) {
    const itemW = clamp(W * d.nw, 0.35, W * 0.9);
    const itemH = clamp(L * d.nh, 0.35, L * 0.9);

    let itemX = clamp(W * d.nx, 0.10, W - 0.10 - itemW);
    let itemY = clamp(L * d.ny, 0.10, L - 0.10 - itemH);

    let finalId = d.id;

    // rack -> assign left/right based on bbox center
    if (finalId === "rack") {
      const cx = d.nx + d.nw / 2;
      finalId = cx < 0.5 ? "rack_left" : "rack_right";
    }

    items.push({
      id: finalId,
      x: round2(itemX),
      y: round2(itemY),
      width: round2(itemW),
      height: round2(itemH),
      source: "detection",
      confidence: round2(d.score),
      detectedLabel: d.rawLabel,
    });
  }

  return items;
}

/* ===============================
   ✅ Helper: safe wall snapping + alignment
   =============================== */
function clampItem(it, room, pad = 0.25) {
  const W = room.width;
  const L = room.length;
  it.x = clamp(it.x, pad, W - pad - it.width);
  it.y = clamp(it.y, pad, L - pad - it.height);
  it.x = round2(it.x);
  it.y = round2(it.y);
  it.width = round2(it.width);
  it.height = round2(it.height);
}

function snapToWall(it, room, wall, pad = 0.25) {
  const W = room.width;
  const L = room.length;
  if (!it) return;

  if (wall === "left") it.x = pad;
  if (wall === "right") it.x = W - pad - it.width;
  if (wall === "front") it.y = pad;
  if (wall === "back") it.y = L - pad - it.height;
}

/* ===============================
   ✅ Layout improvement engine
   - Inputs: existingItems (from photo detections)
   - Output: suggestedItems (improved arrangement)
   - Does NOT preserve photo layout; it optimizes flow and zoning
   =============================== */
function improveDetectedLayout({ room, existingItems }) {
  const pad = 0.25;
  const W = room.width;
  const L = room.length;

  const items = (existingItems || []).map((it) => ({ ...it, source: "suggested" }));

  const get = (id) => items.find((x) => x.id === id);

  // Small utilities
  const centerAlongX = (it) => {
    if (!it) return;
    it.x = (W - it.width) / 2;
  };
  const centerAlongY = (it) => {
    if (!it) return;
    it.y = (L - it.height) / 2;
  };
  const alignCenterY = (a, b) => {
    if (!a || !b) return;
    a.y = b.y + b.height / 2 - a.height / 2;
  };
  const alignCenterX = (a, b) => {
    if (!a || !b) return;
    a.x = b.x + b.width / 2 - a.width / 2;
  };

  const roomType = String(room?.type || "unknown");

  // ---------- LIVING ROOM ----------
  if (roomType === "living_room") {
    const sofa = get("sofa");
    const tv = get("tv_console");
    const coffee = get("coffee_table");
    const rug = get("rug");
    const accent = get("accent_chair");

    // Anchor: sofa on left wall, centered
    if (sofa) {
      snapToWall(sofa, room, "left", pad);
      centerAlongY(sofa);
      clampItem(sofa, room, pad);
    }

    // TV opposite sofa on right wall, aligned to sofa centerline
    if (tv) {
      snapToWall(tv, room, "right", pad);
      if (sofa) alignCenterY(tv, sofa);
      clampItem(tv, room, pad);
    }

    // Coffee table between sofa and TV (comfortable reach)
    if (coffee) {
      if (sofa && tv) {
        const minGap = 0.55;
        const maxGap = 0.8;
        const available = tv.x - (sofa.x + sofa.width);
        const gap = clamp(available * 0.35, minGap, maxGap);
        coffee.x = sofa.x + sofa.width + gap;
        alignCenterY(coffee, sofa);
      } else if (sofa) {
        coffee.x = sofa.x + sofa.width + 0.65;
        alignCenterY(coffee, sofa);
      } else {
        centerAlongX(coffee);
        centerAlongY(coffee);
      }
      clampItem(coffee, room, pad);
    }

    // Rug: center under seating zone (slightly under sofa front)
    if (rug) {
      if (sofa) {
        rug.x = clamp(sofa.x + 0.15, pad, W - pad - rug.width);
        rug.y = clamp(sofa.y - 0.25, pad, L - pad - rug.height);
      } else {
        centerAlongX(rug);
        centerAlongY(rug);
      }
      clampItem(rug, room, pad);
    }

    // Accent chair: place near coffee table but not blocking path
    if (accent && coffee) {
      // try front-right-ish relative to coffee
      accent.x = clamp(coffee.x + coffee.width + 0.35, pad, W - pad - accent.width);
      accent.y = clamp(coffee.y + coffee.height + 0.35, pad, L - pad - accent.height);
      clampItem(accent, room, pad);
    }
  }

  // ---------- BEDROOM ----------
  if (roomType === "bedroom") {
    const bed = get("bed");
    const wardrobe = get("wardrobe");
    const night = get("nightstand");
    const desk = get("desk");

    // Bed: front wall center
    if (bed) {
      snapToWall(bed, room, "front", pad);
      centerAlongX(bed);
      clampItem(bed, room, pad);
    }

    // Wardrobe: right wall, toward back half
    if (wardrobe) {
      snapToWall(wardrobe, room, "right", pad);
      if (bed) wardrobe.y = clamp(bed.y + bed.height + 0.9, pad, L - pad - wardrobe.height);
      clampItem(wardrobe, room, pad);
    }

    // Nightstand: left side of bed near head area
    if (night && bed) {
      night.x = clamp(bed.x - night.width - 0.15, pad, W - pad - night.width);
      night.y = clamp(bed.y + bed.height - night.height - 0.25, pad, L - pad - night.height);
      clampItem(night, room, pad);
    }

    // Desk: back-left corner by default
    if (desk) {
      snapToWall(desk, room, "left", pad);
      snapToWall(desk, room, "back", pad);
      clampItem(desk, room, pad);
    }
  }

  // ---------- HOME OFFICE ----------
  if (roomType === "home_office" || roomType === "office") {
    const desk = get("desk");
    const chair = get("chair");
    const shelf = get("bookshelf");

    if (desk) {
      snapToWall(desk, room, "left", pad);
      snapToWall(desk, room, "front", pad);
      clampItem(desk, room, pad);
    }

    if (chair && desk) {
      chair.x = clamp(desk.x + desk.width * 0.35, pad, W - pad - chair.width);
      chair.y = clamp(desk.y + desk.height + 0.25, pad, L - pad - chair.height);
      clampItem(chair, room, pad);
    }

    if (shelf) {
      snapToWall(shelf, room, "right", pad);
      snapToWall(shelf, room, "back", pad);
      clampItem(shelf, room, pad);
    }
  }

  // ---------- KITCHEN ----------
  if (roomType === "kitchen") {
    const island = get("island");

    if (island) {
      // island centered with clear edges
      centerAlongX(island);
      centerAlongY(island);
      clampItem(island, room, pad);
    }
  }

  // ---------- CAFE ----------
  if (roomType === "coffee_shop" || roomType === "cafe") {
    const counter = get("service_counter");

    if (counter) {
      // counter near front-left by default
      snapToWall(counter, room, "left", pad);
      snapToWall(counter, room, "front", pad);
      clampItem(counter, room, pad);
    }
  }

  // ---------- RETAIL ----------
  if (roomType === "retail_store" || roomType === "retail" || roomType === "store") {
    const rackL = get("rack_left");
    const rackR = get("rack_right");
    const cashier = get("cashier");

    if (rackL) {
      snapToWall(rackL, room, "left", pad);
      snapToWall(rackL, room, "front", pad);
      clampItem(rackL, room, pad);
    }
    if (rackR) {
      snapToWall(rackR, room, "right", pad);
      snapToWall(rackR, room, "front", pad);
      clampItem(rackR, room, pad);
    }
    if (cashier) {
      snapToWall(cashier, room, "right", pad);
      snapToWall(cashier, room, "front", pad);
      clampItem(cashier, room, pad);
    }
  }

  // final clamp for anything not covered
  for (const it of items) clampItem(it, room, pad);

  return items;
}

/* ===============================
   ✅ Output builder (existing vs suggested)
   placements include current + suggested positions and movement delta
   =============================== */
function buildLayoutSuggestions({ room, existingItems = [], suggestedItems = [], fallbackItems = [] }) {
  const roomType = String(room?.type || "unknown");

  const usingDetections = existingItems.length > 0;
  const itemsForLegacy = usingDetections ? suggestedItems : fallbackItems;

  const summary = usingDetections
    ? `Suggested ${roomType} improvement layout (${round2(room.length)}m x ${round2(
        room.width
      )}m). Detected furniture was interpreted from the image and then rearranged to improve zoning, alignment, and circulation.`
    : `Suggested ${roomType} layout (${round2(room.length)}m x ${round2(
        room.width
      )}m) with clear circulation and practical zoning.`;

  const zones = inferZones(roomType);

  // legacy placements (for your current UI)
  const placements = (itemsForLegacy || [])
    .filter((it) => it?.id)
    .map((it) => ({
      item: prettifyId(it.id),
      position: describePosition(it, room),
      reason: reasonForItem(it.id, roomType),
      confidence: typeof it?.confidence === "number" ? it.confidence : undefined,
      source: it?.source || "procedural",
    }));

  // richer comparison (optional for UI)
  const existingMap = new Map((existingItems || []).map((it) => [it.id, it]));
  const suggestedMap = new Map((suggestedItems || []).map((it) => [it.id, it]));
  const allIds = Array.from(new Set([...existingMap.keys(), ...suggestedMap.keys()]));

  const changes = usingDetections
    ? allIds.map((id) => {
        const ex = existingMap.get(id);
        const sg = suggestedMap.get(id);
        if (!sg) return null;

        const dx = ex ? round2(sg.x - ex.x) : undefined;
        const dy = ex ? round2(sg.y - ex.y) : undefined;

        const moved =
          typeof dx === "number" && typeof dy === "number" && (Math.abs(dx) >= 0.1 || Math.abs(dy) >= 0.1);

        return {
          id,
          item: prettifyId(id),
          currentPosition: ex ? describePosition(ex, room) : undefined,
          suggestedPosition: describePosition(sg, room),
          deltaMeters: ex ? { dx, dy } : undefined,
          changed: ex ? moved : true,
          reason: reasonForItem(id, roomType),
          confidence: ex?.confidence,
        };
      }).filter(Boolean)
    : [];

  // return both:
  // - items (legacy consumers)
  // - existingItems / suggestedItems / changes for better UI
  return {
    summary,
    zones,
    placements,
    items: itemsForLegacy,
    existingItems: usingDetections ? existingItems : [],
    suggestedItems: usingDetections ? suggestedItems : [],
    changes,
  };
}

/* ===============================
   Main
   - If detections with boxes exist:
       existingItems = from detections
       suggestedItems = improved layout (not copied)
   - Else fallback to procedural layout (your original logic)
   =============================== */
export function generateLayout(room, detections = null) {
  const safeLength = typeof room?.length === "number" && room.length > 0 ? room.length : 4;
  const safeWidth = typeof room?.width === "number" && room.width > 0 ? room.width : 3;

  const L = clamp(safeLength, 1.5, 30);
  const W = clamp(safeWidth, 1.5, 30);

  const rawType = String(room?.type || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");

  const baseRoom = { ...room, type: rawType || "unknown", length: L, width: W };

  // ✅ 1) Detection-driven (interpret existing → suggest improvements)
  const hasBoxes = detections && (Array.isArray(detections?.boxes) || Array.isArray(detections?.objects));
  const existingItems = hasBoxes ? detectionsToItems({ room: baseRoom, detections, scoreMin: 0.25 }) : [];

  if (existingItems.length > 0) {
    const suggestedItems = improveDetectedLayout({ room: baseRoom, existingItems });
    return buildLayoutSuggestions({ room: baseRoom, existingItems, suggestedItems });
  }

  // ✅ 2) Fallback: procedural layout (your original logic)
  const PAD = 0.25;
  const CLEAR = 0.7;

  const isBedroom = rawType === "bedroom";
  const isLiving = rawType === "living_room";
  const isOffice = rawType === "home_office" || rawType === "office";
  const isKitchen = rawType === "kitchen";
  const isCafe = rawType === "coffee_shop" || rawType === "cafe";
  const isRetail = rawType === "retail_store" || rawType === "retail" || rawType === "store";

  const items = [];

  const place = (obj) => {
    const fixed = {
      ...obj,
      x: round2(clamp(obj.x, PAD, W - PAD - obj.width)),
      y: round2(clamp(obj.y, PAD, L - PAD - obj.height)),
      width: round2(obj.width),
      height: round2(obj.height),
      source: "procedural",
    };
    items.push(fixed);
  };

  const overlaps = (a, b, margin = 0.05) =>
    !(
      a.x + a.width + margin <= b.x ||
      b.x + b.width + margin <= a.x ||
      a.y + a.height + margin <= b.y ||
      b.y + b.height + margin <= a.y
    );

  const tryPlace = (obj, maxTries = 20) => {
    const base = { ...obj };
    for (let i = 0; i < maxTries; i++) {
      const candidate = {
        ...base,
        x: clamp(base.x, PAD, W - PAD - base.width),
        y: clamp(base.y, PAD, L - PAD - base.height),
      };

      const hit = items.some((it) => overlaps(candidate, it, 0.08));
      if (!hit) {
        place(candidate);
        return true;
      }

      base.x += i % 2 === 0 ? 0.15 : -0.15;
      base.y += i % 2 === 0 ? 0.15 : -0.15;
    }
    return false;
  };

  const windowSide = room?.windowSide || (room?.hasWindow ? "left" : null);

  if (isLiving) {
    const sofaW = clamp(W * 0.58, 1.8, 3.0);
    const sofaH = 0.95;

    place({ id: "sofa", x: PAD, y: (L - sofaH) / 2, width: sofaW, height: sofaH });

    tryPlace({
      id: "coffee_table",
      x: PAD + sofaW + 0.35,
      y: (L - 0.65) / 2,
      width: clamp(W * 0.18, 0.7, 1.1),
      height: 0.65,
    });

    tryPlace({ id: "tv_console", x: W - PAD - 1.5, y: (L - 0.45) / 2, width: 1.5, height: 0.45 });

    tryPlace({
      id: "rug",
      x: PAD + 0.25,
      y: (L - 1.7) / 2,
      width: clamp(W * 0.7, 1.8, 3.2),
      height: 1.7,
    });

    return buildLayoutSuggestions({ room: baseRoom, fallbackItems: items });
  }

  if (isBedroom) {
    const bedW = clamp(W * 0.55, 1.4, 2.1);
    const bedH = clamp(L * 0.25, 1.6, 2.0);

    place({ id: "bed", x: (W - bedW) / 2, y: PAD, width: bedW, height: bedH });

    const wardrobeW = clamp(W * 0.18, 0.6, 1.0);
    const wardrobeH = clamp(L * 0.22, 0.5, 0.8);
    tryPlace({
      id: "wardrobe",
      x: W - PAD - wardrobeW,
      y: PAD + bedH + CLEAR,
      width: wardrobeW,
      height: wardrobeH,
    });

    tryPlace({
      id: "nightstand",
      x: (W - bedW) / 2 - 0.45,
      y: PAD + bedH - 0.55,
      width: 0.4,
      height: 0.4,
    });

    if (room?.hasWindow) {
      const deskW = clamp(W * 0.3, 0.9, 1.2);
      const deskH = 0.55;

      const deskPos =
        windowSide === "right"
          ? { x: W - PAD - deskW, y: L - PAD - deskH }
          : { x: PAD, y: L - PAD - deskH };

      tryPlace({ id: "desk", ...deskPos, width: deskW, height: deskH });
      tryPlace({ id: "chair", x: deskPos.x + deskW * 0.35, y: deskPos.y - 0.55, width: 0.5, height: 0.5 });
    }

    tryPlace({
      id: "rug",
      x: (W - bedW) / 2 + bedW * 0.1,
      y: PAD + bedH * 0.65,
      width: bedW * 0.8,
      height: clamp(bedH * 0.6, 1.0, 1.4),
    });

    return buildLayoutSuggestions({ room: baseRoom, fallbackItems: items });
  }

  if (isOffice) {
    const deskW = clamp(W * 0.45, 1.0, 1.6);
    const deskH = 0.6;
    const deskX = windowSide === "right" ? W - PAD - deskW : PAD;

    place({ id: "desk", x: deskX, y: PAD, width: deskW, height: deskH });
    tryPlace({ id: "chair", x: deskX + deskW * 0.35, y: PAD + deskH + 0.25, width: 0.55, height: 0.55 });
    tryPlace({ id: "bookshelf", x: W - PAD - 0.8, y: L - PAD - 0.3, width: 0.8, height: 0.3 });

    return buildLayoutSuggestions({ room: baseRoom, fallbackItems: items });
  }

  if (isKitchen) {
    place({
      id: "base_cabinets",
      x: PAD,
      y: PAD,
      width: clamp(W - PAD * 2, 2.0, W - PAD * 2),
      height: 0.6,
    });

    if (W >= 3.0 && L >= 3.2) {
      tryPlace({ id: "island", x: (W - 1.2) / 2, y: (L - 0.8) / 2, width: 1.2, height: 0.8 });
    }

    return buildLayoutSuggestions({ room: baseRoom, fallbackItems: items });
  }

  if (isCafe) {
    place({
      id: "service_counter",
      x: PAD,
      y: PAD,
      width: clamp(W * 0.6, 2.0, W - PAD * 2),
      height: 0.8,
    });

    return buildLayoutSuggestions({ room: baseRoom, fallbackItems: items });
  }

  if (isRetail) {
    place({
      id: "rack_left",
      x: PAD,
      y: PAD,
      width: 0.8,
      height: clamp(L - PAD * 2, 2.0, L - PAD * 2),
    });
    place({
      id: "rack_right",
      x: W - PAD - 0.8,
      y: PAD,
      width: 0.8,
      height: clamp(L - PAD * 2, 2.0, L - PAD * 2),
    });
    tryPlace({ id: "cashier", x: W - PAD - 1.2, y: PAD + 0.2, width: 1.2, height: 0.6 });

    return buildLayoutSuggestions({ room: baseRoom, fallbackItems: items });
  }

  place({
    id: "rug",
    x: PAD + 0.3,
    y: (L - 1.6) / 2,
    width: clamp(W * 0.6, 1.6, 3.0),
    height: 1.6,
  });

  return buildLayoutSuggestions({ room: baseRoom, fallbackItems: items });
}
