/**
 * TabQ - background service worker
 * ================================
 * The service worker is the single source of truth for *ordering*. It watches
 * tab lifecycle events, works out each tab's slot (1..9) within its window, and
 * messages the matching content script telling it which number to display.
 *
 * It deliberately does NOT touch the favicon itself - that is the content
 * script's job (see content.js). The worker has one extra rendering-support
 * role: fetching favicon bytes on the content script's behalf. Because the
 * worker holds host permissions, it can read cross-origin favicons that would
 * otherwise taint a page-side <canvas>, and hand them back as a same-origin
 * data: URL the content script can safely draw and badge.
 */

const MAX_NUMBERED = 9; // Only the first 9 tabs map to Ctrl/Cmd+1..9.

/* ------------------------------------------------------------------ *
 * Core: assign numbers to every tab in a window
 * ------------------------------------------------------------------ */

/**
 * Re-number every tab in a window.
 *
 * Tabs are ordered left -> right by their `index`. The first 9 get numbers
 * 1..9; everything after gets `null`, which tells the content script to drop
 * any badge it may still be showing (e.g. after a reorder pushed a tab out of
 * the top 9).
 */
async function renumberWindow(windowId) {
  if (windowId == null || windowId === chrome.windows.WINDOW_ID_NONE) return;

  let tabs;
  try {
    tabs = await chrome.tabs.query({ windowId });
  } catch {
    return; // Window vanished between the event and this query - nothing to do.
  }

  tabs.sort((a, b) => a.index - b.index); // defensive: guarantee left->right order

  for (const tab of tabs) {
    const number = tab.index < MAX_NUMBERED ? tab.index + 1 : null;
    notifyTab(tab.id, number);
  }
}

/**
 * Tell a single tab's content script which number to display (or null = none).
 *
 * This is fire-and-forget. Tabs we cannot reach - chrome:// pages, the Web
 * Store, a tab whose content script has not loaded yet, or a tab that was just
 * closed - reject the message. We swallow that rejection so restricted pages
 * never crash the worker or flood the console (requirement #4).
 */
function notifyTab(tabId, number) {
  chrome.tabs
    .sendMessage(tabId, { type: "TABQ_SET_NUMBER", number })
    .catch(() => {
      /* No receiver / restricted page - expected, ignore quietly. */
    });
}

/* ------------------------------------------------------------------ *
 * Debounced scheduler
 * ------------------------------------------------------------------ *
 * A single tab drag can fire dozens of onMoved events in a few milliseconds.
 * Rather than renumber the window on each one, we coalesce bursts per window
 * into a single renumber pass.
 */

const scheduled = new Set(); // windowIds with a renumber already queued

function scheduleRenumber(windowId) {
  if (windowId == null || windowId === chrome.windows.WINDOW_ID_NONE) return;
  if (scheduled.has(windowId)) return; // already queued for this window
  scheduled.add(windowId);
  setTimeout(() => {
    scheduled.delete(windowId);
    renumberWindow(windowId);
  }, 50);
}

/* ------------------------------------------------------------------ *
 * Structural events: anything that can change tab order -> renumber window
 * ------------------------------------------------------------------ */

// A new tab shifts the index of every tab to its right.
chrome.tabs.onCreated.addListener((tab) => scheduleRenumber(tab.windowId));

// A closed tab shifts the index of every tab to its right.
chrome.tabs.onRemoved.addListener((_tabId, info) => {
  if (info.isWindowClosing) return; // whole window is gone - nothing to renumber
  scheduleRenumber(info.windowId);
});

// Reordering tabs within a window.
chrome.tabs.onMoved.addListener((_tabId, info) => scheduleRenumber(info.windowId));

// Drag a tab INTO another window -> the destination window's order changed.
chrome.tabs.onAttached.addListener((_tabId, info) =>
  scheduleRenumber(info.newWindowId)
);

// Drag a tab OUT of a window -> the source window's order changed.
chrome.tabs.onDetached.addListener((_tabId, info) =>
  scheduleRenumber(info.oldWindowId)
);

/**
 * When a page finishes loading, push its number again.
 *
 * This is a safety net: the content script also asks for its number on load
 * (see content.js -> requestNumber). But if the service worker happened to be
 * asleep and that request raced, this re-push guarantees the badge appears.
 * It is harmless to send twice because rendering on the page side is
 * idempotent.
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  const number = tab.index < MAX_NUMBERED ? tab.index + 1 : null;
  notifyTab(tabId, number);
});

/* ------------------------------------------------------------------ *
 * Content script -> worker: "which number am I?"
 * ------------------------------------------------------------------ *
 * A content script asks for its number as soon as it loads. We answer from the
 * sender's own tab metadata (index + windowId are always available, so no
 * "tabs" permission is required). Sending a message also wakes the worker if it
 * had been suspended.
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "TABQ_REQUEST_NUMBER" && sender.tab) {
    const { index } = sender.tab;
    sendResponse({ number: index < MAX_NUMBERED ? index + 1 : null });
    return; // synchronous response
  }

  // The content script cannot always read a cross-origin favicon onto a canvas
  // (it would taint the canvas and block toDataURL). We fetch the bytes here -
  // host permissions mean no CORS restriction - and return a same-origin data:
  // URL the page can draw freely.
  if (msg?.type === "TABQ_FETCH_ICON") {
    fetchIconAsDataUrl(msg.url)
      .then((dataUrl) => sendResponse({ dataUrl }))
      .catch(() => sendResponse({ dataUrl: null }));
    return true; // keep the message channel open for the async response
  }
});

/**
 * Fetch a favicon and return it as a base64 data: URL (or null on any failure).
 * Credentials are omitted - favicons are public assets and we do not want to
 * leak the user's cookies to third-party icon hosts.
 */
async function fetchIconAsDataUrl(url) {
  try {
    const res = await fetch(url, { credentials: "omit", cache: "force-cache" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());

    // Base64-encode in chunks so very large icons cannot overflow the call stack.
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    const mime = blob.type || "image/png";
    return `data:${mime};base64,${btoa(binary)}`;
  } catch {
    return null; // network error, blocked host, etc. - caller falls back.
  }
}

/* ------------------------------------------------------------------ *
 * Bootstrap: number already-open tabs on install / update / browser start
 * ------------------------------------------------------------------ */

async function bootstrap() {
  let tabs;
  try {
    tabs = await chrome.tabs.query({});
  } catch {
    return;
  }

  // Declared content scripts only auto-run on *future* navigations, so inject
  // into already-open tabs now. Restricted pages (chrome://, the Web Store, the
  // new-tab page, the PDF viewer, etc.) reject injection - we catch each one
  // individually so a single restricted tab cannot abort the whole bootstrap.
  await Promise.all(
    tabs.map((tab) =>
      chrome.scripting
        .executeScript({ target: { tabId: tab.id }, files: ["content.js"] })
        .catch(() => {})
    )
  );

  // Renumber each distinct window exactly once.
  const windowIds = new Set(tabs.map((t) => t.windowId));
  windowIds.forEach((id) => renumberWindow(id));
}

chrome.runtime.onInstalled.addListener(bootstrap);
chrome.runtime.onStartup.addListener(bootstrap);
