// services/aiConversationService.js
import { getAuth } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../config/firebase";

const cleanStr = (v) => {
  const s =
    typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
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

const cleanStringArray = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr.map((x) => cleanStr(x)).filter(Boolean);
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

const normalizeFurnitureMatches = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((f) => f && typeof f === "object")
    .map((f) => {
      const name = cleanStr(f.name);
      if (!name) return null;

      const links =
        f.links && typeof f.links === "object"
          ? {
              ...(cleanStr(f.links.shopee) ? { shopee: cleanStr(f.links.shopee) } : {}),
              ...(cleanStr(f.links.lazada) ? { lazada: cleanStr(f.links.lazada) } : {}),
              ...(cleanStr(f.links.ikea) ? { ikea: cleanStr(f.links.ikea) } : {}),
              ...(cleanStr(f.links.marketplace) ? { marketplace: cleanStr(f.links.marketplace) } : {}),
            }
          : null;

      return {
        ...(cleanStr(f.id) ? { id: cleanStr(f.id) } : {}),
        name,
        ...(cleanStr(f.placement) ? { placement: cleanStr(f.placement) } : {}),
        ...(cleanStr(f.query) ? { query: cleanStr(f.query) } : {}),
        ...(links && Object.keys(links).length ? { links } : {}),
      };
    })
    .filter(Boolean);
};

function requireUid() {
  const uid = getAuth().currentUser?.uid;
  if (!uid) throw new Error("Not authenticated (auth.currentUser is null)");
  return uid;
}

export async function ensureAIConversation({ conversationId, title }) {
  if (!conversationId) throw new Error("conversationId required");

  const uid = requireUid();
  if (!String(conversationId).startsWith(uid + "_")) {
    throw new Error("conversationId must start with '<uid>_' (matches Firestore rules)");
  }

  const now = Timestamp.now();

  await setDoc(
    doc(db, "aiConversations", conversationId),
    {
      userId: uid,
      title: cleanStr(title) || "Aesthetic AI",
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );
}

export async function saveAIUserMessage(conversationId, { text, image = null }) {
  if (!conversationId) throw new Error("conversationId required");
  const uid = requireUid();

  const cleanText = cleanStr(text);
  const cleanImage = cleanUrlOrNull(image);

  // ✅ FIX: allow saving when either text OR image exists
  if (!cleanText && !cleanImage) {
    throw new Error("Either text or image is required");
  }

  // ✅ If only image is provided, store a stable placeholder text
  const finalText = cleanText || "Reference image attached.";

  // Ensure parent exists (so rules get() succeeds)
  await setDoc(
    doc(db, "aiConversations", conversationId),
    { userId: uid, updatedAt: serverTimestamp() },
    { merge: true }
  );

  await addDoc(collection(db, "aiConversations", conversationId, "messages"), {
    role: "user",
    senderId: uid,
    text: finalText,
    image: cleanImage,
    createdAt: serverTimestamp(),
  });

  await setDoc(
    doc(db, "aiConversations", conversationId),
    {
      lastMessage: finalText.slice(0, 200),
      lastMode: "design",
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function saveAIResponse(conversationId, payload = {}) {
  if (!conversationId) throw new Error("conversationId required");
  const uid = requireUid();

  // Ensure parent exists/owned (so rules get() succeeds)
  await setDoc(
    doc(db, "aiConversations", conversationId),
    { userId: uid, updatedAt: serverTimestamp() },
    { merge: true }
  );

  const mode = payload?.mode === "customize" ? "customize" : "design";

  const safe = {
    role: "ai",
    senderId: uid,
    mode,
    explanation: cleanStr(payload?.explanation),
    tips: cleanStringArray(payload?.tips),
    palette: normalizePalette(payload?.palette),
    layoutSuggestions: cleanStringArray(payload?.layoutSuggestions),
    furnitureMatches: normalizeFurnitureMatches(payload?.furnitureMatches),
    inputImage: cleanUrlOrNull(payload?.inputImage),
    image: cleanUrlOrNull(payload?.image),
    sessionId: payload?.sessionId ? cleanStr(payload.sessionId) : null,
    createdAt: serverTimestamp(),
  };

  await addDoc(collection(db, "aiConversations", conversationId, "messages"), safe);

  await setDoc(
    doc(db, "aiConversations", conversationId),
    {
      sessionId: safe.sessionId,
      lastReferenceImage:
        cleanUrlOrNull(payload?.lastReferenceImage) ||
        safe.image ||
        safe.inputImage ||
        null,
      lastMessage: safe.explanation ? safe.explanation.slice(0, 200) : "",
      lastMode: mode,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
