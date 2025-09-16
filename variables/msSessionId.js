function () {
  /**
   * Marketing Session ID (cookie-free) — GTM Custom JS Variable
   * - Pure read/decide/cached-return. NO storage writes here.
   * - Immediately returns a single stable sessionId for this pageview.
   * - Caches the value on window.__ms.sessionId so all GTM events on this page reuse it.
   *
   * Configurable referrer logic:
   *   REF_CHECK_MODE:
   *     - "etld1"   (default): treat same eTLD+1 as internal (subdomains are internal)
   *     - "hostname": treat same full hostname as internal (subdomains are external)
   *     - "custom": use INTERNAL_HOSTS array to decide what is internal
   *
   * Session lifecycle rules:
   *   - Start NEW session on external referrer OR inactivity timeout
   *   - Continue session within timeout (including new internal tabs)
   *
   * Storage keys (written by the persist tag, not here):
   *   - sessionStorage:  ms_sessionId
   *   - localStorage:    ms_currentSessionId, ms_lastActivityTs
   */

  // ---- CONFIG ----
  var TIMEOUT_MIN = 30; // Session timeout window (minutes). Adjust as needed.

  // Referrer check mode: "etld1" | "hostname" | "custom"
  var REF_CHECK_MODE = "etld1";

  // Only used when REF_CHECK_MODE === "custom".
  // Put any hostnames you consider INTERNAL here (exact match).
  // Examples: ["example.com", "www.example.com", "shop.example.com"]
  var INTERNAL_HOSTS = [];

  // ---- SAFE STORAGE HELPERS (read-only here) ----
  function lsGet(k){ try { return window.localStorage.getItem(k); } catch(e){ return null; } }
  function ssGet(k){ try { return window.sessionStorage.getItem(k); } catch(e){ return null; } }

  // ---- UTILS ----
  var now = Date.now(); // fixed evaluation timestamp for this variable call

  // Reduce a hostname to a naive eTLD+1 (good enough for entry gating; no PSL).
  function etld1(host){
    try {
      var parts = (host || "").split(".");
      return parts.length >= 2 ? parts.slice(-2).join(".") : (host || "");
    } catch(e){
      return host || "";
    }
  }

  // Extract hostname from document.referrer with a safe fallback.
  function getRefHost(){
    try {
      if (!document.referrer) return "";
      return new URL(document.referrer).hostname || "";
    } catch(e){
      var a = document.createElement("a");
      a.href = document.referrer || "";
      return a.hostname || "";
    }
  }

  // Decide if a referrer is external based on the configured mode.
  function isExternalReferrer(refHost, pageHost){
    if (!refHost) return false; // direct entry is not considered external by itself

    if (REF_CHECK_MODE === "hostname") {
      // Strict: only identical full hostnames are internal.
      return refHost !== pageHost;
    }

    if (REF_CHECK_MODE === "custom") {
      // Custom allowlist of internal hosts (exact matches).
      // If current page host or ref host is in INTERNAL_HOSTS, treat as internal.
      var refInternal = INTERNAL_HOSTS.indexOf(refHost) !== -1;
      var pageInternal = INTERNAL_HOSTS.indexOf(pageHost) !== -1;
      // If we don't know either host, fall back to eTLD+1 comparison for safety.
      if (!refInternal && !pageInternal) {
        return etld1(refHost) !== etld1(pageHost);
      }
      // If ref is in the list and matches page (or both are listed), it's internal.
      // Otherwise, treat as external.
      return !(refInternal && pageInternal);
    }

    // Default: "etld1" — subdomains are considered internal.
    return etld1(refHost) !== etld1(pageHost);
  }

  // Create a human-readable session id with timestamp + short random suffix.
  function genId(ts){
    return "session_" + ts + "_" + Math.random().toString(36).slice(2,10);
  }

  // ---- FAST PATH: reuse cached value within this pageview ----
  if (window.__ms && window.__ms.sessionId) return window.__ms.sessionId;

  // Ensure runtime namespace exists for this pageview.
  window.__ms = window.__ms || {};

  // ---- SIGNALS (read-only) ----
  var pageHost = location.hostname;      // full hostname of current page
  var refHost  = getRefHost();           // full hostname of referrer (empty when direct)

  var isExternalRef = isExternalReferrer(refHost, pageHost); // external entry?

  // IMPORTANT: read the SAME key the persist tag writes
  var lastTs = +(lsGet("ms_lastActivityTs") || 0);                // last activity timestamp
  var inactiveTooLong = (now - lastTs) > (TIMEOUT_MIN * 60 * 1000); // timeout hit?

  // ---- CURRENT STATE (read-only) ----
  var sid    = ssGet("ms_sessionId");        // tab-scoped session id (if any)
  var carry  = lsGet("ms_currentSessionId"); // cross-tab candidate (if any)

  // Cross-tab carry-over is only allowed when we have no tab id,
  // no timeout happened, and the entry is NOT external.
  var shouldCarry = !sid && carry && !inactiveTooLong && !isExternalRef;

  // NEW session is required when:
  // - no tab id AND no valid carry-over, OR
  // - external referrer, OR
  // - inactivity timeout exceeded
  var isStart = (!sid && !shouldCarry) || isExternalRef || inactiveTooLong;

  // ---- RESOLVE sessionId for THIS pageview (no storage writes!) ----
  if (isStart) {
    // Force NEW id even if an old one exists in sessionStorage (timeout/external entry).
    sid = genId(now);
  } else if (!sid && shouldCarry) {
    // Continue a recent session across tabs within the timeout window.
    sid = carry;
  } else if (!sid) {
    // First visit with no existing tab id and no carry available.
    sid = genId(now);
  } // else: keep the existing tab id

  // Cache for this pageview so all GTM events reuse the exact same value.
  window.__ms.sessionId = sid;

  // Expose decision signals for the persist tag (still: no writes here).
  window.__ms._signals = {
    now: now,
    refHost: refHost,
    pageHost: pageHost,
    refCheckMode: REF_CHECK_MODE,
    isExternalRef: !!isExternalRef,
    inactiveTooLong: !!inactiveTooLong,
    isStart: !!isStart,
    carryAllowed: !!shouldCarry
  };

  // Return the resolved session id to GTM.
  return sid;
}

// Event senden wenn MSID bereit ist (ohne bestehende Logik zu ändern)
if (typeof window.__ms !== 'undefined' && window.__ms.sessionId) {
  // Event für andere Plugins (z.B. TS-Plugin)
  document.dispatchEvent(new CustomEvent('msid:ready', {
    detail: {
      sessionId: window.__ms.sessionId,
      signals: window.__ms._signals
    }
  }));
}
