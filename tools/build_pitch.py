#!/usr/bin/env python3
"""Builds in-development/index.html — the champions being screened, portraits
only, from the game's pitch sheets — and stages their portraits at a web
size under assets/img/pitch/.

    python3 tools/build_pitch.py ../alphamoba-unity <staged-portraits-dir> [<more-dir>...]

Each pitch sheet (Tooling/Art/portrait_prompts_new.tsv, _anime.tsv) is a
section; a row whose portrait is not staged is listed without a face.
Only the standard library and Pillow.
"""
import html, os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
unity = os.path.abspath(sys.argv[1])
staged = [os.path.abspath(d) for d in sys.argv[2:]]
OUT_IMG = os.path.join(ROOT, "assets", "img", "pitch")
os.makedirs(OUT_IMG, exist_ok=True)

SHEETS = [
    ("The second roster", "Thirty-eight new faces, drawn to be screened. Each is a name, a title and a look; the kits come later, for the ones that stay.", "portrait_prompts_new.tsv"),
    ("Anime pitch", "Ten of the genre's own archetypes, tried on Wychwood's paint.", "portrait_prompts_anime.tsv"),
]

def rows(sheet):
    path = os.path.join(unity, "Tooling", "Art", sheet)
    out = []
    for line in open(path, encoding="utf-8"):
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
            dst = os.path.join(OUT_IMG, cid + ".jpg")
            Image.open(src).convert("RGB").resize((384, 384), Image.LANCZOS).save(dst, quality=84)
            return True
    return False

sections = []
for title, lede, sheet in SHEETS:
    tiles = []
    for cid, name, sub, desc in rows(sheet):
        face = stage(cid)
        img = f'<img src="../assets/img/pitch/{cid}.jpg" width="384" height="384" alt="" loading="lazy">' if face else '<span class="cls">No portrait yet</span>'
        tiles.append(
            f'<li><div class="roster-tile pitch-tile" title="{html.escape(desc)}">'
            f'<div class="face">{img}</div>'
            f'<div class="who"><strong>{html.escape(name)}</strong><span>{html.escape(sub)}</span>'
            f'<em class="pending">In development</em></div></div></li>')
    sections.append(f'''
  <section class="section">
    <div class="wrap">
      <div class="section-head">
        <p class="eyebrow">Being screened</p>
        <h2>{html.escape(title)}</h2>
        <p class="lede">{html.escape(lede)}</p>
      </div>
      <ul class="roster" aria-label="{html.escape(title)}">
{chr(10).join(tiles)}
      </ul>
    </div>
  </section>''')

page = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>In development · Wychwood</title>
<meta name="description" content="Champions being screened for Wychwood: portraits of the second roster and an anime pitch, none of them in the game yet.">
<link rel="canonical" href="https://alphamoba.com/in-development/">
<link rel="icon" href="../assets/img/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Source+Sans+3:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/css/site.css">
<style>.pitch-tile {{ cursor: default; }} .pitch-tile .face {{ aspect-ratio: 1; }}</style>
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
        <p class="eyebrow">The drawing board</p>
        <h1>In development</h1>
        <p class="lede">Faces that are not in the game. Every champion on this page is a portrait and a sentence, up for screening; the ones that survive get a kit, a body and a page of their own.</p>
      </div>
    </div>
  </section>
{"".join(sections)}
</main>

<footer class="footer">
  <div class="wrap footer-inner">
    <p><strong>Wychwood</strong> is a lane-and-jungle forest MOBA by Thornwake Games, in development. <em>alphamoba</em> is its working name.</p>
    <p class="fine">Nothing on this page is final, and some of it will never be built.</p>
  </div>
</footer>
<script src="../assets/js/site.js" defer></script>
</body>
</html>
'''
os.makedirs(os.path.join(ROOT, "in-development"), exist_ok=True)
open(os.path.join(ROOT, "in-development", "index.html"), "w", encoding="utf-8").write(page)
print("wrote in-development/index.html;", len(os.listdir(OUT_IMG)), "portraits staged")
