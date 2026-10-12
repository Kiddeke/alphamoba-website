#!/usr/bin/env python3
"""Export data/stats.json, the stats page's one file, from the alphamoba-unity
checkout.

Reads the match farm's GameData/stats/stats.json (win rates, tiers and
ranks per champion and role, item numbers) and the ranked ladder,
GameData/ranked/tiers.json and ladder.json (docs/ranked.md in the game),
and keeps only what the page draws.

Usage:
    python3 tools/build_stats.py [path-to-alphamoba-unity]

build_data.py runs this too; on its own it is the quick way to pick up a
night's farm and ladder without rebuilding everything else. Only the Python
standard library is used.
"""
import json
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
ROLES = ("top", "jungle", "mid", "bot", "support")


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def pct(x):
    return round(x * 100, 1)


def row(r):
    """The numbers every table row shares, as percentages."""
    return {
        "tier": r.get("tier"),
        "tier_change": r.get("tier_change"),
        "games": r["games"],
        "win_rate": pct(r["win_rate"]),
        "win_delta": r.get("win_rate_delta"),
        "pick_rate": pct(r.get("pick_rate", 0)),
        "lo": pct(r["wilson_lo"]),
        "hi": pct(r["wilson_hi"]),
    }


def champion_stats(s):
    out = []
    for cid, c in s["champions"].items():
        roles = sorted(c.get("roles", {}).items(), key=lambda kv: -kv[1]["games"])
        out.append({
            "id": cid, "class": c.get("class"), **row(c),
            "adjusted": c.get("adjusted", c["win_rate"]),
            "kda": c.get("kda"), "kills": c.get("kills"), "deaths": c.get("deaths"), "assists": c.get("assists"),
            "cs": c.get("cs_per_min"), "gold": round(c.get("gold_per_min", 0)), "damage": round(c.get("damage_per_min", 0)),
            "roles": [r for r, _ in roles],
        })
    out.sort(key=lambda c: -c.pop("adjusted"))
    for i, c in enumerate(out):
        c["rank"] = i + 1
    return out


def role_stats(s):
    out = {}
    for role in ROLES:
        rows = s["tiers"].get(role, [])
        out[role] = [{"id": r["champion"], "rank": r["rank"], "rank_change": r.get("rank_change", 0), **row(r)}
                     for r in sorted(rows, key=lambda r: r["rank"])]
    return out


def item_stats(s, min_games):
    """Items finished in enough games, best first by the same pulled-toward-even
    win rate the tiers use, so a few lucky games don't top the list."""
    rows = [(i.get("adjusted", i["win_rate"]), {"id": iid, **row(i)}) for iid, i in s["items"].items() if i["games"] >= min_games]
    return [r for _, r in sorted(rows, key=lambda t: -t[0])]


def ranked(unity):
    tiers = load(unity / "GameData" / "ranked" / "tiers.json")
    ladder = load(unity / "GameData" / "ranked" / "ladder.json")
    divisions = tiers.get("divisions", ["III", "II", "I"])
    apex = tiers.get("apex")
    accounts = []
    for a in ladder["accounts"]:
        d = a.get("division", 0)
        accounts.append({
            "rank": a["rank"], "name": a["name"], "role": a["role"],
            "rating": round(a["rating"]), "peak": round(a.get("peak", a["rating"])),
            "tier": a["tier"], "division": divisions[len(divisions) - d] if 1 <= d <= len(divisions) else "",
            "rings": a.get("rings", 0), "apex": a.get("apex", 0),
            "games": a["games"], "wins": a["wins"], "losses": a["losses"], "streak": a.get("streak", 0),
            "climbed": a.get("last", {}).get("rank", 0),
            "main": a.get("most_played", {}).get("champion"),
            "history": [round(h) for h in a.get("history", [])],
        })
    return {
        "season": tiers.get("season", ladder.get("season")),
        "generated": ladder.get("generated"),
        "nights": ladder.get("nights"),
        "matches": ladder.get("matches"),
        "tiers": [{k: t[k] for k in ("id", "name", "flavour", "colour", "floor")} for t in tiers["tiers"]]
                 + ([{**{k: apex[k] for k in ("id", "name", "flavour", "colour", "floor")}, "apex": True, "size": apex.get("size")}]
                    if apex else []),
        "counts": ladder.get("tier_counts", {}),
        "accounts": accounts,
    }


def export(unity):
    s = load(unity / "GameData" / "stats" / "stats.json")
    prev = s.get("previous") or {}
    data = {
        "generated": s["generated"],
        "matches": s["matches"],
        "minutes": s.get("avg_duration_min"),
        "blue_win_rate": pct(s.get("blue_win_rate", 0.5)),
        "previous": {"generated": prev.get("generated"), "matches": prev.get("matches")},
        "min_games": s.get("params", {}).get("min_games", 20),
        "champions": champion_stats(s),
        "roles": role_stats(s),
        "items": item_stats(s, s.get("params", {}).get("min_games", 20)),
        "ranked": ranked(unity),
    }
    (SITE / "data").mkdir(exist_ok=True)
    (SITE / "data" / "stats.json").write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    return data


if __name__ == "__main__":
    unity = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else SITE.parent / "alphamoba-unity"
    if not (unity / "GameData" / "stats" / "stats.json").exists():
        sys.exit(f"no stats at {unity}/GameData/stats; pass the alphamoba-unity path")
    d = export(unity)
    print(f"{d['matches']} matches, {len(d['champions'])} champions, {len(d['items'])} items, "
          f"{len(d['ranked']['accounts'])} ranked accounts")
