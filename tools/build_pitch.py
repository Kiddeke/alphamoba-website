#!/usr/bin/env python3
"""Builds in-development/index.html — every character in Wychwood, the
roster and the pitches together, grouped by the region or kingdom each
belongs to (data/regions.json) — and stages the pitch portraits at a web
size under assets/img/pitch/.

    python3 tools/build_pitch.py ../alphamoba-unity <staged-portraits-dir> [<more-dir>...]

The roster comes from data/champions.json (its tiles link to the champion
pages); the pitches come from the game's sheets (Tooling/Art/
portrait_prompts_new.tsv, _anime.tsv) and are marked as in development.
Only the standard library and Pillow.
"""
import html, json, os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
unity = os.path.abspath(sys.argv[1])
staged = [os.path.abspath(d) for d in sys.argv[2:]]
OUT_IMG = os.path.join(ROOT, "assets", "img", "pitch")
os.makedirs(OUT_IMG, exist_ok=True)

regions = json.load(open(os.path.join(ROOT, "data", "regions.json"), encoding="utf-8"))
roster = json.load(open(os.path.join(ROOT, "data", "champions.json"), encoding="utf-8"))
PITCH_SHEETS = [("portrait_prompts_new.tsv", "In development"), ("portrait_prompts_anime.tsv", "Anime pitch")]

def rows(sheet):
    out = []
    for line in open(os.path.join(unity, "Tooling", "Art", sheet), encoding="utf-8"):
        if not line.strip() or line.startswith("#"):
            continue
        cid, heading, desc = line.rstrip("\n").split("\t")[:3]
        name, _, title = heading.partition(",")
        out.append((cid.strip(), name.strip(), title.strip(), desc.strip()))
    return out

def stage(cid):
    for d in staged:
        src = os.path.join(d, cid + ".png")
        if os.path.exists(src):
            Image.open(src).convert("RGB").resize((384, 384), Image.LANCZOS).save(os.path.join(OUT_IMG, cid + ".jpg"), quality=84)
            return True
    return os.path.exists(os.path.join(OUT_IMG, cid + ".jpg"))

# Every character: id -> (name, title, kind, href, image, blurb, colour)
people = {}
for c in roster:
    img = f"../assets/img/portraits/{c['id']}.png" if c.get("portrait") else None
    people[c["id"]] = (c["name"], c["title"], c.get("class", ""), f"../champions/{c['id']}.html", img, "", c.get("colour", "#7a6a4a"))
for sheet, mark in PITCH_SHEETS:
    for cid, name, title, desc in rows(sheet):
        img = f"../assets/img/pitch/{cid}.jpg" if stage(cid) else None
        people[cid] = (name, title, mark, None, img, desc, "#b08d3c")

def tile(cid):
    name, title, kind, href, img, blurb, colour = people[cid]
    face = f'<img src="{img}" width="384" height="384" alt="" loading="lazy">' if img else ""
    tag = f'<span class="cls">{html.escape(kind)}</span>' if href else ""
    body = (f'<div class="face">{face}{tag}</div>'
            f'<div class="who"><strong>{html.escape(name)}</strong><span>{html.escape(title)}</span>'
            + ("" if href else f'<em class="pending">{html.escape(kind)}</em>') + '</div>')
    if href:
        return f'<li><a class="roster-tile" href="{href}" style="--accent:{colour}">{body}</a></li>'
    return f'<li><div class="roster-tile pitch-tile" style="--accent:{colour}" title="{html.escape(blurb)}">{body}</div></li>'

unplaced = [cid for cid in people if cid not in regions["champions"]]
sections = []
for region in regions["regions"]:
    members = [cid for cid, r in regions["champions"].items() if r == region["id"] and cid in people]
    members.sort(key=lambda cid: (people[cid][3] is None, people[cid][0]))
    live = sum(1 for cid in members if people[cid][3])
    count = f"{len(members)} characters, {live} in the game" if live else f"{len(members)} characters, none in the game yet"
    sections.append(f'''
  <section class="section" id="{region['id']}">
    <div class="wrap">
      <div class="section-head">
        <p class="eyebrow">{html.escape(count)}</p>
        <h2>{html.escape(region['name'])}</h2>
        <p class="lede">{html.escape(region['blurb'])}</p>
      </div>
      <ul class="roster" aria-label="{html.escape(region['name'])}">
{chr(10).join(tile(cid) for cid in members)}
      </ul>
    </div>
  </section>''')
if unplaced:
    sections.append(f'''
  <section class="section" id="unplaced">
    <div class="wrap">
      <div class="section-head"><h2>Unplaced</h2></div>
      <ul class="roster">{"".join(tile(cid) for cid in unplaced)}</ul>
    </div>
  </section>''')

toc = " · ".join(f'<a href="#{r["id"]}">{html.escape(r["name"])}</a>' for r in regions["regions"])
page = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>In development · Wychwood</title>
<meta name="description" content="Every character of Wychwood by region and kingdom: the roster that is in the game, and the faces being screened for it.">
<link rel="canonical" href="https://alphamoba.com/in-development/">
<link rel="icon" href="../assets/img/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Source+Sans+3:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/css/site.css">
<style>.pitch-tile {{ cursor: default; }} .roster-tile .face {{ aspect-ratio: 1; }} .regions {{ color: var(--faded); font-size: 0.95rem; line-height: 2; }}</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="masthead">
  <a class="wordmark" href="../index.html">Wychwood</a>
  <nav class="nav" aria-label="Main">
    <a href="../champions/">Champions</a>
    <a href="../items/">Items</a>
    <a href="../maps/">Maps</a>
    <a href="../in-development/" aria-current="page">In development</a>
    <a href="../#status">Status</a>
  </nav>
</header>

<main id="main">
  <section class="section">
    <div class="wrap">
      <div class="section-head">
        <p class="eyebrow">Regions and kingdoms</p>
        <h1>In development</h1>
        <p class="lede">Every character in Wychwood, by where they come from. A tile with a class on it is in the game and opens the champion's page; a tile marked in development is a portrait and a sentence, up for screening.</p>
        <p class="regions">{toc}</p>
      </div>
    </div>
  </section>
{"".join(sections)}
</main>

<footer class="footer">
  <div class="wrap footer-inner">
    <p><strong>Wychwood</strong> is a lane-and-jungle forest MOBA by Thornwake Games, in development. <em>alphamoba</em> is its working name.</p>
    <p class="fine">The regions are the world's; the pitches are not final, and some will never be built.</p>
  </div>
</footer>
<script src="../assets/js/site.js" defer></script>
</body>
</html>
'''
os.makedirs(os.path.join(ROOT, "in-development"), exist_ok=True)
open(os.path.join(ROOT, "in-development", "index.html"), "w", encoding="utf-8").write(page)
print("wrote in-development/index.html:", len(people), "characters,", len(unplaced), "unplaced")
