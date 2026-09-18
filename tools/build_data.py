#!/usr/bin/env python3
"""Export the website's data files from the alphamoba-unity checkout.

Reads GameData/ (the JSON sheets the game itself loads) and the champion
atlases, and writes:

    data/champions.json   every playable champion, kit text and base stats
    data/items.json       every shop item
    data/map.json         the Hushwood's node graph, for the drawn map
    champions/<id>.html   one static page per champion (from the template)
    assets/img/items/     one 128px medallion per item: the game's own art on the
                          plate the in-game shop paints behind it (medallion.py)
    assets/img/abilities/ the ability art the HUD shows, one per slot per champion
    assets/img/portraits/ every painted champion portrait the game has so far

Usage:
    python3 tools/build_data.py [path-to-alphamoba-unity]

The default path is a sibling checkout, ../alphamoba-unity. Only the Python
standard library is used, including a small PNG decoder so each champion's
accent colour can be lifted from its own atlas the same way the game's
portrait wash does (ChampionPortrait.MainColour).
"""
import colorsys
import json
import os
import re
import struct
import sys
import zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE = HERE.parent
sys.path.insert(0, str(HERE))
from medallion import Picture, compose, encode_png  # noqa: E402
UNITY = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else SITE.parent / "alphamoba-unity"
GAMEDATA = UNITY / "GameData"
ATLASES = UNITY / "Assets" / "Resources" / "Champions"
ITEM_ART = UNITY / "Assets" / "Resources" / "Icons" / "art" / "items"
ABILITY_ART = UNITY / "Assets" / "Resources" / "Icons" / "art" / "abilities"
PORTRAITS = UNITY / "Assets" / "Resources" / "Portraits"

NOT_CHAMPIONS = {"party_dummy", "training_enemy"}
# Champions whose atlas is not <id>_atlas.png: Wick shares a sheet with
# Tatters (the master's is the face of the pair), and Rime ships as a .glb
# with its texture embedded, so the wyrm's frost is named by hand.
ATLAS_FILE = {"wick": "wick_master_atlas.png"}
COLOUR_OVERRIDE = {"rime": "#8ccfe3"}
SLOTS = ("passive", "q", "w", "e", "r")


# ---------------------------------------------------------------- PNG decode
def decode_png(path):
    """Return (width, height, rgba bytes) for an 8-bit RGBA, non-interlaced PNG."""
    data = path.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", f"{path}: not a PNG"
    pos = 8
    width = height = 0
    idat = []
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos:pos + 4])
        kind = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if kind == b"IHDR":
            width, height, depth, colour, _, _, interlace = struct.unpack(">IIBBBBB", body)
            if depth != 8 or colour != 6 or interlace != 0:
                raise ValueError(f"{path}: only 8-bit RGBA non-interlaced PNGs are read")
        elif kind == b"IDAT":
            idat.append(body)
        elif kind == b"IEND":
            break
    raw = zlib.decompress(b"".join(idat))
    stride = width * 4
    out = bytearray(width * height * 4)
    prev = bytearray(stride)
    src = 0
    for row in range(height):
        filt = raw[src]
        src += 1
        line = bytearray(raw[src:src + stride])
        src += stride
        if filt == 1:
            for i in range(4, stride):
                line[i] = (line[i] + line[i - 4]) & 255
        elif filt == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif filt == 3:
            for i in range(stride):
                left = line[i - 4] if i >= 4 else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 255
        elif filt == 4:
            for i in range(stride):
                a = line[i - 4] if i >= 4 else 0
                b = prev[i]
                c = prev[i - 4] if i >= 4 else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pred) & 255
        out[row * stride:(row + 1) * stride] = line
        prev = line
    return width, height, bytes(out)


