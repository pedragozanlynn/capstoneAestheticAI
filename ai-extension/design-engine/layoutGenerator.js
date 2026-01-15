/**
 * Generate a simple furniture layout for a rectangular room.
 * Coordinates are in meters relative to the room origin (0,0) at top-left.
 * `x,y` are top-left of the furniture rectangle.
 *
 * Expected room shape (minimum):
 * {
 *   length: number, // room depth (y-direction) OR x-direction depending on your renderer
 *   width: number,
 *   type?: string,
 *   furniture?: string[],
 *   hasWindow?: boolean,
 *   windowSide?: "left"|"right"|"front"|"back"|null
 * }
 */
export function generateLayout(room) {
  if (!room || typeof room.length !== "number" || typeof room.width !== "number") return [];

  // Normalize + clamp sizes to avoid weird inputs
  const L = clamp(room.length, 1.5, 30);
  const W = clamp(room.width, 1.5, 30);

  const type = (room.type || "").toLowerCase();
  const isBedroom = type.includes("bedroom");
  const isLiving = type.includes("living");
  const isOffice = type.includes("office") || type.includes("workspace");
  const isKitchen = type.includes("kitchen");
  const isCafe = type.includes("cafe");
  const isRetail = type.includes("retail") || type.includes("store");

  // Global padding from walls (meters)
  const PAD = 0.25;

  // Walkway clearance target (meters)
  const CLEAR = 0.7;

  const items = [];

  // Utility helpers
  const place = (obj) => {
    const fixed = {
      ...obj,
      x: round2(clamp(obj.x, PAD, W - PAD - obj.width)),
      y: round2(clamp(obj.y, PAD, L - PAD - obj.height)),
      width: round2(obj.width),
      height: round2(obj.height),
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
    // place if doesn't overlap existing
    for (let i = 0; i < maxTries; i++) {
      const candidate = {
        ...obj,
        x: clamp(obj.x, PAD, W - PAD - obj.width),
        y: clamp(obj.y, PAD, L - PAD - obj.height),
      };

      const hit = items.some((it) => overlaps(candidate, it, 0.08));
      if (!hit) {
        place(candidate);
        return true;
      }

      // Simple nudges
      obj.x += (i % 2 === 0 ? 0.15 : -0.15);
      obj.y += (i % 2 === 0 ? 0.15 : -0.15);
    }
    return false;
  };

  // Determine window side (used to orient desk/sofa)
  const windowSide = room.windowSide || (room.hasWindow ? "left" : null);

  /* ===============================
     BEDROOM LAYOUT (default)
     =============================== */
  if (isBedroom || (!isLiving && !isOffice && !isKitchen && !isCafe && !isRetail)) {
    // Bed size based on room scale
    const bedW = clamp(W * 0.55, 1.4, 2.1);
    const bedH = clamp(L * 0.25, 1.6, 2.0); // bed depth in y
    // Place bed on back wall (top) centered
    const bed = {
      id: "bed",
      x: (W - bedW) / 2,
      y: PAD,
      width: bedW,
      height: bedH,
    };
    place(bed);

    // Wardrobe on right wall, not blocking bed clearance
    const wardrobeW = clamp(W * 0.18, 0.6, 1.0);
    const wardrobeH = clamp(L * 0.22, 0.5, 0.8);
    tryPlace({
      id: "wardrobe",
      x: W - PAD - wardrobeW,
      y: bed.y + bed.height + CLEAR,
      width: wardrobeW,
      height: wardrobeH,
    });

    // Nightstand near bed (left)
    tryPlace({
      id: "nightstand",
      x: bed.x - 0.45,
      y: bed.y + bed.height - 0.55,
      width: 0.4,
      height: 0.4,
    });

    // Desk near window if present
    if (room.hasWindow) {
      const deskW = clamp(W * 0.3, 0.9, 1.2);
      const deskH = 0.55;

      const deskPos = windowSide === "right"
        ? { x: W - PAD - deskW, y: L - PAD - deskH }
        : { x: PAD, y: L - PAD - deskH };

      tryPlace({
        id: "desk",
        ...deskPos,
        width: deskW,
        height: deskH,
      });

      tryPlace({
        id: "chair",
        x: deskPos.x + deskW * 0.35,
        y: deskPos.y - 0.55,
        width: 0.5,
        height: 0.5,
      });
    }

    // Small rug under lower half of bed
    tryPlace({
      id: "rug",
      x: bed.x + bedW * 0.1,
      y: bed.y + bedH * 0.65,
      width: bedW * 0.8,
      height: clamp(bedH * 0.6, 1.0, 1.4),
    });

    return items;
  }

  /* ===============================
     LIVING ROOM LAYOUT
     =============================== */
  if (isLiving) {
    const sofaW = clamp(W * 0.55, 1.6, 2.6);
    const sofaH = 0.9;

    // Sofa along left wall, centered
    place({
      id: "sofa",
      x: PAD,
      y: (L - sofaH) / 2,
      width: sofaW,
      height: sofaH,
    });

    // Coffee table in front of sofa
    tryPlace({
      id: "coffee_table",
      x: PAD + sofaW + 0.4,
      y: (L - 0.6) / 2,
      width: clamp(W * 0.18, 0.6, 1.0),
      height: 0.6,
    });

    // TV console on opposite wall
    tryPlace({
      id: "tv_console",
      x: W - PAD - 1.4,
      y: (L - 0.45) / 2,
      width: 1.4,
      height: 0.45,
    });

    // Rug centered
    tryPlace({
      id: "rug",
      x: PAD + 0.3,
      y: (L - 1.6) / 2,
      width: clamp(W * 0.65, 1.6, 3.0),
      height: 1.6,
    });

    return items;
  }

  /* ===============================
     HOME OFFICE LAYOUT
     =============================== */
  if (isOffice) {
    const deskW = clamp(W * 0.45, 1.0, 1.6);
    const deskH = 0.6;

    // Desk near window side if present
    const deskX =
      windowSide === "right" ? W - PAD - deskW : PAD;

    place({
      id: "desk",
      x: deskX,
      y: PAD,
      width: deskW,
      height: deskH,
    });

    tryPlace({
      id: "chair",
      x: deskX + deskW * 0.35,
      y: PAD + deskH + 0.25,
      width: 0.55,
      height: 0.55,
    });

    // Bookcase opposite side
    tryPlace({
      id: "bookshelf",
      x: W - PAD - 0.8,
      y: L - PAD - 0.3,
      width: 0.8,
      height: 0.3,
    });

    // Small lounge chair if space allows
    if (W > 3.0 && L > 3.0) {
      tryPlace({
        id: "accent_chair",
        x: W - PAD - 0.8,
        y: (L / 2),
        width: 0.8,
        height: 0.8,
      });
    }

    return items;
  }

  /* ===============================
     KITCHEN LAYOUT (very simplified)
     =============================== */
  if (isKitchen) {
    // Base cabinets along one long wall
    place({
      id: "base_cabinets",
      x: PAD,
      y: PAD,
      width: clamp(W - PAD * 2, 2.0, W - PAD * 2),
      height: 0.6,
    });

    // Optional island if enough space
    if (W >= 3.0 && L >= 3.2) {
      tryPlace({
        id: "island",
        x: (W - 1.2) / 2,
        y: (L - 0.8) / 2,
        width: 1.2,
        height: 0.8,
      });
    }

    // Dining nook if space
    if (W >= 3.5 && L >= 3.5) {
      tryPlace({
        id: "dining_table",
        x: W - PAD - 1.2,
        y: L - PAD - 0.8,
        width: 1.2,
        height: 0.8,
      });
    }

    return items;
  }

  /* ===============================
     CAFE / RETAIL (simplified commercial)
     =============================== */
  if (isCafe) {
    // Counter near front
    place({
      id: "service_counter",
      x: PAD,
      y: PAD,
      width: clamp(W * 0.6, 2.0, W - PAD * 2),
      height: 0.8,
    });

    // Tables in grid
    const tableW = 0.7;
    const tableH = 0.7;
    let x = PAD;
    let y = 1.4;

    while (y + tableH < L - PAD) {
      while (x + tableW < W - PAD) {
        tryPlace({ id: `table_${x.toFixed(1)}_${y.toFixed(1)}`, x, y, width: tableW, height: tableH });
        x += tableW + 0.6;
      }
      x = PAD;
      y += tableH + 0.8;
    }

    return items;
  }

  if (isRetail) {
    // Main aisle in the center; racks along sides
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

    // Cashier near front right
    tryPlace({
      id: "cashier",
      x: W - PAD - 1.2,
      y: PAD + 0.2,
      width: 1.2,
      height: 0.6,
    });

    return items;
  }

  return items;
}

/* ===============================
   Helpers
   =============================== */
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
