function () {
  /**
   * ---------------------------------------------------------------------------
   * Marketing Session ID (msSessionId) — RAM only
   * ---------------------------------------------------------------------------
   * Purpose:
   *   - Provides a stable, per-pageview ID immediately in RAM
   *   - Ensures all tags have an ID, even before the persist tag runs
   *   - No device storage access (no cookies, no localStorage/sessionStorage)
   *
   * Privacy:
   *   - Fully TTDSG-compliant: zero storage reads/writes here
   *
   * Interaction with Persist Tag:
   *   - The persist tag (consent-bound) decides the final ID
   *   - Writes to storage and overwrites this RAM value with the final session ID
   *   - All subsequent tags will automatically read the final ID
   *
   * Best Practice:
   *   - Use the persist tag as a Setup Tag ("Once per page") before GA4 & other tags
   *     that consume {{msSessionId}} → guarantees no race conditions
   * ---------------------------------------------------------------------------
   */

  // Fast path: if a session ID already exists in RAM, return it
  if (window.__ms && window.__ms.sessionId) {
    return window.__ms.sessionId;
  }

  // Initialize namespace
  window.__ms = window.__ms || {};

  // Generate ephemeral per-pageview ID (not persisted)
  var randomPart;
  try {
    // Use crypto.getRandomValues if available for better randomness
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      var array = new Uint8Array(4);
      window.crypto.getRandomValues(array);
      // IE11-compatible alternative to Array.from()
      var result = [];
      for (var i = 0; i < array.length; i++) {
        result.push(array[i].toString(36));
      }
      randomPart = result.join('').slice(0, 6);
    } else {
      // Fallback to Math.random for older browsers
      randomPart = Math.random().toString(36).slice(2, 8);
    }
  } catch (e) {
    // Ultimate fallback
    randomPart = Math.random().toString(36).slice(2, 8);
  }
  var sid = "pvs_" + Date.now() + "_" + randomPart;

  // Store in RAM for consistent value across all tags
  window.__ms.sessionId = sid;

  // Optional flag for debugging (indicates not yet persisted)
  window.__ms.ephemeral = true;

  return sid;
}
