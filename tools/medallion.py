"""The game's item medallion, painted here so the shop page shows the same
plate the in-game shop does.

A port of ItemMedallion.ComposeItemPlate from alphamoba-unity: a near-black
ground with a whisper of the category tint, an even neutral frame ring, the
art inset to 80% of the face, and behind the art a glow made from its own
blurred silhouette, tinted with the art's dominant colour and whitened where
it hugs the outline. Tier throttles the glow, and finished items get the
deterministic sparkle flecks. Standard library only.
"""
import colorsys
import math
import struct
import zlib

CATEGORY = {
    "All": (0.82, 0.86, 0.94),
    "Attack": (1.0, 0.64, 0.32),
    "Magic": (0.66, 0.62, 1.0),
    "Defense": (0.68, 0.72, 0.78),
    "Support": (0.5, 0.92, 0.66),
    "Boots": (0.45, 0.9, 0.9),
    "Consumable": (0.95, 0.45, 0.45),
    "Trinket": (0.72, 0.85, 0.98),
}
FRAME = (0.52, 0.55, 0.56)


def clamp01(v):
    return 0.0 if v < 0 else 1.0 if v > 1 else v


def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def lift_for_glow(c):
    m = max(c)
    if m <= 0.001:
        return (0.55, 0.55, 0.55)
    if m >= 0.55:
        return c
    k = 0.55 / m
    return (c[0] * k, c[1] * k, c[2] * k)


class Picture:
    """An RGBA picture with Unity-style bilinear sampling in [0,1] UV."""

    def __init__(self, width, height, rgba):
        self.w, self.h, self.px = width, height, rgba

    def at(self, x, y):
        x = 0 if x < 0 else self.w - 1 if x >= self.w else x
        y = 0 if y < 0 else self.h - 1 if y >= self.h else y
        i = (y * self.w + x) * 4
        p = self.px
        return p[i] / 255, p[i + 1] / 255, p[i + 2] / 255, p[i + 3] / 255

    def bilinear(self, u, v):
        fx = u * self.w - 0.5
        fy = v * self.h - 0.5
        x0, y0 = math.floor(fx), math.floor(fy)
        tx, ty = fx - x0, fy - y0
        a = self.at(x0, y0)
        b = self.at(x0 + 1, y0)
        c = self.at(x0, y0 + 1)
        d = self.at(x0 + 1, y0 + 1)
        return tuple(
            (a[i] * (1 - tx) + b[i] * tx) * (1 - ty) + (c[i] * (1 - tx) + d[i] * tx) * ty
            for i in range(4)
        )