def main_colour(atlas_path, step=8):
    """The champion's own colour, as the game's portrait wash picks it: the
    heaviest hue bin (with its neighbours) of the saturated, mid-value
    texels; a steel grey when nothing saturated stands out."""
    if not atlas_path.exists():
        return "#4d5259"
    width, height, px = decode_png(atlas_path)
    bins = 24
    weight = [0.0] * bins
    sums = [[0.0, 0.0, 0.0] for _ in range(bins)]
    grey_n = grey_sum = 0.0
    sampled = 0
    for y in range(0, height, step):
        row = y * width * 4
        for x in range(0, width, step):
            i = row + x * 4
            r, g, b, a = px[i] / 255, px[i + 1] / 255, px[i + 2] / 255, px[i + 3]
            sampled += 1
            if a < 128:
                continue
            h, s, v = colorsys.rgb_to_hsv(r, g, b)
            w = s * min(1, max(0, (v - 0.08) * 4)) * min(1, max(0, (1.05 - v) * 4))
            grey_n += 1
            grey_sum += (r + g + b) / 3
            if w <= 0.02:
                continue
            k = min(bins - 1, max(0, int(h * bins)))
            weight[k] += w
            sums[k][0] += r * w
            sums[k][1] += g * w
            sums[k][2] += b * w
    best, best_w = 0, 0.0
    for k in range(bins):
        around = weight[k] + weight[(k + 1) % bins] + weight[(k - 1) % bins]
        if around > best_w:
            best, best_w = k, around
    if best_w < sampled * 0.02:
        mean = grey_sum / grey_n if grey_n else 0.4
        r, g, b = colorsys.hsv_to_rgb(0.6, 0.25, min(0.65, max(0.45, mean)))
    else:
        r = g = b = total = 0.0
        for k in ((best - 1) % bins, best, (best + 1) % bins):
            r += sums[k][0]
            g += sums[k][1]
            b += sums[k][2]
            total += weight[k]
        r, g, b = r / total, g / total, b / total
        # Lift toward a readable accent: the web page needs it against ink.
        h, s, v = colorsys.rgb_to_hsv(r, g, b)
        r, g, b = colorsys.hsv_to_rgb(h, min(1, max(0.5, s)), min(0.95, max(0.7, v)))
    return "#%02x%02x%02x" % (round(r * 255), round(g * 255), round(b * 255))


# ---------------------------------------------------------------- sheets
def load(path):
    return json.loads(path.read_text(encoding="utf-8"))["fields"]


def num(fields, key, default=0.0):
    value = fields.get(key, default)
    return value if isinstance(value, (int, float)) else default


def champion(path):
    f = load(path)
    cid = path.stem
    kit = []
    for slot in SLOTS:
        key = "P" if slot == "passive" else slot.upper()
        entry = {
            "slot": key,
            "name": f.get(f"{slot}_name", ""),
            "description": f.get(f"{slot}_description", ""),
        }
        icon = f.get(f"{slot}_icon", "")
        if icon and (ABILITY_ART / f"{icon}.png").exists():
            entry["icon"] = icon
            (SITE / "assets" / "img" / "abilities").mkdir(parents=True, exist_ok=True)
            (SITE / "assets" / "img" / "abilities" / f"{icon}.png").write_bytes(
                (ABILITY_ART / f"{icon}.png").read_bytes())
        if slot != "passive":
            cooldown = num(f, f"{slot}_cooldown")
            cost = num(f, f"{slot}_mana_cost")
            if cooldown:
                entry["cooldown"] = cooldown
            if cost:
                entry["cost"] = cost
            rng = num(f, f"{slot}_range")
            if rng:
                entry["range"] = rng
        kit.append(entry)
    resource = f.get("resource_kind", "Mana")
    portrait = (PORTRAITS / f"{cid}.png").exists()
    if portrait:
        (SITE / "assets" / "img" / "portraits").mkdir(parents=True, exist_ok=True)
        (SITE / "assets" / "img" / "portraits" / f"{cid}.png").write_bytes(
            (PORTRAITS / f"{cid}.png").read_bytes())
    return {
        "id": cid,
        "name": f.get("display_name", cid.title()),
        "title": f.get("title", ""),
        "class": f.get("champion_class", ""),
        "resource": resource,
        "ranged": bool(f.get("ranged_attack", False)),
        "portrait": portrait,
        "colour": COLOUR_OVERRIDE.get(cid)
            or main_colour(ATLASES / ATLAS_FILE.get(cid, f"{cid}_atlas.png")),
        "stats": {
            "health": num(f, "max_health"),
            "health_growth": num(f, "health_growth"),
            "resource_max": num(f, "max_mana"),
            "attack": num(f, "attack_damage"),
            "attack_growth": num(f, "attack_growth"),
            "attack_range": num(f, "attack_range"),
            "attack_cooldown": num(f, "attack_cooldown"),
            "armor": num(f, "armor"),
            "magic_resist": num(f, "magic_resist"),
            "move_speed": num(f, "move_speed"),
        },
        "kit": kit,
    }


