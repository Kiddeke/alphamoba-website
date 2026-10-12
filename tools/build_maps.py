#!/usr/bin/env python3
"""Export data/maps/, the maps page's files, from the alphamoba-unity checkout.

    data/maps/index.json   the boards, the Witchwood's jungle layouts, and the
                           numbers the info panel shows: every camp and its
                           monsters, the objective buffs, the watchfires, the
                           minions and the jungle's growth
    data/maps/<id>.json    one board: nodes, lanes, every wall box, brush and
                           the river

The walls, brush and river come from the game's own builders (WallBuilder,
BrushProfile, RiverProfile) run by tools/mapdump when dotnet is on the PATH,
so the plan shows exactly what the pathing blocks. Without dotnet the
geometry already in data/maps/ is kept and only the rest is refreshed.

Usage:
    python3 tools/build_maps.py [path-to-alphamoba-unity]
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
OUT = SITE / "data" / "maps"

# (site id, map file stem, mode)
BOARDS = [
    ("hushwood", "treeline_map_def", "3v3"),
    ("witchwood", "witchwood_map_def", "5v5"),
    ("widewood", "rift_map_def", "5v5 · archived"),
]
# Node types, as MapDefinition's NodeType numbers them.
KIND = {0: "waypoint", 1: "fountain", 2: "nexus", 3: "inhibitor", 4: "tower", 5: "camp", 6: "altar", 7: "pit"}
# CampLoader.DistrictCamps: the Witchwood's and Wide Wood's named camps.
DISTRICT_CAMPS = [
    ("lantern_warden", "lantern_warden_camp"), ("bone_kraken", "bone_kraken_camp"),
    ("lantern_sentinel", "lantern_sentinel_camp"), ("bone_sentinel", "bone_sentinel_camp"),
    ("wisp", "wisp_camp"), ("strider", "strider_camp"), ("moth", "moth_camp"), ("cricket", "cricket_camp"),
    ("hound", "hound_camp"), ("crawler", "crawler_camp"), ("wraith", "wraith_camp"), ("beetle", "beetle_camp"),
]
# ObjectiveLoader: the team purse an epic pays besides its buff.
WARDEN_TEAM_GOLD, KRAKEN_TEAM_GOLD = 75, 250
# ChampionBuff.Emberheart / Duskweave, the two sentinels' buffs.
GOLEM_BUFFS = {
    "emberheart": {"name": "Emberheart", "lines": ["+15% damage", "8% of damage dealt healed back"]},
    "duskweave": {"name": "Duskweave", "lines": ["15% shorter cooldowns", "+8% move speed"]},
}


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def camp_id_for(node_id):
    """CampLoader.CampIdFor: which camp sheet a node id names."""
    for mark, camp in DISTRICT_CAMPS:
        if mark in node_id:
            return camp
    for mark, camp in (("kraken", "kraken_camp"), ("boss", "boss_camp"), ("center", "sentinel_camp"),
                       ("squid", "squid_camp"), ("crab", "crab_camp"), ("horror", "horror_camp")):
        if mark in node_id:
            return camp
    return "grove_camp"


def ref_id(ref):
    return ref["ref"].rsplit("/", 1)[-1].replace(".tres", "") if ref else None


def unit(jungle, uid):
    f = load(jungle / f"{uid}.json")["fields"]
    return {"name": f.get("display_name") or uid.replace("_", " ").title(), "health": f["max_health"],
            "damage": f["attack_damage"], "attack_speed": round(1 / f["attack_cooldown"], 2),
            "range": f["attack_range"], "armor": f["armor"], "magic_resist": f["magic_resist"], "ranged": f["ranged_attack"]}


def camp(jungle, cid):
    f = load(jungle / f"{cid}.json")["fields"]
    large, small = ref_id(f.get("large_unit")), ref_id(f.get("small_unit"))
    out = {
        "name": f["camp_name"], "large": unit(jungle, large) if large else None,
        "small": unit(jungle, small) if small and f.get("small_count") else None,
        "small_count": int(f.get("small_count") or 0),
        "gold": f["large_gold"] + f.get("small_gold", 0) * int(f.get("small_count") or 0),
        "xp": f["large_xp"] + f.get("small_xp", 0) * int(f.get("small_count") or 0),
        "respawn": f["respawn_time"], "first_spawn": f.get("first_spawn_delay", 0), "leash": f["leash_radius"],
        "growth_per_minute": f.get("growth_per_minute", 0),
    }
    if cid in ("boss_camp", "lantern_warden_camp"):
        out.update(epic=True, buff="boss_buff", team_gold=WARDEN_TEAM_GOLD)
    elif cid in ("kraken_camp", "bone_kraken_camp"):
        out.update(epic=True, buff="kraken_buff", team_gold=KRAKEN_TEAM_GOLD)
    return out


def layouts(unity):
    """The Witchwood's jungle layouts, read from Sim/Map/JungleLayouts.cs so
    the names and blurbs are the game's."""
    src = (unity / "Assets" / "Scripts" / "Sim" / "Map" / "JungleLayouts.cs").read_text(encoding="utf-8")
    return [{"id": m[0], "name": m[1], "blurb": m[2]}
            for m in re.findall(r'new Layout\("(\w+)",\s*"([^"]+)",\s*"([^"]+)"\)', src)]


