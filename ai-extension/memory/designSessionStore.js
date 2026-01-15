/**
 * SESSION STORE
 * ------------------------------------------------
 * Current: In-memory (Map)
 * Future: Firebase / Firestore
 *
 * IMPORTANT:
 * - Keep the function signatures the same
 * - This allows seamless DB migration later
 */

// ===============================
// 🔹 IN-MEMORY STORE (DEV / LOCAL)
// ===============================
const sessions = new Map();

/**
 * Get a session by ID
 * @param {string} sessionId
 * @returns {object|null}
 */
export function getSession(sessionId) {
  if (!sessionId) return null;
  return sessions.get(sessionId) || null;
}

/**
 * Save or update a session
 * @param {string} sessionId
 * @param {object} data
 */
export function saveSession(sessionId, data) {
  if (!sessionId || !data) return;

  sessions.set(sessionId, {
    ...data,
    updatedAt: Date.now(), // helpful for cleanup later
  });
}

/**
 * Optional: delete a session
 * (useful for logout / reset)
 */
export function clearSession(sessionId) {
  if (!sessionId) return;
  sessions.delete(sessionId);
}

/**
 * Optional: cleanup stale sessions
 * (call this on an interval if needed)
 */
export function cleanupSessions(maxAgeMs = 1000 * 60 * 60) {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - (session.updatedAt || 0) > maxAgeMs) {
      sessions.delete(id);
    }
  }
}

/* =================================================
   🔥 FIREBASE (FUTURE IMPLEMENTATION - COMMENTED)
   =================================================

import { getFirestore, doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { initializeApp } from "firebase/app";

const firebaseApp = initializeApp({
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
});

const db = getFirestore(firebaseApp);

export async function getSession(sessionId) {
  if (!sessionId) return null;

  const ref = doc(db, "sessions", sessionId);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function saveSession(sessionId, data) {
  if (!sessionId || !data) return;

  const ref = doc(db, "sessions", sessionId);
  await setDoc(ref, {
    ...data,
    updatedAt: Date.now(),
  }, { merge: true });
}

export async function clearSession(sessionId) {
  if (!sessionId) return;

  const ref = doc(db, "sessions", sessionId);
  await deleteDoc(ref);
}

================================================= */