def item(path):
    f = load(path)
    stats = {}
    labels = {
        "bonus_health": "Health", "bonus_mana": "Mana", "bonus_ad": "Attack damage",
        "bonus_ap": "Ability power", "bonus_armor": "Armour", "bonus_magic_resist": "Magic resist",
        "bonus_attack_speed": "Attack speed", "bonus_move_speed": "Move speed",
        "bonus_health_regen": "Health regen", "bonus_mana_regen": "Mana regen",
        "ability_haste": "Ability haste", "lifesteal": "Lifesteal", "thorns": "Thorns",
        "on_hit_magic": "On-hit magic", "cull_chance": "Cull chance", "cull_bonus": "Cull bonus",
        "restore_health": "Restores health", "restore_mana": "Restores mana",
    }
    for key, label in labels.items():
        value = num(f, key)
        if value:
            stats[label] = value
    components = [Path(p).stem for p in f.get("component_paths", []) if isinstance(p, str)]
    return {
        "id": path.stem,
        "name": f.get("display_name", path.stem),
        "tier": int(num(f, "tier")),
        "category": f.get("category", ""),
        "cost": int(num(f, "cost")),
        "description": f.get("description", ""),
        "active": f.get("active_name", "") or "",
        "active_cooldown": num(f, "active_cooldown"),
        "charges": int(num(f, "charges")),
        "components": components,
        "stats": stats,
    }


def hushwood():
    f = load(GAMEDATA / "maps" / "treeline_map_def.json")
    nodes = []
    for node in f["nodes"]:
        n = node["fields"]
        x, _, z = n["position"]
        # The JSON carries Godot-frame z; the sim negates it on load so +y is
        # north on screen. Keep the sim frame here.
        nodes.append({"id": n["id"], "x": x, "y": -z, "team": n.get("team", -1)})
    edges = [{"from": e["fields"]["from_id"], "to": e["fields"]["to_id"]} for e in f["edges"]]
    size = f.get("world_size", 100)
    if isinstance(size, list):  # exported as a (width, depth) pair; the board is square
        size = size[0]
    return {"name": "The Hushwood", "size": size, "nodes": nodes, "edges": edges}


