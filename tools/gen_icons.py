#!/usr/bin/env python3
"""
Generate TabQ's PNG icons with no third-party dependencies (stdlib zlib only).

The icon is the product motif: a blue rounded-square "tab" with a white
notification circle holding a light-blue "1" - exactly the badge the extension
paints onto favicons. Shapes are drawn with signed-distance-field (SDF)
anti-aliasing at 3x supersampling, then box-downsampled, so they stay crisp from
128px down to 16px.

Run:  python3 tools/gen_icons.py
Outputs: extension/icons/icon{16,32,48,128}.png, website/icon-512.png,
         website/favicon.png
"""

import math
import os
import struct
import zlib

# --- palette ---------------------------------------------------------------
BG_TOP = (59, 151, 255)    # #3B97FF
BG_BOTTOM = (31, 115, 230) # #1F73E6
CIRCLE = (255, 255, 255)   # white badge
DIGIT = (21, 101, 216)     # #1565D8 - legible blue on white

SS = 3  # supersample factor


def _hypot(x, y):
    return math.sqrt(x * x + y * y)


def sd_circle(px, py, cx, cy, r):
    return _hypot(px - cx, py - cy) - r


def sd_round_rect(px, py, cx, cy, hw, hh, rad):
    dx = abs(px - cx) - (hw - rad)
    dy = abs(py - cy) - (hh - rad)
    outside = _hypot(max(dx, 0.0), max(dy, 0.0))
    inside = min(max(dx, dy), 0.0)
    return outside + inside - rad


def sd_segment(px, py, ax, ay, bx, by, hw):
    """Distance to a thick line segment (capsule) - used for the '1' strokes."""
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    denom = vx * vx + vy * vy
    t = 0.0 if denom == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / denom))
    dx, dy = wx - t * vx, wy - t * vy
    return _hypot(dx, dy) - hw


def coverage(d):
    """SDF distance (in hi-res px) -> alpha in [0,1] with a ~1px AA band."""
    return max(0.0, min(1.0, 0.5 - d))


def over(dst, rgb, a):
    """Composite straight-alpha `rgb` at coverage `a` over float pixel `dst`."""
    if a <= 0:
        return dst
    dr, dg, db, da = dst
    out_a = a + da * (1 - a)
    if out_a <= 0:
        return (0.0, 0.0, 0.0, 0.0)
    nr = (rgb[0] * a + dr * da * (1 - a)) / out_a
    ng = (rgb[1] * a + dg * da * (1 - a)) / out_a
    nb = (rgb[2] * a + db * da * (1 - a)) / out_a
    return (nr, ng, nb, out_a)


def render(size):
    R = size * SS
    # geometry in hi-res pixels
    cx = cy = R / 2.0
    sq_hw = sq_hh = R / 2.0
    sq_rad = 0.22 * R
    circ_r = 0.345 * R

    # "1" metrics, in units of the circle radius, around the circle centre
    cr = circ_r
    stem_x = cx + 0.05 * cr
    stem_top = cy - 0.50 * cr
    stem_bot = cy + 0.42 * cr
    stem_hw = 0.135 * cr
    flag_ax, flag_ay = cx - 0.32 * cr, cy - 0.16 * cr
    flag_bx, flag_by = stem_x, stem_top
    flag_hw = 0.11 * cr
    base_ax, base_ay = cx - 0.30 * cr, stem_bot
    base_bx, base_by = cx + 0.34 * cr, stem_bot
    base_hw = 0.12 * cr

    hires = bytearray(R * R * 4)
    for y in range(R):
        t = y / (R - 1)
        bg = (
            BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t,
            BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t,
            BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t,
        )
        for x in range(R):
            px, py = x + 0.5, y + 0.5
            pix = (0.0, 0.0, 0.0, 0.0)

            # 1) rounded-square background (with gradient)
            pix = over(pix, bg, coverage(sd_round_rect(px, py, cx, cy, sq_hw, sq_hh, sq_rad)))
            # 2) white badge circle
            pix = over(pix, CIRCLE, coverage(sd_circle(px, py, cx, cy, circ_r)))
            # 3) the blue "1" (union of stem, flag, base serif)
            d1 = sd_segment(px, py, stem_x, stem_top, stem_x, stem_bot, stem_hw)
            d2 = sd_segment(px, py, flag_ax, flag_ay, flag_bx, flag_by, flag_hw)
            d3 = sd_segment(px, py, base_ax, base_ay, base_bx, base_by, base_hw)
            pix = over(pix, DIGIT, coverage(min(d1, d2, d3)))

            i = (y * R + x) * 4
            hires[i] = round(pix[0])
            hires[i + 1] = round(pix[1])
            hires[i + 2] = round(pix[2])
            hires[i + 3] = round(pix[3] * 255)

    # box-downsample SSxSS -> 1
    out = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            r = g = b = a = 0
            for dy in range(SS):
                for dx in range(SS):
                    j = ((y * SS + dy) * R + (x * SS + dx)) * 4
                    af = hires[j + 3]
                    # weight colour by alpha for correct edges
                    r += hires[j] * af
                    g += hires[j + 1] * af
                    b += hires[j + 2] * af
                    a += af
            o = (y * size + x) * 4
            if a > 0:
                out[o] = round(r / a)
                out[o + 1] = round(g / a)
                out[o + 2] = round(b / a)
            out[o + 3] = round(a / (SS * SS))
    return bytes(out)


def write_png(path, size, rgba):
    def chunk(typ, data):
        return (
            struct.pack(">I", len(data))
            + typ
            + data
            + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # RGBA, 8-bit
    raw = bytearray()
    stride = size * 4
    for y in range(size):
        raw.append(0)  # filter: none
        raw += rgba[y * stride : (y + 1) * stride]
    idat = zlib.compress(bytes(raw), 9)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b""))
    print("wrote", path)


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    targets = [
        (16, os.path.join(root, "extension/icons/icon16.png")),
        (32, os.path.join(root, "extension/icons/icon32.png")),
        (48, os.path.join(root, "extension/icons/icon48.png")),
        (128, os.path.join(root, "extension/icons/icon128.png")),
        (512, os.path.join(root, "website/icon-512.png")),
        (32, os.path.join(root, "website/favicon.png")),
    ]
    cache = {}
    for size, path in targets:
        if size not in cache:
            cache[size] = render(size)
        write_png(path, size, cache[size])


if __name__ == "__main__":
    main()
