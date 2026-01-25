// services/promptFilterService.js
// ✅ Centralized prompt filtering + sanitation
// - Use validatePrompt() on SEND (blocking)
// - Use normalizePrompt() for UI counting + cleanup

export const PROMPT_FILTER = {
    MIN: 3,
    MAX: 600,
    MAX_LINKS: 2, // allow up to 2 links; block 3+
    REPEAT_CHAR_LIMIT: 7, // 8 repeated characters triggers
    REPEAT_WORD_LIMIT: 6, // 7 repeated words triggers
  };
  
  // ✅ Normalization used everywhere (safe + predictable)
  export function normalizePrompt(input = "") {
    return String(input || "")
      .replace(/\u00A0/g, " ") // NBSP
      .replace(/\s+/g, " ")
      .trim();
  }
  
  function countAlphaNum(s) {
    return (normalizePrompt(s).match(/[a-zA-Z0-9]/g) || []).length;
  }
  
  function isOnlySymbolsOrEmoji(s) {
    const t = normalizePrompt(s);
    if (!t) return true;
    return countAlphaNum(t) === 0;
  }
  
  function isRepeatedCharSpam(s) {
    const t = normalizePrompt(s);
    const n = PROMPT_FILTER.REPEAT_CHAR_LIMIT;
    // any char repeated >= n+1 times, e.g. aaaaaaaa / ????????
    return new RegExp(`(.)\\1{${n},}`).test(t);
  }
  
  function isRepeatedWordSpam(s) {
    const t = normalizePrompt(s);
    const n = PROMPT_FILTER.REPEAT_WORD_LIMIT;
    // word word word ... (>= n+1 repeats)
    return new RegExp(`(\\b\\w+\\b)(\\s+\\1){${n},}`, "i").test(t);
  }
  
  function countLinks(s) {
    const t = normalizePrompt(s);
    return (t.match(/https?:\/\/\S+/gi) || []).length;
  }
  
  /**
   * ✅ Strict validation for SEND-time
   * Returns:
   * {
   *   ok: boolean,
   *   cleaned: string,
   *   error?: string,
   *   warn?: string
   * }
   */
  export function validatePrompt(raw) {
    const cleaned = normalizePrompt(raw);
  
    if (!cleaned) {
      return { ok: false, cleaned, error: "Please type a message." };
    }
  
    if (cleaned.length > PROMPT_FILTER.MAX) {
      return {
        ok: false,
        cleaned: cleaned.slice(0, PROMPT_FILTER.MAX),
        error: `Your message is too long. Keep it under ${PROMPT_FILTER.MAX} characters.`,
      };
    }
  
    if (cleaned.length < PROMPT_FILTER.MIN) {
      return {
        ok: false,
        cleaned,
        error:
          "Please add more details (e.g., room type, style, and what you want to improve).",
      };
    }
  
    if (isOnlySymbolsOrEmoji(cleaned)) {
      return {
        ok: false,
        cleaned,
        error: "Please type a clear request (not only symbols or emojis).",
      };
    }
  
    if (isRepeatedCharSpam(cleaned) || isRepeatedWordSpam(cleaned)) {
      return {
        ok: false,
        cleaned,
        error: "Your message looks repetitive. Please type a clearer request.",
      };
    }
  
    const links = countLinks(cleaned);
    if (links >= PROMPT_FILTER.MAX_LINKS + 1) {
      return {
        ok: false,
        cleaned,
        error: "Please avoid sending many links. Summarize what you want instead.",
      };
    }
  
    // optional warning (non-blocking)
    let warn = "";
    if (cleaned.length >= 350) {
      warn = "Tip: Shorter prompts usually produce more accurate design results.";
    }
  
    return { ok: true, cleaned, warn };
  }
  