def dominant_colour(picture, fallback):
    grid = 64
    colours, sats, opaque = [], [], []
    for y in range(grid):
        for x in range(grid):
            c = picture.bilinear((x + 0.5) / grid, (y + 0.5) / grid)
            colours.append(c)
            s = colorsys.rgb_to_hsv(c[0], c[1], c[2])[1]
            sats.append(s)
            if c[3] > 0.1:
                opaque.append(s)
    if not opaque:
        return fallback
    opaque.sort()
    median = opaque[len(opaque) // 2]
    r = g = b = w = 0.0
    for c, s in zip(colours, sats):
        if c[3] <= 0.1 or s < median:
            continue
        weight = c[3] * (0.15 + s)
        r += c[0] * weight
        g += c[1] * weight
        b += c[2] * weight
        w += weight
    if w <= 0.001:
        for c in colours:
            r += c[0] * c[3]
            g += c[1] * c[3]
            b += c[2] * c[3]
            w += c[3]
    if w <= 0.001:
        return fallback
    return lift_for_glow((r / w, g / w, b / w))


def edge_distance(x, y, last, radius):
    half = last * 0.5
    cx = abs(x - half) - (half - radius)
    cy = abs(y - half) - (half - radius)
    mx, my = max(cx, 0.0), max(cy, 0.0)
    return math.sqrt(mx * mx + my * my) + min(max(cx, cy), 0.0) - radius


def blur_alpha(alpha, size, radius, passes):
    """Separable box blur with running sums, clamped edges."""
    norm = 1.0 / (radius * 2 + 1)
    tmp = [0.0] * len(alpha)
    for _ in range(passes):
        for y in range(size):
            row = y * size
            acc = 0.0
            for d in range(-radius, radius + 1):
                acc += alpha[row + min(max(d, 0), size - 1)]
            for x in range(size):
                tmp[row + x] = acc * norm
                out_i = min(max(x - radius, 0), size - 1)
                in_i = min(max(x + radius + 1, 0), size - 1)
                acc += alpha[row + in_i] - alpha[row + out_i]
        for x in range(size):
            acc = 0.0
            for d in range(-radius, radius + 1):
                acc += tmp[min(max(d, 0), size - 1) * size + x]
            for y in range(size):
                alpha[y * size + x] = acc * norm
                out_i = min(max(y - radius, 0), size - 1)
                in_i = min(max(y + radius + 1, 0), size - 1)
                acc += tmp[in_i * size + x] - tmp[out_i * size + x]


def fnv_hash(seed, x, y):
    h = 2166136261
    for ch in seed:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    for v in (x, y):
        for shift in (0, 8, 16, 24):
            h ^= (v >> shift) & 0xFF
            h = (h * 16777619) & 0xFFFFFFFF
    h ^= h >> 16
    h = (h * 0x7FEB352D) & 0xFFFFFFFF
    h ^= h >> 15
    h = (h * 0x846CA68B) & 0xFFFFFFFF
    h ^= h >> 16
    return h


def compose(picture, category, tier, icon_name, size=128):
    """Returns the finished plate as (size, size, rgba bytes)."""
    palette = CATEGORY.get(category, CATEGORY["All"])
    last = size - 1
    corner = max(2.0, size * 0.11)
    rim = max(1.5, size * 0.025)
    frame_depth = math.ceil(rim)
    span = round((size - frame_depth * 2) * 0.8)
    inset = (size - span) // 2
    scale = size / 64
    radius = round((8 if tier >= 3 else 7 if tier == 2 else 6) * scale)
    intensity = 1.35 if tier >= 3 else 1.05 if tier == 2 else 0.85

    dominant = dominant_colour(picture, lift_for_glow(palette))

    # The art resampled into place: a 3x3-tap spread shared by the glow's
    # silhouette and the composite, so both agree where the edge is.
    taps = 3
    step = 1.0 / (span * taps)
    art = [None] * (size * size)
    glow = [0.0] * (size * size)
    for sy in range(span):
        ty = inset + sy
        for sx in range(span):
            tx = inset + sx
            r = g = b = a = 0.0
            for oy in range(taps):
                for ox in range(taps):
                    c = picture.bilinear((sx * taps + ox + 0.5) * step, (sy * taps + oy + 0.5) * step)
                    r += c[0] * c[3]
                    g += c[1] * c[3]
                    b += c[2] * c[3]
                    a += c[3]
            n = taps * taps
            i = ty * size + tx
            glow[i] = a / n
            if a > 0:
                art[i] = (r / a, g / a, b / a, a / n)
    blur_alpha(glow, size, radius, 3)

    ground = lerp((0, 0, 0), palette, 0.15)
    out = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            edge = edge_distance(x, y, last, corner)
            i = y * size + x
            if edge > 0.5:
                continue
            if edge > -rim:
                c = FRAME
            else:
                c = ground
                falloff = clamp01((-edge - rim) / (size * 0.22))
                gl = clamp01(glow[i] * intensity) * falloff
                if gl > 0:
                    gc = lerp(dominant, (1, 1, 1), 0.25 * clamp01(glow[i] * 1.5))
                    c = (clamp01(c[0] + gc[0] * gl), clamp01(c[1] + gc[1] * gl), clamp01(c[2] + gc[2] * gl))
            alpha = clamp01(0.5 - edge)
            p = art[i]
            if p is not None and alpha > 0:
                c = (c[0] + (p[0] - c[0]) * p[3], c[1] + (p[1] - c[1]) * p[3], c[2] + (p[2] - c[2]) * p[3])
            o = i * 4
            out[o] = round(c[0] * 255)
            out[o + 1] = round(c[1] * 255)
            out[o + 2] = round(c[2] * 255)
            out[o + 3] = round(alpha * 255)

    if tier >= 3:
        spark = lerp(dominant, (1, 1, 1), 0.6)
        candidates = []
        for y in range(size):
            for x in range(size):
                a = glow[y * size + x]
                if a < 0.15 or a > 0.5:
                    continue
                if edge_distance(x, y, last, corner) > -(rim + 1.5):
                    continue
                candidates.append((fnv_hash(icon_name, x, y), x, y))
        candidates.sort()
        for h, x, y in candidates[: min(14 * round(scale), len(candidates))]:
            _fleck(out, size, x, y, spark, 1.0)
            if h & 2:
                _fleck(out, size, x + (1 if h & 4 else 0), y + (0 if h & 4 else 1), spark, 0.5)
    return size, size, bytes(out)


def _fleck(out, size, x, y, spark, strength):
    if x < 0 or y < 0 or x >= size or y >= size:
        return
    o = (y * size + x) * 4
    if out[o + 3] == 0:
        return
    for k in range(3):
        under = out[o + k] / 255
        out[o + k] = round((under + (spark[k] - under) * strength) * 255)


def encode_png(width, height, rgba):
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)
        raw += rgba[y * stride:(y + 1) * stride]

    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
            + chunk(b"IEND", b""))
