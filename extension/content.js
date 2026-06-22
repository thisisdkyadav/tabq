/**
 * TabQ - content script (runs in every http/https page)
 * =====================================================
 * Responsibility: draw this tab's assigned number (1..9) as a small badge on
 * the page's favicon - a white circle with a light-blue number in the top-right
 * corner - so it lines up with Chrome's Ctrl/Cmd+1..9 jump shortcuts.
 *
 * The background worker decides *which* number this tab gets. This script owns
 * *how* it is rendered onto the favicon, and how to do that without stacking
 * badges or looping forever when a page swaps its own favicon (e.g. an
 * unread-count icon on Gmail/Discord/Slack).
 */

(() => {
  // Guard against double-injection (declared content script + the programmatic
  // injection background.js does on install can both land in one page).
  if (window.__tabqInjected) return;
  window.__tabqInjected = true;

  /* ------------------------------- config -------------------------------- */

  const CANVAS_SIZE = 64; // off-screen render resolution (crisp on hi-DPI tabs)
  const BADGE_BG = "#ffffff"; // the circle fill (white)
  const BADGE_FG = "#4da6ff"; // the number + thin ring (light blue) - tweak freely

  /* -------------------------------- state -------------------------------- */

  let currentNumber = null; // 1..9, or null when this tab is not in the top 9
  let pageFaviconUrl = null; // the page's real favicon URL (absolute or data:)
  let managing = false; // have we taken control of this tab's favicon yet?
  let renderToken = 0; // bumped per update() so stale async draws are dropped

  /* ----------------------- favicon URL bookkeeping ----------------------- */

  /** All of the PAGE's icon links (i.e. excluding the one we inject). */
  function pageIconLinks() {
    return Array.from(
      document.querySelectorAll('link[rel~="icon"]:not([data-tabq])')
    );
  }

  /** Resolve the page's current favicon to an absolute URL, defaulting to /favicon.ico. */
  function resolveFaviconUrl() {
    const links = pageIconLinks();
    // Sites often declare the "active" icon last, so prefer the last one.
    if (links.length && links[links.length - 1].href) {
      return links[links.length - 1].href; // .href is already absolute
    }
    return new URL("/favicon.ico", location.href).href;
  }

  /* ------------------------------ rendering ------------------------------ */

  /** Draw the white-circle / light-blue-number badge in the top-right corner. */
  function drawBadge(ctx, size, number) {
    const r = size * 0.31; // circle radius
    const cx = size - r - size * 0.03; // inset slightly so the ring isn't clipped
    const cy = r + size * 0.03;

    // White circle with a thin light-blue ring (the ring keeps it visible even
    // on top of a white favicon).
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = BADGE_BG;
    ctx.fill();
    ctx.lineWidth = Math.max(1, size * 0.045);
    ctx.strokeStyle = BADGE_FG;
    ctx.stroke();

    // The number, centred in the circle. Sized to nearly fill the circle while
    // leaving a thin margin inside the ring.
    ctx.fillStyle = BADGE_FG;
    ctx.font = `bold ${Math.round(r * 1.75)}px Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(number), cx, cy + size * 0.01);
  }

  /** Composite the original favicon + badge and return a PNG data: URL. */
  function compositeFavicon(img, number) {
    const size = CANVAS_SIZE;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    drawBadge(ctx, size, number);
    return canvas.toDataURL("image/png");
  }

  /** Fallback icon when the real favicon can't be loaded: a neutral tile + badge. */
  function badgeOnlyFavicon(number) {
    const size = CANVAS_SIZE;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    const r = size * 0.2;
    // rounded neutral square so the number stays readable with no base icon
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.arcTo(size, 0, size, size, r);
    ctx.arcTo(size, size, 0, size, r);
    ctx.arcTo(0, size, 0, 0, r);
    ctx.arcTo(0, 0, size, 0, r);
    ctx.closePath();
    ctx.fillStyle = "#dfe3e8";
    ctx.fill();
    drawBadge(ctx, size, number);
    return canvas.toDataURL("image/png");
  }

  /* --------------------------- applying the icon -------------------------- */

  /**
   * Install `href` as the tab's favicon via a single managed <link data-tabq>.
   *
   * We also remove the PAGE's own icon links so Chrome unambiguously uses ours.
   * Crucially, our managed link carries `data-tabq`, so it is invisible to
   * pageIconLinks() and to the observer below - that is how we tell our own
   * changes apart from the page's and avoid an infinite update loop.
   */
  function setManagedIcon(href, token) {
    if (!href || token !== renderToken || !document.head) return;

    pageIconLinks().forEach((link) => link.remove());

    let link = document.querySelector('link[rel="icon"][data-tabq]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      link.setAttribute("data-tabq", "1");
      document.head.appendChild(link);
    }
    if (link.href !== href) link.href = href;
    managing = true;
  }

  /**
   * Recompute and apply this tab's favicon for the current number.
   * `renderToken` guards against races: if the number/favicon changes while an
   * async fetch or image decode is in flight, the stale result is discarded.
   */
  async function update() {
    const token = ++renderToken;
    const number = currentNumber;

    // Not in the top 9: show the original favicon (un-badged). If we never took
    // control of this tab, leave its favicon completely untouched.
    if (!number) {
      if (managing) setManagedIcon(pageFaviconUrl, token);
      return;
    }

    // First time we badge this tab, read whatever favicon it currently shows.
    if (!pageFaviconUrl) pageFaviconUrl = resolveFaviconUrl();
    const baseUrl = pageFaviconUrl;

    // Get a taint-free source. data: URLs are already safe to draw; everything
    // else is fetched by the worker and returned as a same-origin data: URL.
    let drawableSrc = baseUrl;
    if (!baseUrl.startsWith("data:")) {
      const res = await chrome.runtime
        .sendMessage({ type: "TABQ_FETCH_ICON", url: baseUrl })
        .catch(() => null);
      drawableSrc = res?.dataUrl || null;
    }
    if (token !== renderToken) return; // superseded while awaiting

    // Couldn't get the bytes -> badge a neutral tile so the number still shows.
    if (!drawableSrc) {
      setManagedIcon(badgeOnlyFavicon(number), token);
      return;
    }

    const img = new Image();
    img.onload = () => {
      if (token !== renderToken) return;
      try {
        setManagedIcon(compositeFavicon(img, number), token);
      } catch {
        // toDataURL can still throw on exotic edge cases -> safe fallback.
        setManagedIcon(badgeOnlyFavicon(number), token);
      }
    };
    img.onerror = () => {
      if (token === renderToken) setManagedIcon(badgeOnlyFavicon(number), token);
    };
    img.src = drawableSrc;
  }

  /* ------------------------- watching for changes ------------------------ */

  /**
   * The page changed its own favicon (unread badge, SPA route, theme switch).
   *
   * Because setManagedIcon() removes all non-data-tabq icon links, the only way
   * a fresh page icon link can appear in <head> is if the PAGE added it. So if
   * we find one here, it is a genuine external change - never our own write.
   * That makes this loop-safe without any "ignore my own mutation" flag.
   */
  function onHeadMutation() {
    const links = pageIconLinks();
    if (!links.length) return; // nothing new from the page

    const newUrl = links[links.length - 1].href || resolveFaviconUrl();
    if (newUrl === pageFaviconUrl) {
      // Same icon re-declared (some frameworks re-render <head>): just clean up
      // so our managed link stays in charge. No recomposite, no loop.
      links.forEach((link) => link.remove());
      return;
    }
    pageFaviconUrl = newUrl;
    update(); // recomposite; update() -> setManagedIcon removes these links
  }

  function startObserver() {
    const target = document.head || document.documentElement;
    if (!target) return;
    new MutationObserver(onHeadMutation).observe(target, {
      subtree: true,
      childList: true, // icon <link> added / removed / replaced
      attributes: true, // an icon <link>'s href edited in place
      attributeFilter: ["href", "rel"],
    });
  }

  /* --------------------------- worker messaging -------------------------- */

  // Numbers pushed from the background worker after a structural change
  // (tab created / closed / moved / attached / detached) or on page load.
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "TABQ_SET_NUMBER") {
      currentNumber = msg.number; // 1..9 or null
      update();
    }
  });

  /** Ask the worker which number this tab should show right now. */
  function requestNumber() {
    chrome.runtime
      .sendMessage({ type: "TABQ_REQUEST_NUMBER" })
      .then((res) => {
        if (res && "number" in res) {
          currentNumber = res.number;
          update();
        }
      })
      .catch(() => {
        /* Worker briefly unavailable; a tab event will re-push the number. */
      });
  }

  // --- init -----------------------------------------------------------------
  // run_at is "document_end", so <head> already exists.
  pageFaviconUrl = resolveFaviconUrl();
  startObserver(); // watch for the page changing its own favicon later
  requestNumber(); // fetch our number, then update() draws the badge
})();
