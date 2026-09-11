import { useCallback, useState } from "react";

export interface ChatPrefs {
  /** On: Enter sends and Shift+Enter breaks the line. Off: the other way. */
  enterSends: boolean;
  /** Reading size of the transcript. */
  textSize: "default" | "large";
}

const STORAGE_KEY = "botony.chat.prefs";

const DEFAULTS: ChatPrefs = { enterSends: true, textSize: "default" };

function read(): ChatPrefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    // Private mode, a quota, or something hand-edited into the slot. A
    // display preference is never worth failing a render over.
    return DEFAULTS;
  }
}

/**
 * How the composer and the transcript are set, remembered between visits.
 *
 * localStorage is right for exactly this and nothing else here: these are
 * display preferences with no value to an attacker. Tokens stay in memory —
 * see services/api/api.ts.
 */
export function useChatPrefs(): [ChatPrefs, (next: Partial<ChatPrefs>) => void] {
  const [prefs, setPrefs] = useState<ChatPrefs>(read);

  const update = useCallback((next: Partial<ChatPrefs>) => {
    setPrefs((prev) => {
      const merged = { ...prev, ...next };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch {
        // Kept for this session only, which is the honest fallback.
      }
      return merged;
    });
  }, []);

  return [prefs, update];
}
