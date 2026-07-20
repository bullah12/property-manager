export const AUTH_CHANGE_STORAGE_KEY = "property-manager:auth-change";

/** Notify other tabs that all account-scoped browser state is now invalid. */
export function broadcastAuthChange() {
  try {
    localStorage.setItem(
      AUTH_CHANGE_STORAGE_KEY,
      `${Date.now()}:${crypto.randomUUID()}`
    );
  } catch {
    // Storage can be unavailable in hardened/private browser contexts. The
    // initiating tab still clears its cache and performs a full navigation.
  }
}
