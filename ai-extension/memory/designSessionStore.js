// Simple in-memory session store (can be replaced by DB later)

const sessions = new Map();

export function getSession(sessionId) {
  return sessions.get(sessionId);
}

export function saveSession(sessionId, data) {
  sessions.set(sessionId, data);
}
