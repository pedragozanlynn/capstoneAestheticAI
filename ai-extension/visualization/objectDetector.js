// visualization/objectDetector.js
// ✅ Keeps detectFurnitureObjectsFromImage (do not remove)
// ✅ Adds detectRoomObjects (wrapper for orchestrator import)
// ✅ Adds buildLayoutSuggestionsFromDetections (for layoutSuggestions)

import { spawn } from "child_process";
import path from "path";

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * @param {string} imagePath - local file path (must exist on server)
 * @param {object} options
 * @param {string} options.pythonCmd - "python" or "python3"
 * @param {number} options.timeoutMs - default 15000
 * @returns {Promise<{objects: string[], raw: any[], conf: Record<string, number>, boxes?: any[], error?: string}>}
 *
 * NOTE: If your detect.py can return boxes, output JSON like:
 * {
 *   "objects": ["sofa","coffee table"],
 *   "conf": {"sofa":0.72},
 *   "boxes": [
 *     {"label":"sofa","x":0.08,"y":0.45,"w":0.55,"h":0.28},
 *     {"label":"coffee table","x":0.46,"y":0.58,"w":0.18,"h":0.12}
 *   ]
 * }
 * where x,y,w,h are normalized 0..1 relative to image.
 */
export function detectFurnitureObjectsFromImage(
  imagePath,
  { pythonCmd = "python", timeoutMs = 15000 } = {}
) {
  return new Promise((resolve) => {
    if (!imagePath) return resolve({ objects: [], raw: [], conf: {}, boxes: [], error: "No imagePath" });

    const scriptPath = path.resolve(process.cwd(), "services/vision/detect.py");
    const args = [scriptPath, "--image", imagePath, "--conf", "0.30"];

    const child = spawn(pythonCmd, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    const killTimer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {}
      resolve({ objects: [], raw: [], conf: {}, boxes: [], error: "Object detection timeout" });
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d) => (stderr += d.toString("utf8")));

    child.on("close", () => {
      clearTimeout(killTimer);

      const parsed = safeJsonParse(stdout.trim());
      if (parsed && typeof parsed === "object") {
        return resolve({
          objects: Array.isArray(parsed.objects) ? parsed.objects : [],
          raw: Array.isArray(parsed.raw) ? parsed.raw : [],
          conf: parsed.conf && typeof parsed.conf === "object" ? parsed.conf : {},
          boxes: Array.isArray(parsed.boxes) ? parsed.boxes : [], // ✅ optional
          error: parsed.error,
        });
      }

      resolve({
        objects: [],
        raw: [],
        conf: {},
        boxes: [],
        error: stderr || "Object detection failed (invalid JSON output)",
      });
    });
  });
}

/**
 * Map detected needs into your matcher-friendly terms.
 */
export function normalizeDetectedNeeds(needs = []) {
  const map = {
    tv: "tv console",
    "tv stand": "tv console",
    "center table": "coffee table",
    couch: "sofa",
  };

  return (Array.isArray(needs) ? needs : [])
    .map((n) => String(n || "").toLowerCase().trim())
    .filter(Boolean)
    .map((n) => map[n] || n);
}

/* ===============================
   ✅ NEW: convert boxes -> position text
   =============================== */
function positionFromBox(box) {
  // expects normalized box: x,y,w,h in 0..1
  const x = Number(box?.x);
  const y = Number(box?.y);
  const w = Number(box?.w);
  const h = Number(box?.h);

  if (![x, y, w, h].every((n) => Number.isFinite(n))) return null;

  const cx = x + w / 2;
  const cy = y + h / 2;

  const horiz = cx < 0.33 ? "left side" : cx > 0.66 ? "right side" : "center";
  const vert = cy < 0.33 ? "front area" : cy > 0.66 ? "back area" : "middle area";

  return `${vert}, ${horiz}`;
}

/**
 * ✅ NEW: Build layoutSuggestions from detections
 * - If boxes exist: uses them for "saan nakatayo"
 * - If no boxes: returns generic placements per item
 */
export function buildLayoutSuggestionsFromDetections(detected = {}) {
  const objects = Array.isArray(detected?.objects) ? detected.objects : [];
  const boxes = Array.isArray(detected?.boxes) ? detected.boxes : [];

  const normalizedObjects = normalizeDetectedNeeds(objects);

  // Map label -> best box (highest conf if you have it; otherwise first)
  const boxByLabel = new Map();
  for (const b of boxes) {
    const label = String(b?.label || b?.name || "").toLowerCase().trim();
    if (!label) continue;
    if (!boxByLabel.has(label)) boxByLabel.set(label, b);
  }

  // Generic fallback placements (if no boxes)
  const generic = {
    sofa: "Sofa: left wall (centered)",
    "coffee table": "Coffee Table: in front of sofa",
    "tv console": "TV Console: opposite sofa",
    bed: "Bed: back wall (centered)",
    wardrobe: "Wardrobe: right side",
    nightstand: "Nightstand: beside bed",
    desk: "Desk: near window",
    chair: "Chair: aligned with desk",
    rug: "Rug: under main furniture",
  };

  return normalizedObjects
    .map((obj) => {
      // try find a box for this object label
      // note: your detect.py label might be "tv" etc; normalizedObjects already fixed some,
      // but box labels might still be raw; try both.
      const rawBox =
        boxByLabel.get(obj) ||
        boxByLabel.get(obj.replace(" console", "")) ||
        boxByLabel.get(obj.replace(" table", "")) ||
        null;

      const pos = rawBox ? positionFromBox(rawBox) : null;

      if (pos) {
        // Example: "Sofa: middle area, left side"
        const title = obj
          .split(" ")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
        return `${title}: ${pos}`;
      }

      // fallback generic if no boxes
      if (generic[obj]) return generic[obj];

      // last resort
      const title = obj
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      return `${title}: place near wall with clear circulation`;
    })
    .slice(0, 10);
}

/**
 * ✅ NEW: This is what your orchestrator should import
 * import { detectRoomObjects } from "../visualization/objectDetector.js"
 */
export async function detectRoomObjects(imagePath, options = {}) {
  const res = await detectFurnitureObjectsFromImage(imagePath, options);

  const objects = normalizeDetectedNeeds(res.objects);
  const boxes = Array.isArray(res.boxes) ? res.boxes : [];

  return {
    objects,
    boxes,           // if detect.py provides it
    conf: res.conf || {},
    raw: res.raw || [],
    error: res.error,
    layoutSuggestions: buildLayoutSuggestionsFromDetections({ objects, boxes }),
  };
}
