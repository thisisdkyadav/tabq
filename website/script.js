/* ============================================================
   TabQ landing-page demo
   Draws a row of favicons, each badged 1-9 with the SAME badge
   logic the extension uses (white circle + light-blue number).
   Press 1-9 (or click) to "jump" to a tab.
   ============================================================ */

(() => {
  const canvas = document.getElementById("demo");
  const caption = document.getElementById("demo-caption");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  // Logical drawing space (CSS scales the canvas; backing store is dpr-scaled).
  const W = 640;
  const H = 190;

  // Mock favicons: { background, glyph, foreground, name }.
  const SITES = [
    { bg: "#ffffff", glyph: "G", fg: "#4285F4", name: "Search" },
    { bg: "#ff0033", glyph: "▶", fg: "#ffffff", name: "Videos" },
    { bg: "#161b22", glyph: "<>", fg: "#ffffff", name: "Code", small: true },
    { bg: "#ffffff", glyph: "✉", fg: "#EA4335", name: "Mail" },
    { bg: "#1f9d55", glyph: "◎", fg: "#ffffff", name: "Maps" },
    { bg: "#0b0b0b", glyph: "X", fg: "#ffffff", name: "Social" },
    { bg: "#ffffff", glyph: "F", fg: "#A259FF", name: "Design" },
    { bg: "#4A154B", glyph: "S", fg: "#ffffff", name: "Chat" },
    { bg: "#ffffff", glyph: "N", fg: "#111111", name: "Notes" },
  ];

  const BADGE_FG = "#4da6ff"; // identical to the extension's BADGE_FG

  // layout
  const PAD = 24;
  const TILE = 50;
  const GAP = (W - 2 * PAD - SITES.length * TILE) / (SITES.length - 1);
  const TILE_Y = 52;

  let active = 1; // 1..9
  let userInteracted = false;

  /* ----- drawing helpers ----- */

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // The extension's badge, ported verbatim: white circle, light-blue ring + number.
  function drawBadge(x, y, size, number) {
    const r = size * 0.31;
    const cx = x + size - r - size * 0.03;
    const cy = y + r + size * 0.03;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = Math.max(1, size * 0.045);
    ctx.strokeStyle = BADGE_FG;
    ctx.stroke();
    ctx.fillStyle = BADGE_FG;
    ctx.font = `bold ${Math.round(r * 1.75)}px Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(number), cx, cy + size * 0.01);
  }

  function tileX(i) {
    return PAD + i * (TILE + GAP);
  }

  function drawTile(i) {
    const site = SITES[i];
    const isActive = active === i + 1;
    const lift = isActive ? -6 : 0;
    const x = tileX(i);
    const y = TILE_Y + lift;

    // selection highlight behind the active tile
    if (isActive) {
      ctx.save();
      ctx.shadowColor = "rgba(47,143,255,0.45)";
      ctx.shadowBlur = 18;
      ctx.fillStyle = "#eaf3ff";
      roundRect(x - 7, y - 7, TILE + 14, TILE + 14, 14);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = BADGE_FG;
      ctx.lineWidth = 2;
      roundRect(x - 7, y - 7, TILE + 14, TILE + 14, 14);
      ctx.stroke();
    }

    // favicon body
    ctx.save();
    ctx.shadowColor = "rgba(20,50,100,0.18)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = site.bg;
    roundRect(x, y, TILE, TILE, 12);
    ctx.fill();
    ctx.restore();
    if (site.bg.toLowerCase() === "#ffffff") {
      ctx.strokeStyle = "#e3ebf6";
      ctx.lineWidth = 1;
      roundRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1, 12);
      ctx.stroke();
    }

    // glyph
    ctx.fillStyle = site.fg;
    ctx.font = `700 ${site.small ? 17 : 24}px Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(site.glyph, x + TILE / 2, y + TILE / 2 + 1);

    // number badge
    drawBadge(x, y, TILE, i + 1);
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < SITES.length; i++) drawTile(i);

    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    const mod = isMac ? "⌘" : "Ctrl";
    if (caption) {
      caption.innerHTML = `<strong>${mod} + ${active}</strong> &rarr; jumps to your <strong>${SITES[active - 1].name}</strong> tab.`;
    }
  }

  /* ----- sizing (HiDPI) ----- */
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
  }

  /* ----- interaction ----- */
  function setActive(n) {
    if (n < 1 || n > SITES.length) return;
    active = n;
    render();
  }

  window.addEventListener("keydown", (e) => {
    if (e.key >= "1" && e.key <= "9") {
      userInteracted = true;
      setActive(Number(e.key));
    }
  });

  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const lx = ((e.clientX - rect.left) / rect.width) * W;
    for (let i = 0; i < SITES.length; i++) {
      if (lx >= tileX(i) - 7 && lx <= tileX(i) + TILE + 7) {
        userInteracted = true;
        setActive(i + 1);
        break;
      }
    }
  });
  canvas.style.cursor = "pointer";

  /* ----- gentle auto-demo until the user takes over ----- */
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduceMotion) {
    setInterval(() => {
      if (userInteracted) return;
      setActive((active % SITES.length) + 1);
    }, 1400);
  }

  window.addEventListener("resize", resize);
  resize();
})();
