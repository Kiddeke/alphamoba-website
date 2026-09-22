# alphamoba.com

The public site for **Wychwood**, the lane-and-jungle forest MOBA by Thornwake
Games (working name: *alphamoba*). It is a static site: plain HTML, one
stylesheet, one script, no build step, served by GitHub Pages at
[alphamoba.com](https://alphamoba.com).

## Layout

- `index.html` — the front page: what the game is, the modes, a dozen
  champions, and where development stands.
- `champions/` — the roster (`index.html`, filtered in the browser) and one
  static page per champion (`azra.html` … `yip.html`), generated.
- `items/` — the shop, filtered in the browser by tier and category.
- `maps/` — the Hushwood drawn as an SVG from the game's own map graph, plus
  the Wide Wood and the Toll Road.
- `data/` — `champions.json`, `items.json`, `map.json`, generated.
- `assets/` — `css/site.css`, `js/site.js`, and the images the site owns.
- `tools/` — `build_data.py` and `champion.template.html`, the generator.

## Resyncing with the game

Champion kits, item text and the map come straight out of the
[alphamoba-unity](https://github.com/Kiddeke/alphamoba-unity) repository's
`GameData/` sheets. When the game's data changes, regenerate from a sibling
checkout:

```
python3 tools/build_data.py ../alphamoba-unity
```

That rewrites `data/*.json` and every `champions/<id>.html`. Only the Python
standard library is needed. Each champion's accent colour is lifted from its
own texture atlas the same way the game's portrait wash is (the heaviest hue
among the saturated, mid-value texels), so a champion that changes colour in
the game changes colour here on the next run. Two are special-cased in the
script: Wick reads the master's sheet of the Wick-and-Tatters pair, and
Rime's frost is named by hand because that model ships with its texture
embedded.

`assets/img/portraits/` holds a portrait for every champion: the painting
where one exists under the game's `Resources/Portraits`, otherwise a bake
from the champion's own model. `tools/bake_portraits.mjs` is the game's
`ChampionPortrait` outside Unity: it finds the head through the rig's skin
weights, frames it face-on, lights it with the same key and fill, sets it on
the champion-colour wash and inks the outline. It needs `node` on the PATH
when the generator runs; the finished PNGs are committed, so the deployed
site needs nothing. The bakes are framed slightly wider than the game's own
(margin 1.15 against 0.72) so they sit beside the painted busts. A champion
whose model texture is a JPEG (Rime's GLB) cannot be baked by the PNG-only
codecs and keeps a lettered tile until painted. `assets/img/items/`
holds the seventy-two item medallions: the game's staged CraftPix icon art
(`Assets/Resources/Icons/art/items/`) painted onto the same plate the
in-game shop draws behind it. `tools/medallion.py` is a port of the game's
`ItemMedallion` painter (category-tinted ground, neutral frame, a glow in
the art's dominant colour throttled by tier, sparkle on finished items), so
the site and the shop screen show the same picture. Those
come from a Unity Asset Store pack whose licence covers use inside the game;
serving them from a public site is a judgement the licence holder has made,
and the CC BY glyph set under `Assets/Resources/Icons/items/` in the game
repo is the drop-in alternative if that changes. The AlkaKrab score is not
copied here.

Screenshots go in `assets/img/shots/` and are listed in `data/shots.json`;
see the README in that folder. The front page's gallery stays hidden until
the list has an entry.

## Deploying

`.github/workflows/pages.yml` publishes the repository root to GitHub Pages on
every push to `master` or `main`. One-time setup in the repository settings:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. **Settings → Pages → Custom domain:** `alphamoba.com` (the `CNAME` file in
   this repo keeps it set). Tick **Enforce HTTPS** once the certificate has
   been issued.
3. At the DNS provider for `alphamoba.com`:
   - `A` records for the apex (`@`) pointing at GitHub Pages:
     `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
     (and, optionally, the matching `AAAA` records
     `2606:50c0:8000::153` … `2606:50c0:8003::153`).
   - a `CNAME` record for `www` pointing at `kiddeke.github.io`.

GitHub's own reference for these values is
<https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site>.

## Previewing locally

Any static server from the repository root works. The roster, shop and map
fetch their JSON, so open it through a server rather than as a file:

```
python3 -m http.server 8000
```

then visit <http://localhost:8000/>. Every link and asset path is relative, so the
site also works served under a sub-path, such as the repository's
`kiddeke.github.io/alphamoba-website/` address before the domain is pointed.
