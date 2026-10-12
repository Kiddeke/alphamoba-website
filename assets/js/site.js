// AlphaMOBA — shared page scripts. No build step, no framework.
(function () {
  "use strict";

  // The site's root, derived from where this script was loaded from, so the
  // pages work at a domain root (alphamoba.com/) and under a project path
  // (kiddeke.github.io/alphamoba-website/) alike.
  var ROOT = (function () {
    var me = document.currentScript && document.currentScript.src;
    return me ? me.replace(/assets\/js\/site\.js.*$/, "") : "./";
  })();

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function fmt(n) { return Number.isInteger(n) ? String(n) : String(+n.toFixed(2)); }

  // ------------------------------------------------------------ roster
  var roster = document.querySelector("[data-roster]");
  if (roster) {
    var filters = document.querySelectorAll("[data-class-filter]");
    var search = document.querySelector("[data-roster-search]");
    var all = [];
    var activeClass = "All";
    var homeLimit = +roster.getAttribute("data-limit") || 0;
    var pick = (roster.getAttribute("data-pick") || "").split(",").filter(Boolean);

    function render() {
      var q = (search && search.value.trim().toLowerCase()) || "";
      var shown = all.filter(function (c) {
        if (activeClass !== "All" && c.class !== activeClass) return false;
        if (!q) return true;
        return (c.name + " " + c.title + " " + c.class).toLowerCase().indexOf(q) !== -1;
      });
      if (pick.length) shown = pick.map(function (id) { return shown.filter(function (c) { return c.id === id; })[0]; }).filter(Boolean);
      if (homeLimit) shown = shown.slice(0, homeLimit);
      roster.innerHTML = shown.map(function (c) {
        var face = c.portrait
          ? '<img src="' + ROOT + 'assets/img/portraits/' + esc(c.id) + '.png" alt="" loading="lazy">'
          : esc(c.name.charAt(0));
        return '<li><a class="roster-tile" href="' + ROOT + 'champions/' + c.id + '.html" style="--accent:' + esc(c.colour) + '">' +
          '<div class="face" aria-hidden="true">' + face + '<span class="cls">' + esc(c.class) + '</span></div>' +
          '<div class="who"><strong>' + esc(c.name) + '</strong><span>' + esc(c.title) + '</span>' +
          (c.pending ? '<em class="pending">Kit in design</em>' : '') + '</div></a></li>';
      }).join("") || '<li class="roster-empty">No champions match.</li>';
      var count = document.querySelector("[data-roster-count]");
      if (count) count.textContent = shown.length === all.length ? all.length + " champions" : shown.length + " of " + all.length;
    }

    fetch(ROOT + "data/champions.json").then(function (r) { return r.json(); }).then(function (data) {
      all = data;
      render();
    }).catch(function () {
      roster.innerHTML = '<li class="roster-empty">The roster could not be loaded.</li>';
    });

    filters.forEach(function (b) {
      b.addEventListener("click", function () {
        activeClass = b.getAttribute("data-class-filter");
        filters.forEach(function (o) { o.setAttribute("aria-pressed", o === b ? "true" : "false"); });
        render();
      });
    });
    if (search) search.addEventListener("input", render);
  }

  // ------------------------------------------------------------ items
  var items = document.querySelector("[data-items]");
  if (items) {
    var tierButtons = document.querySelectorAll("[data-tier-filter]");
    var catButtons = document.querySelectorAll("[data-cat-filter]");
    var itemSearch = document.querySelector("[data-item-search]");
    var allItems = [];
    var tier = "all", cat = "all";
    var tierNames = { 0: "Starter", 1: "Basic", 2: "Epic", 3: "Legendary" };

    function renderItems() {
      var q = (itemSearch && itemSearch.value.trim().toLowerCase()) || "";
      var shown = allItems.filter(function (i) {
        if (tier !== "all" && String(i.tier) !== tier) return false;
        if (cat !== "all" && i.category !== cat) return false;
        if (!q) return true;
        return (i.name + " " + i.description + " " + i.category + " " + (i.passive || "") + " " + (i.passive2 || "") + " " + (i.active || "")).toLowerCase().indexOf(q) !== -1;
      });
      items.innerHTML = shown.map(function (i) {
        var stats = Object.keys(i.stats).map(function (k) {
          var v = i.stats[k];
          var text = (k === "Attack speed" || k === "Move speed" || k === "Lifesteal" || k === "Thorns" || k === "Cull chance" || k === "Cull bonus") && v < 1 && v > -1
            ? Math.round(v * 100) + "% " + k.toLowerCase()
            : "+" + fmt(v) + " " + k.toLowerCase();
          return "<li>" + esc(text) + "</li>";
        }).join("");
        var build = i.components.length
          ? '<p class="item-build">Built from ' + i.components.map(function (c) { return esc(c.name); }).join(" + ") + "</p>"
          : "";
        var passive = i.passive_text
          ? '<p class="item-passive"><strong>' + esc(i.passive || "Unique passive") + '</strong> ' + esc(i.passive_text) + "</p>" : "";
        if (i.passive2_text)
          passive += '<p class="item-passive"><strong>' + esc(i.passive2 || "Unique passive") + '</strong> ' + esc(i.passive2_text) + "</p>";
        var active = i.active ? '<p class="item-active">Active — ' + esc(i.active) + (i.active_cooldown ? " (" + fmt(i.active_cooldown) + "s)" : "") +
          (i.active_text ? '<span class="item-active-text"> ' + esc(i.active_text) + "</span>" : "") + "</p>" : "";
        var art = i.art
          ? '<img class="item-icon" src="' + ROOT + 'assets/img/items/' + esc(i.id) + '.png" alt="" width="128" height="128" loading="lazy">'
          : '<span class="item-icon item-icon-blank" aria-hidden="true">' + esc(i.name.charAt(0)) + "</span>";
        return '<li class="item tier-' + i.tier + ' cat-' + esc(i.category) + '">' +
          '<div class="item-head">' + art + '<div class="item-title"><h3>' + esc(i.name) + '</h3>' +
          '<p class="item-cat">' + esc(tierNames[i.tier] || "Tier " + i.tier) + " · " + esc(i.category) + "</p></div>" +
          '<span class="cost">' + i.cost + "</span></div>" +
          (stats ? '<ul class="item-stats">' + stats + "</ul>" : "") +
          passive + active +
          '<p class="item-desc">' + esc(i.description) + "</p>" + build + "</li>";
      }).join("") || '<li class="roster-empty">No items match.</li>';
      var count = document.querySelector("[data-item-count]");
      if (count) count.textContent = shown.length === allItems.length ? allItems.length + " items" : shown.length + " of " + allItems.length;
    }

    fetch(ROOT + "data/items.json").then(function (r) { return r.json(); }).then(function (data) {
      allItems = data;
      renderItems();
    }).catch(function () {
      items.innerHTML = '<li class="roster-empty">The shop could not be loaded.</li>';
    });
    tierButtons.forEach(function (b) {
      b.addEventListener("click", function () {
        tier = b.getAttribute("data-tier-filter");
        tierButtons.forEach(function (o) { o.setAttribute("aria-pressed", o === b ? "true" : "false"); });
        renderItems();
      });
    });
    catButtons.forEach(function (b) {
      b.addEventListener("click", function () {
        cat = b.getAttribute("data-cat-filter");
        catButtons.forEach(function (o) { o.setAttribute("aria-pressed", o === b ? "true" : "false"); });
        renderItems();
      });
    });
    if (itemSearch) itemSearch.addEventListener("input", renderItems);
  }

  // ------------------------------------------------------------ screenshots
  var gallery = document.querySelector("[data-shots]");
  if (gallery) {
    fetch(ROOT + "data/shots.json").then(function (r) { return r.json(); }).then(function (shots) {
      if (!shots || !shots.length) return;
      gallery.innerHTML = shots.map(function (s) {
        return '<li class="shot"><a href="' + ROOT + 'assets/img/shots/' + esc(s.file) + '">' +
          '<img src="' + ROOT + 'assets/img/shots/' + esc(s.file) + '" alt="' + esc(s.alt || s.caption || "") + '" loading="lazy"></a>' +
          (s.caption ? '<p class="shot-caption">' + esc(s.caption) + "</p>" : "") + "</li>";
      }).join("");
      var section = gallery.closest("section");
      if (section) section.hidden = false;
    }).catch(function () {});
  }

  // ------------------------------------------------------------ the Hushwood map
  var map = document.querySelector("[data-hushwood]");
  if (map) {
    fetch(ROOT + "data/map.json").then(function (r) { return r.json(); }).then(function (m) {
      var half = m.size / 2;
      var pad = 6;
      var S = m.size + pad * 2;
      var byId = {};
      m.nodes.forEach(function (n) { byId[n.id] = n; });
      function X(n) { return n.x + half + pad; }
      function Y(n) { return half - n.y + pad; }
      var ns = "http://www.w3.org/2000/svg";
      function el(tag, attrs, text) {
        var e = document.createElementNS(ns, tag);
        Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
        if (text) e.textContent = text;
        return e;
      }
      map.setAttribute("viewBox", "0 0 " + S + " " + S);
      map.innerHTML = "";
      // Ground, river (NW→SE diagonal), and the two base rings (|x+y| = 60).
      map.appendChild(el("rect", { x: 0, y: 0, width: S, height: S, fill: "#0e1a13" }));
      map.appendChild(el("path", {
        d: "M " + pad + " " + pad + " C " + (S * 0.45) + " " + (S * 0.2) + ", " + (S * 0.55) + " " + (S * 0.8) + ", " + (S - pad) + " " + (S - pad),
        stroke: "#1f4c5c", "stroke-width": 7, fill: "none", "stroke-linecap": "round", opacity: 0.9
      }));
      // Ring walls: the diagonal lines x + y = ±60 in the sim frame, which
      // cross the board edge at (±10, ±50) and (±50, ±10).
      [[-1, "#2a3f6b"], [1, "#6b2f2a"]].forEach(function (pair) {
        var sgn = pair[0];
        var e1 = { x: sgn * 10, y: sgn * 50 }, e2 = { x: sgn * 50, y: sgn * 10 };
        map.appendChild(el("line", { x1: X(e1), y1: Y(e1), x2: X(e2), y2: Y(e2), stroke: pair[1], "stroke-width": 2.2, "stroke-dasharray": "3 2" }));
      });
      // Lanes: the graph edges.
      m.edges.forEach(function (e) {
        var a = byId[e.from], b = byId[e.to];
        if (!a || !b) return;
        map.appendChild(el("line", { x1: X(a), y1: Y(a), x2: X(b), y2: Y(b), stroke: "#3b5a44", "stroke-width": 1.6, "stroke-linecap": "round", opacity: 0.85 }));
      });
      var kinds = [
        { test: /fountain/, r: 3.4, fill: function (n) { return n.team === 0 ? "#73a6ff" : "#f27366"; }, label: "Fountain" },
        { test: /nexus/, r: 2.8, fill: function (n) { return n.team === 0 ? "#a9c6ff" : "#ffb0a6"; } },
        { test: /inhib/, r: 2.0, fill: function (n) { return n.team === 0 ? "#73a6ff" : "#f27366"; } },
        { test: /tower/, r: 1.6, fill: function (n) { return n.team === 0 ? "#73a6ff" : "#f27366"; } },
        { test: /kraken/, r: 4.2, fill: function () { return "#6bc7b8"; } },
        { test: /altar/, r: 2.4, fill: function () { return "#f2c761"; } },
        { test: /camp/, r: 1.9, fill: function () { return "#8fa385"; } },
        { test: /center|heart|wood/, r: 0, fill: function () { return "none"; } }
      ];
      m.nodes.forEach(function (n) {
        var k = kinds.filter(function (kk) { return kk.test.test(n.id); })[0];
        if (!k || !k.r) return;
        var c = el("circle", { cx: X(n), cy: Y(n), r: k.r, fill: k.fill(n), stroke: "#06090a", "stroke-width": 0.6 });
        c.appendChild(el("title", {}, n.id.replace(/_/g, " ")));
        map.appendChild(c);
      });
      var labels = [
        ["blue_fountain", "BLUE", 0, -6, "#73a6ff"], ["red_fountain", "RED", 0, 8, "#f27366"],
        ["kraken_pit", "The Kraken's Wake", 0, 8, "#6bc7b8"],
        ["altar_north", "Altar", 0, -4, "#f2c761"], ["altar_south", "Altar", 0, -4, "#f2c761"],
        ["top_center", "top ford", 0, -3, "#8fa385"], ["bot_center", "bot ford", 0, 6, "#8fa385"]
      ];
      labels.forEach(function (l) {
        var n = byId[l[0]]; if (!n) return;
        map.appendChild(el("text", { x: X(n) + l[2], y: Y(n) + l[3], fill: l[4], "font-size": 3.4, "text-anchor": "middle", "font-family": "Source Sans 3, sans-serif", "letter-spacing": 0.3 }, l[1]));
      });
    });
  }

  // ------------------------------------------------------------ the Witchwood plan
  var ww = document.querySelector("[data-witchwood]");
  if (ww) {
    fetch(ROOT + "data/witchwood.json").then(function (r) { return r.json(); }).then(function (m) {
      var half = m.size / 2, pad = 5, S = m.size + pad * 2;
      var byId = {};
      m.nodes.forEach(function (n) { byId[n.id] = n; });
      function X(x) { return x + half + pad; }
      function Y(y) { return half - y + pad; }
      var ns = "http://www.w3.org/2000/svg";
      function el(tag, attrs, text) {
        var e = document.createElementNS(ns, tag);
        Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
        if (text) e.textContent = text;
        return e;
      }
      function pts(list) { return list.map(function (p) { return X(p[0]) + "," + Y(p[1]); }).join(" "); }
      ww.setAttribute("viewBox", "0 0 " + S + " " + S);
      ww.innerHTML = "";
      // The two halves: the Lodge's loam below the diagonal, the Coven's black soil above it.
      ww.appendChild(el("rect", { x: 0, y: 0, width: S, height: S, fill: "#0a1210" }));
      ww.appendChild(el("polygon", { points: pts([[-half, -half], [half, -half], [-half, half]]), fill: "#1f2c19" }));
      ww.appendChild(el("polygon", { points: pts([[half, half], [half, -half], [-half, half]]), fill: "#1c1522" }));
      // The base courts: one paved plate about each nexus, out past its towers.
      ["blue_nexus", "red_nexus"].forEach(function (id) {
        var n = byId[id]; if (!n) return;
        ww.appendChild(el("circle", { cx: X(n.x), cy: Y(n.y), r: 22.5, fill: n.team === 0 ? "#2b3626" : "#261d2c", opacity: 0.9 }));
      });
      // The lanes as roads, then the river channel as the Mistway.
      Object.keys(m.lanes).forEach(function (k) {
        ww.appendChild(el("polyline", { points: pts(m.lanes[k]), fill: "none", stroke: "#8d7a52", "stroke-width": m.half_lane * 2, "stroke-linejoin": "round", "stroke-linecap": "round", opacity: 0.45 }));
      });
      ww.appendChild(el("polyline", { points: pts(m.river), fill: "none", stroke: "#8fa9a4", "stroke-width": 9, "stroke-linejoin": "round", "stroke-linecap": "round", opacity: 0.5 }));
      ww.appendChild(el("polyline", { points: pts(m.river), fill: "none", stroke: "#c9d8d4", "stroke-width": 3, "stroke-linejoin": "round", "stroke-linecap": "round", opacity: 0.45 }));
      // Every wall box: the hitboxes themselves, mossy on the Lodge's half and violet-black on the Coven's.
      m.islands.forEach(function (b) {
        var lodge = b[0] + b[1] < 0;
        ww.appendChild(el("rect", { x: X(b[0] - b[2] / 2), y: Y(b[1] + b[3] / 2), width: b[2], height: b[3], rx: 0.5, fill: lodge ? "#3a5230" : "#33263c" }));
      });
      m.brush.forEach(function (b) {
        ww.appendChild(el("rect", { x: X(b[0] - b[2] / 2), y: Y(b[1] + b[3] / 2), width: b[2], height: b[3], rx: 0.4, fill: "#4c9a3c", opacity: 0.95 }));
      });
      var CAMPS = {
        wisp: "The Wisp Landing", lantern_sentinel: "The Lantern Shrine", strider: "The Strider Stilts",
        moth: "The Silk Loft", cricket: "The Bell Eaves", wraith: "The Ash Hollow", bone_sentinel: "The Marrow Shrine",
        crawler: "The Rib Cage", hound: "The Hound Ossuary", beetle: "The Beetle Crown"
      };
      var team = function (n, pale) { return n.team === 0 ? (pale ? "#a9c6ff" : "#73a6ff") : (pale ? "#ffb0a6" : "#f27366"); };
      m.nodes.forEach(function (n) {
        var r = 0, fill = "none", stroke = "#06090a", width = 0.6, title = n.id.replace(/_/g, " ");
        if (n.type === 1) { r = 3.4; fill = team(n); title = (n.team === 0 ? "The Lodge's" : "The Coven's") + " fountain"; }
        else if (n.type === 2) { r = 2.8; fill = team(n, true); title = (n.team === 0 ? "The Lodge's great oak (nexus)" : "The Coven's cauldron (nexus)"); }
        else if (n.type === 3) { r = 2.0; fill = team(n); }
        else if (n.type === 4) { r = /_nexus/.test(n.id) ? 1.3 : 1.6; fill = team(n); }
        else if (n.type === 6) { r = 2.2; fill = "#74b8c6"; }
        else if (n.type === 7) { r = 4.4; fill = "#3a2150"; stroke = "#b57ff0"; width = 1.2; title = /warden/.test(n.id) ? "The Bridge Warden's Reach" : "The Marrow Kraken's Reach"; }
        else if (n.type === 5) {
          r = 2.0; fill = "#e08a2e";
          var key = n.id.replace(/^camp_(blue|red)_(top|bot)_/, ""); title = CAMPS[key] || title;
          if (n.mouth != null) {
            var h = n.mouth * Math.PI / 180;
            ww.appendChild(el("line", { x1: X(n.x), y1: Y(n.y), x2: X(n.x + Math.sin(h) * 4.2), y2: Y(n.y + Math.cos(h) * 4.2), stroke: "#e08a2e", "stroke-width": 1.1, "stroke-linecap": "round" }));
          }
        }
        if (!r) return;
        var c = el("circle", { cx: X(n.x), cy: Y(n.y), r: r, fill: fill, stroke: stroke, "stroke-width": width });
        c.appendChild(el("title", {}, title));
        ww.appendChild(c);
      });
      var labels = [
        ["blue_fountain", "THE LODGE", 16, -7, "#a9c6ff", 4.2], ["red_fountain", "THE COVEN", -16, 10, "#ffb0a6", 4.2],
        ["lantern_warden_pit", "Bridge Warden", 0, 8.5, "#d7b8ff", 3.2], ["bone_kraken_pit", "Marrow Kraken", 0, -6.5, "#d7b8ff", 3.2],
        ["altar_north", "Altar of Fury", -9, 1, "#9fd2dc", 2.6], ["altar_south", "Altar of Swiftness", 12, 1, "#9fd2dc", 2.6],
        ["top_center", "TOP", 0, -4, "#cbb98e", 3.4], ["mid_center", "MID", 5, -3, "#cbb98e", 3.4], ["bot_center", "BOT", 0, 7, "#cbb98e", 3.4]
      ];
      m.nodes.forEach(function (n) {
        if (n.type !== 5) return;
        var key = n.id.replace(/^camp_(blue|red)_(top|bot)_/, "");
        labels.push([n.id, (CAMPS[key] || key).replace(/^The /, ""), 0, 5.4, "#f0c48a", 2.4]);
      });
      labels.forEach(function (l) {
        var n = byId[l[0]]; if (!n) return;
        ww.appendChild(el("text", { x: X(n.x) + l[2], y: Y(n.y) + l[3], fill: l[4], "font-size": l[5], "text-anchor": "middle", "font-family": "Source Sans 3, sans-serif", "letter-spacing": 0.3, "paint-order": "stroke", stroke: "#06090a", "stroke-width": 0.6 }, l[1]));
      });
      ww.appendChild(el("text", { x: pad + 3, y: S - pad - 3, fill: "#8fa385", "font-size": 3.4, "text-anchor": "start", "font-family": "Source Sans 3, sans-serif" }, "N ↑ is up"));
    });
  }

  // ------------------------------------------------------------ stats & rankings
  var statsPage = document.querySelector("[data-stats]");
  if (statsPage) {
    var TIER_ORDER = { "S+": 0, "S": 1, "A": 2, "B": 3, "C": 4, "D": 5 };
    var ROLE_NAMES = { top: "Top", jungle: "Jungle", mid: "Mid", bot: "Bot", support: "Support" };
    var champs = {}, itemNames = {}, itemArt = {}, stats = null;
    var role = "all", sortKey = "rank", sortDir = 1;
    var ladderRole = "all", ladderAll = false, itemsAll = false;

    function pct(n) { return (+n).toFixed(1) + "%"; }
    function nice(id) { return id.replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
    function champName(id) { return champs[id] ? champs[id].name : nice(id); }
    function face(id, size) {
      var c = champs[id];
      var inner = c && c.portrait
        ? '<img src="' + ROOT + 'assets/img/portraits/' + esc(id) + '.png" alt="" width="' + size + '" height="' + size + '" loading="lazy">'
        : esc(champName(id).charAt(0));
      return '<span class="mini-face" style="--accent:' + esc(c ? c.colour : "#8fa385") + '">' + inner + "</span>";
    }
    function delta(d, unit) {
      if (d == null || Math.abs(d) < (unit === "" ? 1 : 0.05)) return '<span class="trend same">–</span>';
      var up = d > 0;
      return '<span class="trend ' + (up ? "up" : "down") + '">' + (up ? "▲ " : "▼ ") + Math.abs(d).toFixed(unit === "" ? 0 : 1) + unit + "</span>";
    }
    function bar(rate, lo, hi) {
      // The bar runs 30%–70%, where every win rate here lives; the faint band is the 95% range.
      function x(v) { return Math.max(0, Math.min(100, (v - 30) / 40 * 100)); }
      return '<span class="wr"><span class="wr-num">' + pct(rate) + '</span><span class="wr-track" aria-hidden="true">' +
        (lo != null ? '<span class="wr-band" style="left:' + x(lo) + "%;width:" + (x(hi) - x(lo)) + '%"></span>' : "") +
        '<span class="wr-even"></span><span class="wr-dot ' + (rate >= 50 ? "hi" : "lo") + '" style="left:' + x(rate) + '%"></span></span></span>';
    }

    function tierRows() {
      if (role === "all") return stats.champions.map(function (c) { return c; });
      return stats.roles[role].map(function (r) {
        var c = stats.champions.filter(function (o) { return o.id === r.id; })[0] || {};
        return Object.assign({}, r, { kda: c.kda, class: c.class, roles: c.roles });
      });
    }
    function renderTiers() {
      var q = (document.querySelector("[data-tier-search]").value || "").trim().toLowerCase();
      var rows = tierRows().filter(function (r) { return !q || champName(r.id).toLowerCase().indexOf(q) !== -1; });
      rows.sort(function (a, b) {
        var av = sortKey === "tier" ? TIER_ORDER[a.tier] : a[sortKey], bv = sortKey === "tier" ? TIER_ORDER[b.tier] : b[sortKey];
        if (av == null) av = -Infinity; if (bv == null) bv = -Infinity;
        var natural = (sortKey === "rank" || sortKey === "tier") ? 1 : -1;
        return (av < bv ? -1 : av > bv ? 1 : a.rank - b.rank) * natural * sortDir;
      });
      document.querySelector("[data-tier-table] tbody").innerHTML = rows.map(function (r) {
        var sub = role === "all" ? esc(r.class || "") + (r.roles && r.roles.length && !(r.roles.length === 1 && ROLE_NAMES[r.roles[0]] === r.class) ? " · " + r.roles.map(function (x) { return ROLE_NAMES[x] || x; }).join(", ") : "")
                                 : esc(r.class || "") + (r.class === ROLE_NAMES[role] ? "" : " · " + ROLE_NAMES[role]);
        var trend = role === "all" ? delta(r.win_delta, "%") : (r.rank_change ? delta(r.rank_change, "") : delta(r.win_delta, "%"));
        return "<tr><td class=\"rank-num\">" + r.rank + "</td>" +
          '<td><a class="champ-cell" href="' + ROOT + "champions/" + esc(r.id) + '.html">' + face(r.id, 40) +
          "<span><strong>" + esc(champName(r.id)) + "</strong><small>" + sub + "</small></span></a></td>" +
          '<td><span class="tier-badge t-' + esc((r.tier || "").replace("+", "plus")) + '">' + esc(r.tier || "–") + "</span></td>" +
          '<td class="num">' + bar(r.win_rate, r.lo, r.hi) + "</td>" +
          '<td class="num">' + pct(r.pick_rate) + "</td>" +
          '<td class="num">' + r.games + "</td>" +
          '<td class="num wide-only">' + (r.kda != null ? (+r.kda).toFixed(2) : "–") + "</td>" +
          '<td class="num">' + trend + "</td></tr>";
      }).join("") || '<tr><td colspan="8" class="fine">No champions match.</td></tr>';
      document.querySelector("[data-tier-note]").textContent = role === "all"
        ? rows.length + " champions across every role. The band behind each win rate is where the true rate most likely sits; the line is 50%."
        : rows.length + " champions played " + ROLE_NAMES[role].toLowerCase() + ". “Since last” is places moved since the previous update.";
      document.querySelectorAll("[data-sort]").forEach(function (b) {
        var th = b.closest("th");
        th.setAttribute("aria-sort", b.getAttribute("data-sort") === sortKey ? (sortDir === 1 ? "ascending" : "descending") : "none");
      });
    }

    function renderItemsTable() {
      var rows = itemsAll ? stats.items : stats.items.slice(0, 15);
      document.querySelector("[data-item-table] tbody").innerHTML = rows.map(function (i, n) {
        var art = itemArt[i.id]
          ? '<img class="mini-item" src="' + ROOT + 'assets/img/items/' + esc(i.id) + '.png" alt="" width="36" height="36" loading="lazy">'
          : '<span class="mini-item blank" aria-hidden="true">' + esc((itemNames[i.id] || nice(i.id)).charAt(0)) + "</span>";
        return '<tr><td class="rank-num">' + (n + 1) + '</td><td><span class="champ-cell">' + art + "<strong>" + esc(itemNames[i.id] || nice(i.id)) + "</strong></span></td>" +
          '<td class="num">' + bar(i.win_rate, i.lo, i.hi) + '</td><td class="num">' + pct(i.pick_rate) + '</td><td class="num">' + i.games +
          '</td><td class="num">' + delta(i.win_delta, "%") + "</td></tr>";
      }).join("");
      var more = document.querySelector("[data-item-more]");
      more.hidden = stats.items.length <= 15;
      more.textContent = itemsAll ? "Show the top fifteen" : "Show all " + stats.items.length + " items";
    }

    function renderLadder() {
      var R = stats.ranked, tiers = {};
      R.tiers.forEach(function (t) { tiers[t.id] = t; });
      var q = (document.querySelector("[data-ladder-search]").value || "").trim().toLowerCase();
      var rows = R.accounts.filter(function (a) {
        return (ladderRole === "all" || a.role === ladderRole) && (!q || a.name.toLowerCase().indexOf(q) !== -1);
      });
      var shown = ladderAll || q ? rows : rows.slice(0, 25);
      document.querySelector("[data-ladder-table] tbody").innerHTML = shown.map(function (a) {
        var t = tiers[a.tier] || { name: "Unranked", colour: "#73806b" };
        var label = t.apex ? t.name + " #" + a.apex : t.name + (a.division ? " " + a.division : "");
        var rings = a.tier === "unranked" ? "" : "<small>" + a.rings + " Rings</small>";
        var wr = a.games ? a.wins / a.games * 100 : 0;
        var streak = a.streak > 1 ? '<span class="trend up">' + a.streak + " won</span>" : a.streak < -1 ? '<span class="trend down">' + (-a.streak) + " lost</span>" : '<span class="trend same">–</span>';
        return '<tr' + (t.apex ? ' class="apex-row"' : "") + '><td class="rank-num">' + a.rank + (a.climbed ? " " + delta(a.climbed, "") : "") + "</td>" +
          "<td><strong>" + esc(a.name) + "</strong><small class=\"block\">" + esc(ROLE_NAMES[a.role] || a.role) + "</small></td>" +
          '<td><span class="rank-badge" style="--tier:' + esc(t.colour) + '"><span class="rank-gem" aria-hidden="true"></span>' + esc(label) + "</span>" + rings + "</td>" +
          '<td class="num">' + a.rating + "</td>" +
          '<td class="num">' + a.wins + "–" + a.losses + "</td>" +
          '<td class="num">' + pct(wr) + "</td>" +
          '<td class="num wide-only">' + streak + "</td>" +
          "<td>" + (a.main ? '<a class="champ-cell" href="' + ROOT + "champions/" + esc(a.main) + '.html" title="' + esc(champName(a.main)) + '">' + face(a.main, 32) + '<span class="wide-only">' + esc(champName(a.main)) + "</span></a>" : "–") + "</td></tr>";
      }).join("") || '<tr><td colspan="8" class="fine">No players match.</td></tr>';
      document.querySelector("[data-ladder-count]").textContent = "Showing " + shown.length + " of " + rows.length +
        (ladderRole === "all" ? " accounts" : " " + ROLE_NAMES[ladderRole].toLowerCase() + " mains") + ".";
      var more = document.querySelector("[data-ladder-more]");
      more.hidden = !!q || rows.length <= 25;
      more.textContent = ladderAll ? "Show the top 25" : "Show the whole ladder";
    }

    function renderTierBars() {
      var R = stats.ranked, counts = R.counts, max = 0;
      R.tiers.forEach(function (t) { max = Math.max(max, counts[t.id] || 0); });
      var total = R.accounts.length;
      document.querySelector("[data-tier-bars]").innerHTML = R.tiers.map(function (t) {
        var n = counts[t.id] || 0, share = total ? n / total * 100 : 0;
        var tip = t.name + ": " + n + " accounts (" + share.toFixed(1) + "%), from rating " + t.floor + (t.apex ? ", the best " + t.size : "") + ". " + t.flavour;
        return '<li class="tier-bar" style="--tier:' + esc(t.colour) + '" title="' + esc(tip) + '" tabindex="0" aria-label="' + esc(tip) + '">' +
          '<span class="tier-name">' + esc(t.name) + '</span><span class="tier-track"><span class="tier-fill" style="width:' + (max ? n / max * 100 : 0) + '%"></span></span>' +
          '<span class="tier-count">' + n + " <small>" + share.toFixed(0) + "%</small></span></li>";
      }).join("");
      var s = document.querySelector("[data-season]");
      if (R.season && R.season.name) s.textContent = "Ranked · " + R.season.name;
      document.querySelector("[data-tier-chart-caption]").textContent = "Accounts in each tier, lowest first. " + total + " accounts, " +
        R.matches + " ranked matches over " + R.nights + (R.nights === 1 ? " night" : " nights") + ".";
    }

    function renderTiles() {
      var d = new Date(stats.generated);
      var vals = [stats.matches.toLocaleString("en-GB"), Math.floor(stats.minutes) + ":" + String(Math.round(stats.minutes % 1 * 60)).padStart(2, "0"),
                  pct(stats.blue_win_rate), d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })];
      document.querySelectorAll("[data-stat-tiles] dd").forEach(function (dd, n) { dd.textContent = vals[n]; });
    }

    Promise.all([
      fetch(ROOT + "data/stats.json").then(function (r) { return r.json(); }),
      fetch(ROOT + "data/champions.json").then(function (r) { return r.json(); }).catch(function () { return []; }),
      fetch(ROOT + "data/items.json").then(function (r) { return r.json(); }).catch(function () { return []; })
    ]).then(function (res) {
      stats = res[0];
      res[1].forEach(function (c) { champs[c.id] = c; });
      res[2].forEach(function (i) { itemNames[i.id] = i.name; itemArt[i.id] = i.art; });
      renderTiles(); renderTiers(); renderItemsTable(); renderTierBars(); renderLadder();
      // The tables arrive after the browser has jumped to #ladder or #items, so jump again.
      var target = location.hash && document.getElementById(location.hash.slice(1));
      if (target) target.scrollIntoView();
    }).catch(function () {
      document.querySelector("[data-tier-table] tbody").innerHTML = '<tr><td colspan="8" class="fine">The numbers could not be loaded.</td></tr>';
    });

    document.querySelectorAll("[data-role-filter]").forEach(function (b, _, all) {
      b.addEventListener("click", function () {
        role = b.getAttribute("data-role-filter");
        all.forEach(function (o) { o.setAttribute("aria-pressed", o === b ? "true" : "false"); });
        sortKey = "rank"; sortDir = 1;
        if (stats) renderTiers();
      });
    });
    document.querySelectorAll("[data-sort]").forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-sort");
        if (k === sortKey) sortDir = -sortDir; else { sortKey = k; sortDir = 1; }
        if (stats) renderTiers();
      });
    });
    document.querySelector("[data-tier-search]").addEventListener("input", function () { if (stats) renderTiers(); });
    document.querySelectorAll("[data-ladder-role]").forEach(function (b, _, all) {
      b.addEventListener("click", function () {
        ladderRole = b.getAttribute("data-ladder-role");
        all.forEach(function (o) { o.setAttribute("aria-pressed", o === b ? "true" : "false"); });
        if (stats) renderLadder();
      });
    });
    document.querySelector("[data-ladder-search]").addEventListener("input", function () { if (stats) renderLadder(); });
    document.querySelector("[data-ladder-more]").addEventListener("click", function () { ladderAll = !ladderAll; renderLadder(); });
    document.querySelector("[data-item-more]").addEventListener("click", function () { itemsAll = !itemsAll; renderItemsTable(); });
  }
})();
