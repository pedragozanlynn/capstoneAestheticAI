// services/projectsService.js
import { db } from "../../config/firebase";
import {
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";

const cleanStr = (v) => {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  return s || "";
};

const MAX_STRING_LEN = 200_000;

const cleanUrlOrNull = (v) => {
  const s = cleanStr(v);
  if (!s) return null;
  if (s.length > MAX_STRING_LEN) return null;
  if (s.startsWith("data:image/")) return null;
  if (!/^https?:\/\//i.test(s)) return null;
  return s;
};

const normalizePalette = (p) => {
  if (!p || typeof p !== "object") return null;

  const name = cleanStr(p.name);
  const colors = Array.isArray(p.colors)
    ? p.colors
        .filter((c) => c && typeof c === "object")
        .map((c) => {
          const hex = cleanStr(c.hex);
          if (!hex) return null;
          return { ...(cleanStr(c.name) ? { name: cleanStr(c.name) } : {}), hex };
        })
        .filter(Boolean)
    : [];

  const out = {
    ...(name ? { name } : {}),
    ...(colors.length ? { colors } : {}),
  };

  return Object.keys(out).length ? out : null;
};

/**
 * Save AI result to Projects collection.
 * Data model:
 *  - uid (string)
 *  - title (string)
 *  - image (string)             // AI result image (https)
 *  - inputImage (string|null)   // original reference (https) if customize/design
 *  - prompt (string)
 *  - explanation (string)
 *  - palette (object|null)
 *  - mode (string)              // "design" | "customize"
 *  - createdAt (timestamp)
 */
export const saveResultToProjects = async ({
  uid,
  title = "",
  imageUrl,
  inputImageUrl = null,
  prompt = "",
  explanation = "",
  palette = null,
  mode = "design",
}) => {
  const u = cleanStr(uid);
  const img = cleanUrlOrNull(imageUrl);
  if (!u) throw new Error("saveResultToProjects: missing uid");
  if (!img) throw new Error("saveResultToProjects: missing imageUrl");

  const docRef = await addDoc(collection(db, "projects"), {
    uid: u,
    title: cleanStr(title) || "AI Design",
    image: img,
    inputImage: cleanUrlOrNull(inputImageUrl),
    prompt: cleanStr(prompt),
    explanation: cleanStr(explanation),
    palette: normalizePalette(palette),
    mode: cleanStr(mode) || "design",
    createdAt: serverTimestamp(),
  });

  return { id: docRef.id };
};
