// services/ai/promptValidationService.js
import { normalizePrompt as normalizePromptSvc } from "./promptFilterService";

export const countAlphaNum = (s) => (normalizePromptSvc(s).match(/[a-zA-Z0-9]/g) || []).length;

export const isOnlySymbolsOrEmoji = (s) => {
  const t = normalizePromptSvc(s);
  if (!t) return true;
  return countAlphaNum(t) === 0;
};

export const isRepeatedCharSpam = (s) => /(.)\1{7,}/.test(normalizePromptSvc(s));
export const isRepeatedWordSpam = (s) => /(\b\w+\b)(\s+\1){6,}/i.test(normalizePromptSvc(s));
export const hasTooManyLinks = (s) => (normalizePromptSvc(s).match(/https?:\/\/\S+/gi) || []).length >= 3;

/**
 * validatePromptUI(raw, { strict, PROMPT_MIN, PROMPT_MAX })
 * - pure, reusable
 */
export const validatePromptUI = (
  raw,
  { strict = true, PROMPT_MIN = 3, PROMPT_MAX = 600 } = {}
) => {
  const cleaned = normalizePromptSvc(raw);

  if (!cleaned) {
    if (!strict) return { ok: true, cleaned: "", warn: "" };
    return { ok: false, cleaned, error: "Please type a message." };
  }

  if (cleaned.length > PROMPT_MAX) {
    return {
      ok: false,
      cleaned: cleaned.slice(0, PROMPT_MAX),
      error: `Your message is too long. Keep it under ${PROMPT_MAX} characters.`,
    };
  }

  if (isOnlySymbolsOrEmoji(cleaned)) {
    return { ok: false, cleaned, error: "Please type a clear request (not only symbols or emojis)." };
  }

  if (isRepeatedCharSpam(cleaned) || isRepeatedWordSpam(cleaned)) {
    return { ok: false, cleaned, error: "Your message looks repetitive. Please type a clearer request." };
  }

  if (hasTooManyLinks(cleaned)) {
    return { ok: false, cleaned, error: "Please avoid sending many links. Summarize what you want instead." };
  }

  if (cleaned.length < PROMPT_MIN) {
    if (!strict) {
      return {
        ok: true,
        cleaned,
        warn: "Add more details (e.g., room type, style, and what you want to improve).",
      };
    }
    return {
      ok: false,
      cleaned,
      error: "Please add more details (e.g., room type, style, and what you want to improve).",
    };
  }

  let warn = "";
  if (cleaned.length >= 350) {
    warn = "Tip: Shorter prompts usually produce more accurate design results.";
  }

  return { ok: true, cleaned, warn };
};