# ---------------------------------------------------------------- pages
def esc(text):
    return (str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;"))


def fmt(value):
    return str(int(value)) if float(value).is_integer() else f"{value:g}"


def champion_page(c, roster, template):
    others = [o for o in roster if o["class"] == c["class"] and o["id"] != c["id"]]
    kit_html = []
    for a in c["kit"]:
        meta = []
        if a.get("cost"):
            meta.append(f"{fmt(a['cost'])} {esc(c['resource'].lower())}")
        if a.get("cooldown"):
            meta.append(f"{fmt(a['cooldown'])}s cooldown")
        if a.get("range"):
            meta.append(f"range {fmt(a['range'])}")
        if a.get("icon"):
            key = (f'<span class="ability-cell"><span class="ability-icon">'
                   f'<img src="../assets/img/abilities/{a["icon"]}.png" alt="" width="128" height="128"></span>'
                   f'<b class="ability-key-badge">{a["slot"]}</b></span>')
        else:
            key = f'<span class="ability-key">{a["slot"]}</span>'
        kit_html.append(
            f'<li class="ability">'
            f'{key}'
            f'<div><h3>{esc(a["name"])}</h3>'
            + (f'<p class="ability-meta">{" · ".join(meta)}</p>' if meta else "")
            + f'<p>{esc(a["description"])}</p></div></li>'
        )
    s = c["stats"]
    stat_rows = [
        ("Health", f"{fmt(s['health'])} <small>+{fmt(s['health_growth'])}/lvl</small>"),
        (c["resource"] if c["resource"] not in ("None", "") else "Resource",
         fmt(s["resource_max"]) if s["resource_max"] else "None"),
        ("Attack damage", f"{fmt(s['attack'])} <small>+{fmt(s['attack_growth'])}/lvl</small>"),
        ("Attack range", f"{fmt(s['attack_range'])} <small>{'ranged' if c['ranged'] else 'melee'}</small>"),
        ("Armour", fmt(s["armor"])),
        ("Magic resist", fmt(s["magic_resist"])),
        ("Move speed", fmt(s["move_speed"])),
    ]
    stats_html = "".join(f"<div class='stat'><dt>{esc(k)}</dt><dd>{v}</dd></div>" for k, v in stat_rows)
    related = "".join(
        f'<a class="chip" href="{o["id"]}.html" style="--accent:{o["colour"]}">{esc(o["name"])}</a>'
        for o in others
    )
    return (template
            .replace("{{id}}", c["id"])
            .replace("{{name}}", esc(c["name"]))
            .replace("{{title}}", esc(c["title"]))
            .replace("{{class}}", esc(c["class"]))
            .replace("{{resource}}", esc(c["resource"] if c["resource"] not in ("None", "") else "No resource"))
            .replace("{{colour}}", c["colour"])
            .replace("{{sigil}}", (f'<img src="../assets/img/portraits/{c["id"]}.png" alt="Painted portrait of {esc(c["name"])}" width="512" height="512">'
                                   if c["portrait"] else esc(c["name"][:1])))
            .replace("{{og_image}}", (f'https://alphamoba.com/assets/img/portraits/{c["id"]}.png'
                                      if c["portrait"] else "https://alphamoba.com/assets/img/portraits/oryssa.png"))
            .replace("{{kit}}", "".join(kit_html))
            .replace("{{stats}}", stats_html)
            .replace("{{related}}", related)
            .replace("{{passive_name}}", esc(c["kit"][0]["name"]))
            .replace("{{passive_blurb}}", esc(c["kit"][0]["description"][:160])))


def main():
    if not GAMEDATA.is_dir():
        sys.exit(f"no GameData at {GAMEDATA}; pass the alphamoba-unity path")
    roster = sorted(
        (champion(p) for p in sorted((GAMEDATA / "champions").glob("*.json"))
         if p.stem not in NOT_CHAMPIONS),
        key=lambda c: c["name"],
    )
    items = sorted(
        (item(p) for p in sorted((GAMEDATA / "items").glob("*.json"))),
        key=lambda i: (i["tier"], i["cost"], i["name"]),
    )
    names = {i["id"]: i["name"] for i in items}
    art_dir = SITE / "assets" / "img" / "items"
    art_dir.mkdir(parents=True, exist_ok=True)
    for i in items:
        i["components"] = [{"id": cid, "name": names.get(cid, cid)} for cid in i["components"]]
        source = ITEM_ART / f"{i['id']}.png"
        i["art"] = source.exists()
        if i["art"]:
            width, height, rgba = decode_png(source)
            plate = compose(Picture(width, height, rgba), i["category"], i["tier"], i["id"])
            (art_dir / f"{i['id']}.png").write_bytes(encode_png(*plate))

    (SITE / "data").mkdir(exist_ok=True)
    (SITE / "data" / "champions.json").write_text(json.dumps(roster, indent=1), encoding="utf-8")
    (SITE / "data" / "items.json").write_text(json.dumps(items, indent=1), encoding="utf-8")
    (SITE / "data" / "map.json").write_text(json.dumps(hushwood(), indent=1), encoding="utf-8")

    template = (SITE / "tools" / "champion.template.html").read_text(encoding="utf-8")
    out = SITE / "champions"
    out.mkdir(exist_ok=True)
    for stale in out.glob("*.html"):
        if stale.name != "index.html":
            stale.unlink()
    for c in roster:
        (out / f"{c['id']}.html").write_text(champion_page(c, roster, template), encoding="utf-8")
    print(f"{len(roster)} champions, {len(items)} items, {len(roster)} pages")


if __name__ == "__main__":
    main()