def board(unity, stem, sid, mode, geometry):
    f = load(unity / "GameData" / "maps" / f"{stem}.json")["fields"]
    walls = f["walls"]["fields"]
    corner = walls.get("corner_bases", False)
    nodes = []
    for raw in f["nodes"]:
        n = raw["fields"]
        x, _, z = n["position"]
        x, y = round(x, 2), round(-z, 2)  # MapLoader.Mirrored: the sim frame
        kind = KIND.get(n.get("type", 0), "waypoint")
        node = {"id": n["id"], "x": x, "y": y, "team": n.get("team", -1), "kind": kind}
        if n.get("mouth_deg") is not None:
            node["mouth"] = round(180 - n["mouth_deg"], 1)  # mirrored like a heading
        if kind in ("camp", "pit"):
            node["camp"] = camp_id_for(n["id"])
            if node["camp"].endswith("sentinel_camp"):
                # LaneGreybox: by side of the mid diagonal on corner-base boards, else north/south.
                node["golem_buff"] = "emberheart" if (x < y if corner else y >= 0) else "duskweave"
        if kind == "tower":
            node["tier"] = next((t for t in ("front", "outer", "nexus") if t in n["id"]), "inner")
        if kind == "altar":
            # LaneMatch.DressAltars hands the buffs out in node order: Fury first.
            node["buff"] = "altar_fury" if sum(1 for o in nodes if o["kind"] == "altar") == 0 else "altar_swiftness"
        nodes.append(node)
    size = f.get("world_size", 120)
    size = size[0] if isinstance(size, list) else size
    out = {
        "id": sid, "name": f.get("map_name", sid), "mode": mode, "size": size,
        "half_lane": walls.get("half_lane_width", 6),
        "nodes": nodes,
        "edges": [[e["fields"]["from_id"], e["fields"]["to_id"]] for e in f["edges"]],
        "lanes": {k: [[round(p[0], 2), round(-p[2], 2)] for p in v] for k, v in f["lanes"].items()},
    }
    out.update(geometry)
    return out


def dump_geometry(unity, stems):
    """Runs tools/mapdump over the given map stems. Returns {stem: geometry}
    or None when dotnet is not available."""
    dotnet = shutil.which("dotnet") or (str(Path.home() / ".dotnet" / "dotnet") if (Path.home() / ".dotnet" / "dotnet").exists() else None)
    if not dotnet:
        return None
    with tempfile.TemporaryDirectory() as tmp:
        result = subprocess.run(
            [dotnet, "run", "-c", "Release", "--project", str(SITE / "tools" / "mapdump"), f"-p:UnityRoot={unity}", "--",
             str(unity / "GameData" / "maps"), tmp, *stems],
            capture_output=True, text=True, env={**os.environ, "DOTNET_CLI_TELEMETRY_OPTOUT": "1"})
        if result.returncode != 0:
            print(result.stdout[-2000:], result.stderr[-2000:])
            return None
        return {s: load(Path(tmp) / f"{s}.geometry.json") for s in stems}


def export(unity):
    jungle = unity / "GameData" / "jungle"
    lays = layouts(unity)
    boards = list(BOARDS) + [(f"witchwood_{l['id']}", f"witchwood_{l['id']}_map_def", "5v5") for l in lays]
    geo = dump_geometry(unity, [stem for _, stem, _ in boards])
    OUT.mkdir(parents=True, exist_ok=True)
    camps = {}
    for sid, stem, mode in boards:
        if geo:
            geometry = geo[stem]
        else:
            old = OUT / f"{sid}.json"
            if not old.exists():
                print(f"  {sid}: no dotnet and no geometry yet; skipped")
                continue
            geometry = {k: load(old)[k] for k in ("walls", "brush", "river")}
        b = board(unity, stem, sid, mode, geometry)
        for n in b["nodes"]:
            if "camp" in n and n["camp"] not in camps:
                camps[n["camp"]] = camp(jungle, n["camp"])
        (OUT / f"{sid}.json").write_text(json.dumps(b, separators=(",", ":")), encoding="utf-8")
    buffs = {k: load(unity / "GameData" / "objectives" / f"{k}.json")["fields"]
             for k in ("altar_fury", "altar_swiftness", "boss_buff", "kraken_buff")}
    units = unity / "GameData" / "units"
    index = {
        "boards": [{"id": sid, "mode": mode} for sid, _, mode in BOARDS],
        "layouts": [{**l, "board": f"witchwood_{l['id']}"} for l in lays],
        "camps": camps,
        "buffs": buffs,
        "golem_buffs": GOLEM_BUFFS,
        "watchfire": load(units / "watchfire.json"),
        "minions": {k: unit(units, k) for k in ("minion", "caster_minion", "siege_minion", "super_minion")},
        "jungle_growth": {k: v for k, v in load(units / "jungle.json").items() if k in ("growth_start", "growth_end", "kinds")},
    }
    for k in ("note", "type"):
        index["watchfire"].pop(k, None)
    (OUT / "index.json").write_text(json.dumps(index, indent=1), encoding="utf-8")
    return len(boards), len(camps), bool(geo)


if __name__ == "__main__":
    unity = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else SITE.parent / "alphamoba-unity"
    if not (unity / "GameData" / "maps").is_dir():
        sys.exit(f"no GameData/maps at {unity}; pass the alphamoba-unity path")
    n, c, fresh = export(unity)
    print(f"{n} boards, {c} camp kinds" + ("" if fresh else " (geometry kept: dotnet not found)"))
