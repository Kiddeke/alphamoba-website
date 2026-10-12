// AlphaMOBA — the maps page's explorer. Draws each board from data/maps/
// (the game's own map files, walls included), with pan and zoom, layers,
// a match clock and an info panel. No build step, no framework.
(function () {
  "use strict";

  var root = document.querySelector("[data-map-explorer]");
  if (!root) return;

  var ROOT = (function () {
    var me = document.currentScript && document.currentScript.src;
    return me ? me.replace(/assets\/js\/maps\.js.*$/, "") : "../";
  })();
  var NS = "http://www.w3.org/2000/svg";
  var svg = root.querySelector("svg");
  var panel = root.querySelector("[data-mx-panel]");
  var tip = root.querySelector("[data-mx-tip]");
  var clock = root.querySelector("[data-mx-clock]");
  var clockLabel = root.querySelector("[data-mx-time]");
  var playBtn = root.querySelector("[data-mx-play]");
  var layoutBar = root.querySelector("[data-mx-layouts]");
  var layoutNote = root.querySelector("[data-mx-layout-note]");

  var index = null, board = null, boards = {}, selected = null, t = 0;
  var view = { x: 0, y: 0, w: 120 };
  var layers = { lanes: true, river: true, walls: true, brush: true, structures: true, jungle: true, objectives: true, ranges: false, leash: false, labels: true };

  var TEAM = { 0: "#73a6ff", 1: "#f27366" };
  var TEAM_PALE = { 0: "#b9d0ff", 1: "#ffbcb2" };
  var SIDE = { 0: "Blue", 1: "Red" };
  var DISTRICT = { witchwood: ["the Wardens' Lodge", "the Coven"] };

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function el(tag, attrs, text) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function mmss(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
  function num(n, d) { return (+n).toFixed(d || 0).replace(/\.0+$/, ""); }
  function pct(f) { return Math.round(f * 100) + "%"; }
  function title(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function getJSON(path) { return fetch(ROOT + path).then(function (r) { if (!r.ok) throw new Error(path); return r.json(); }); }

  // ------------------------------------------------------------ naming
  function lane(id) { var m = id.match(/_(top|mid|bot)/); return m ? m[1] : ""; }
  function sideName(n) {
    var d = DISTRICT[board.id.replace(/_.*/, "")];
    return d ? title(d[n.team]) : SIDE[n.team];
  }
  function nodeName(n) {
    var camp = n.camp && index.camps[n.camp];
    switch (n.kind) {
      case "fountain": return sideName(n) + " fountain";
      case "nexus": return sideName(n) + " nexus";
      case "inhibitor": return sideName(n) + " " + lane(n.id) + " inhibitor";
      case "tower": return n.tier === "nexus" ? sideName(n) + " nexus tower" : sideName(n) + " " + lane(n.id) + " " + n.tier + " tower";
      case "altar": return index.buffs[n.buff].buff_name;
      case "camp": case "pit": return camp ? camp.name : n.id;
    }
    return n.id.replace(/_/g, " ");
  }

  // ------------------------------------------------------------ numbers at the clock
  function growth(kind) {
    var g = index.jungle_growth, row = g.kinds[kind];
    var minutes = Math.max(0, Math.min(t, g.growth_end) - g.growth_start) / 60;
    return { health: 1 + row.health_per_minute * minutes, damage: 1 + row.damage_per_minute * minutes,
             armor: row.armor_per_minute * minutes, mr: row.magic_resist_per_minute * minutes, bounty: 1 + row.bounty_per_minute * minutes };
  }
  function ironBound(tier) {
    var w = index.watchfire.tiers[tier];
    if (!w.iron_bound) return 0;
    if (t <= w.iron_bound_hold) return w.iron_bound;
    if (t >= w.iron_bound_gone) return 0;
    return w.iron_bound * (1 - (t - w.iron_bound_hold) / (w.iron_bound_gone - w.iron_bound_hold));
  }
  function towerShell() {
    var w = index.watchfire;
    return w.champion_damage + w.champion_damage_per_minute * Math.min(t / 60, w.champion_damage_cap_minute);
  }
  function spawned(n) {
    var c = n.camp && index.camps[n.camp];
    return !c || t >= c.first_spawn;
  }

  // ------------------------------------------------------------ drawing
  function rectPath(cx, cy, across, along, yawDeg) {
    // A wall box in the sim frame: "along" runs at the yaw heading (clockwise
    // from north), "across" is perpendicular. Returned in screen space (y down).
    var a = yawDeg * Math.PI / 180, ax = Math.sin(a), ay = Math.cos(a), bx = ay, by = -ax;
    var hx = across / 2, hy = along / 2, pts = [];
    [[1, 1], [1, -1], [-1, -1], [-1, 1]].forEach(function (s) {
      var x = cx + bx * hx * s[0] + ax * hy * s[1], y = cy + by * hx * s[0] + ay * hy * s[1];
      pts.push(x.toFixed(2) + " " + (-y).toFixed(2));
    });
    return "M" + pts.join("L") + "Z";
  }
  function line(points) { return points.map(function (p, i) { return (i ? "L" : "M") + p[0] + " " + (-p[1]); }).join(""); }

  var g = {};
  function draw() {
    var b = board, half = b.size / 2, isWitch = /^witchwood/.test(b.id);
    svg.innerHTML = "";
    var defs = el("defs", {});
    defs.innerHTML =
      '<pattern id="mx-brush" width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="1.6" height="1.6" fill="#3f8a36"/><path d="M0 0.8H1.6" stroke="#6fbf55" stroke-width="0.35"/></pattern>' +
      '<radialGradient id="mx-pit"><stop offset="0" stop-color="#b57ff0" stop-opacity="0.55"/><stop offset="1" stop-color="#b57ff0" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="mx-blue"><stop offset="0" stop-color="#73a6ff" stop-opacity="0.22"/><stop offset="1" stop-color="#73a6ff" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="mx-red"><stop offset="0" stop-color="#f27366" stop-opacity="0.2"/><stop offset="1" stop-color="#f27366" stop-opacity="0"/></radialGradient>';
    svg.appendChild(defs);
    ["ground", "lanes", "river", "brush", "walls", "ranges", "leash", "edges", "structures", "jungle", "objectives", "labels", "focus"].forEach(function (k) {
      g[k] = el("g", { "data-layer": k });
      svg.appendChild(g[k]);
    });

    // Ground: one tone for each team's half across the river diagonal.
    g.ground.appendChild(el("rect", { x: -half - 4, y: -half - 4, width: b.size + 8, height: b.size + 8, fill: "#070c09" }));
    g.ground.appendChild(el("rect", { x: -half, y: -half, width: b.size, height: b.size, fill: "#101b14", rx: 1.5 }));
    g.ground.appendChild(el("polygon", { points: [-half, half, half, half, -half, -half].join(" "), fill: isWitch ? "#1b2817" : "#12221a" }));
    g.ground.appendChild(el("polygon", { points: [half, -half, half, half, -half, -half].join(" "), fill: isWitch ? "#1d1524" : "#191a1c" }));
    b.nodes.forEach(function (n) {
      if (n.kind === "fountain") g.ground.appendChild(el("circle", { cx: n.x, cy: -n.y, r: b.size * 0.3, fill: "url(#mx-" + (n.team === 0 ? "blue" : "red") + ")" }));
    });

    Object.keys(b.lanes).forEach(function (k) {
      g.lanes.appendChild(el("path", { d: line(b.lanes[k]), fill: "none", stroke: "#8d7a52", "stroke-opacity": 0.32, "stroke-width": b.half_lane * 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
      g.lanes.appendChild(el("path", { d: line(b.lanes[k]), fill: "none", stroke: "#cbb98e", "stroke-opacity": 0.35, "stroke-width": 0.35, "stroke-dasharray": "1.6 1.6" }));
    });

    if (b.river && b.river.spine.length > 1) {
      var water = isWitch ? ["#8fa9a4", "#d4e2de"] : ["#1f5a70", "#4fa3bd"];
      g.river.appendChild(el("path", { d: line(b.river.spine), fill: "none", stroke: water[0], "stroke-opacity": 0.55, "stroke-width": b.river.width + 2.5, "stroke-linejoin": "round", "stroke-linecap": "round" }));
      g.river.appendChild(el("path", { d: line(b.river.spine), fill: "none", stroke: water[1], "stroke-opacity": 0.45, "stroke-width": b.river.width * 0.45, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    }

    var blueWall = "", redWall = "", thinBlue = "", thinRed = "";
    b.walls.forEach(function (w) {
      var d = rectPath(w[0], w[1], w[2], w[3], w[4]), lodge = w[0] + w[1] < 0, thin = w[5] === "thin";
      if (lodge) { if (thin) thinBlue += d; else blueWall += d; } else { if (thin) thinRed += d; else redWall += d; }
    });
    var wallCol = isWitch ? ["#3d5a31", "#4a6d3b", "#3a2945", "#4a3757"] : ["#2f4a37", "#3c5d45", "#3b3236", "#4a3f44"];
    [[blueWall, wallCol[0]], [thinBlue, wallCol[1]], [redWall, wallCol[2]], [thinRed, wallCol[3]]].forEach(function (p) {
      if (p[0]) g.walls.appendChild(el("path", { d: p[0], fill: p[1], stroke: "#06090a", "stroke-width": 0.12, "stroke-opacity": 0.6 }));
    });
    var brush = "";
    b.brush.forEach(function (r) { brush += rectPath(r[0], r[1], r[2], r[3], 0); });
    if (brush) g.brush.appendChild(el("path", { d: brush, fill: "url(#mx-brush)", opacity: 0.9 }));

    b.nodes.forEach(drawNode);
    labels();
    applyLayers();
    applyClock();
  }

  var pins = {};
  function drawNode(n) {
    var x = n.x, y = -n.y, grp, shape, layer, r = 1.6;
    var col = TEAM[n.team] || "#e08a2e";
    pins[n.id] = null;
    if (n.kind === "waypoint") return;
    grp = el("g", { class: "mx-pin", tabindex: 0, role: "button", "aria-label": nodeName(n), "data-id": n.id, transform: "translate(" + x + " " + y + ")" });
    if (n.kind === "fountain") { layer = "structures"; r = 3.4;
      shape = [el("circle", { r: 3.4, fill: "#0b120e", stroke: col, "stroke-width": 0.9 }), el("circle", { r: 1.6, fill: col })];
    } else if (n.kind === "nexus") { layer = "structures"; r = 3;
      shape = [el("polygon", { points: "0,-3 2.6,-1.5 2.6,1.5 0,3 -2.6,1.5 -2.6,-1.5", fill: TEAM_PALE[n.team], stroke: "#06090a", "stroke-width": 0.4 })];
    } else if (n.kind === "inhibitor") { layer = "structures"; r = 2;
      shape = [el("rect", { x: -1.4, y: -1.4, width: 2.8, height: 2.8, transform: "rotate(45)", fill: col, stroke: "#06090a", "stroke-width": 0.35 })];
    } else if (n.kind === "tower") { layer = "structures"; r = 1.6;
      shape = [el("circle", { r: n.tier === "nexus" ? 1.25 : 1.5, fill: col, stroke: "#06090a", "stroke-width": 0.35 }), el("circle", { r: 0.5, fill: "#fff4cc" })];
      g.ranges.appendChild(el("circle", { cx: x, cy: y, r: index.watchfire.attack_range, fill: col, "fill-opacity": 0.05, stroke: col, "stroke-opacity": 0.6, "stroke-width": 0.25, "stroke-dasharray": "0.8 0.6" }));
    } else if (n.kind === "altar") { layer = "objectives"; r = 2.2;
      shape = [el("rect", { x: -1.6, y: -1.6, width: 3.2, height: 3.2, rx: 0.4, transform: "rotate(45)", fill: "#1d3a40", stroke: "#74d0e0", "stroke-width": 0.5 }), el("circle", { r: 0.7, fill: "#bff3fb" })];
    } else if (n.kind === "pit" || (n.camp && index.camps[n.camp] && index.camps[n.camp].epic)) { layer = "objectives"; r = 4.4;
      shape = [el("circle", { r: 7, fill: "url(#mx-pit)" }), el("circle", { r: 3.6, fill: "#2a1640", stroke: "#c79bff", "stroke-width": 0.7 }), el("path", { d: "M-1.6 0.9 Q0 -2.4 1.6 0.9 M-0.9 0.9V2 M0.9 0.9V2", stroke: "#e9d6ff", "stroke-width": 0.45, fill: "none", "stroke-linecap": "round" })];
    } else if (n.kind === "camp") { layer = "jungle"; r = 2;
      var buffCamp = !!n.golem_buff, c = buffCamp ? (n.golem_buff === "emberheart" ? "#ff8fb1" : "#b48cff") : "#e08a2e";
      shape = [el("circle", { r: buffCamp ? 2.1 : 1.7, fill: "#21160b", stroke: c, "stroke-width": 0.6 }), el("circle", { r: buffCamp ? 1 : 0.7, fill: c })];
      if (n.mouth != null) {
        var h = n.mouth * Math.PI / 180;
        shape.push(el("line", { x1: Math.sin(h) * 2.1, y1: -Math.cos(h) * 2.1, x2: Math.sin(h) * 3.6, y2: -Math.cos(h) * 3.6, stroke: c, "stroke-width": 0.55, "stroke-linecap": "round" }));
      }
    }
    if (!shape) return;
    if (n.camp && index.camps[n.camp]) {
      g.leash.appendChild(el("circle", { cx: x, cy: y, r: index.camps[n.camp].leash, fill: "none", stroke: "#e0b07a", "stroke-opacity": 0.5, "stroke-width": 0.2, "stroke-dasharray": "0.6 0.6" }));
    }
    grp.appendChild(el("circle", { r: r + 1.6, fill: "transparent", class: "mx-hit" }));
    shape.forEach(function (s) { grp.appendChild(s); });
    g[layer].appendChild(grp);
    pins[n.id] = grp;
  }

  function labels() {
    var b = board, byId = {};
    b.nodes.forEach(function (n) { byId[n.id] = n; });
    var list = [];
    b.nodes.forEach(function (n) {
      if (n.kind === "fountain") {
        // Toward the middle of the board, so a corner fountain's name stays on it.
        var d = Math.hypot(n.x, n.y) || 1, name = sideName(n).toUpperCase();
        list.push([n, name, -n.x / d * 6 + Math.sign(-n.x) * name.length * 0.9, n.y / d * 6 + 1.2, TEAM_PALE[n.team], 1.1]);
      }
      if (n.kind === "pit" || (n.camp && index.camps[n.camp] && index.camps[n.camp].epic)) list.push([n, index.camps[n.camp].name.replace(/^The /, ""), 0, 6.8, "#e2ccff", 1]);
      if (n.kind === "altar") list.push([n, index.buffs[n.buff].buff_name.replace(/^Altar of /, ""), 0, 4.4, "#a9e6f0", 0.85]);
      if (n.kind === "camp" && n.golem_buff) list.push([n, index.golem_buffs[n.golem_buff].name, 0, 4.4, n.golem_buff === "emberheart" ? "#ffb3c9" : "#cdb5ff", 0.8]);
    });
    Object.keys(b.lanes).forEach(function (k) {
      var pts = b.lanes[k], p = pts[Math.floor(pts.length / 2)];
      list.push([{ x: p[0], y: p[1] }, k.toUpperCase() + " LANE", 0, -4.2, "#d8c79a", 0.85]);
    });
    list.forEach(function (l) {
      g.labels.appendChild(el("text", { x: l[0].x + l[2], y: -l[0].y + l[3], fill: l[4], "data-size": l[5], "text-anchor": "middle", class: "mx-label" }, l[1]));
    });
  }

  function applyLayers() {
    Object.keys(g).forEach(function (k) { if (k in layers) g[k].style.display = layers[k] ? "" : "none"; });
    root.querySelectorAll("[data-mx-layer]").forEach(function (b) { b.setAttribute("aria-pressed", layers[b.getAttribute("data-mx-layer")] ? "true" : "false"); });
  }

  function applyClock() {
    clockLabel.textContent = mmss(t);
    clock.value = t;
    board.nodes.forEach(function (n) {
      var p = pins[n.id];
      if (!p) return;
      p.classList.toggle("mx-asleep", !spawned(n));
    });
    root.querySelectorAll("[data-mx-event]").forEach(function (e) { e.classList.toggle("past", t >= +e.getAttribute("data-mx-event")); });
    renderPanel();
  }

  // ------------------------------------------------------------ the panel
  function statRow(k, v) { return "<div><dt>" + esc(k) + "</dt><dd>" + v + "</dd></div>"; }
  function unitBlock(u, kind, count) {
    var gr = growth(kind);
    return '<div class="mx-unit"><h4>' + esc(u.name) + (count > 1 ? " <small>× " + count + "</small>" : "") + "</h4><dl class=\"mx-stats\">" +
      statRow("Health", num(u.health * gr.health)) + statRow("Damage", num(u.damage * gr.damage)) +
      statRow("Attacks / s", num(u.attack_speed, 2)) + statRow("Range", num(u.range, 1) + " m") +
      statRow("Armour", num(u.armor + gr.armor)) + statRow("Magic resist", num(u.magic_resist + gr.mr)) + "</dl></div>";
  }
  function buffLines(f) {
    return "+" + Math.round((f.damage_mult - 1) * 100) + "% damage, +" + Math.round((f.speed_mult - 1) * 100) + "% move speed for " + num(f.duration) + " s";
  }
  function info(n) {
    var h = "", c = n.camp && index.camps[n.camp], w = index.watchfire;
    var head = '<p class="eyebrow">' + esc(n.kind === "pit" || (c && c.epic) ? "Epic monster" : n.kind === "camp" ? (n.golem_buff ? "Buff camp" : "Jungle camp") : title(n.kind)) + "</p><h3>" + esc(nodeName(n)) + "</h3>";
    if (c) {
      var gr = growth(c.epic ? "epic" : "large");
      if (!spawned(n)) h += '<p class="mx-wait">Not up yet. First spawns at <strong>' + mmss(c.first_spawn) + "</strong>.</p>";
      h += '<dl class="mx-stats">' + statRow("Gold", num(c.gold * gr.bounty)) + statRow("XP", num(c.xp * gr.bounty)) +
        statRow("First spawn", mmss(c.first_spawn)) + statRow("Respawn", mmss(c.respawn)) + statRow("Leash", num(c.leash) + " m") + "</dl>";
      if (c.epic) h += '<p class="mx-buff"><strong>' + esc(index.buffs[c.buff].buff_name) + "</strong> for the killing team: " + buffLines(index.buffs[c.buff]) + ", and " + c.team_gold + " gold each.</p>";
      if (n.golem_buff) { var gb = index.golem_buffs[n.golem_buff]; h += '<p class="mx-buff"><strong>' + esc(gb.name) + "</strong> for the champion who kills it: " + esc(gb.lines.join(", ")) + ".</p>"; }
      if (c.large) h += unitBlock(c.large, c.epic ? "epic" : "large", 1);
      if (c.small) h += unitBlock(c.small, "small", c.small_count);
      if (t > index.jungle_growth.growth_start) h += '<p class="fine">Numbers at ' + mmss(t) + ": monsters grow stronger every minute from " + mmss(index.jungle_growth.growth_start) + " to " + mmss(index.jungle_growth.growth_end) + ".</p>";
    } else if (n.kind === "tower") {
      var tier = w.tiers[n.tier], ib = ironBound(n.tier);
      h += '<dl class="mx-stats">' + statRow("Health", num(tier.health)) + statRow("Armour", num(tier.armor)) +
        statRow("Range", num(w.attack_range) + " m") + statRow("Shot every", num(w.attack_cooldown, 1) + " s") +
        statRow("Hits champions for", num(towerShell())) + statRow("Hits minions for", num(w.minion_damage)) + "</dl>";
      if (tier.iron_bound) h += '<p class="mx-buff"><strong>Iron-bound ' + pct(ib) + "</strong> at " + mmss(t) + ". It blocks " + pct(tier.iron_bound) + " of damage until " + mmss(tier.iron_bound_hold) + ", fading to nothing by " + mmss(tier.iron_bound_gone) + ".</p>";
      h += '<p class="fine">Each shot in a row at the same champion hits ' + pct(w.stoke_per_shell) + " harder, up to " + w.stoke_steps + " times. With no enemy minions nearby it takes " + pct(w.shuttered_cut) + " less damage from champions.</p>";
    } else if (n.kind === "inhibitor") {
      var i = w.inhibitor;
      h += '<dl class="mx-stats">' + statRow("Health", num(i.health)) + statRow("Armour", num(i.armor)) + statRow("Regen", num(i.regen) + " / s") + statRow("Respawn", mmss(i.respawn)) + "</dl>";
      h += '<p class="fine">It doesn\'t shoot. While it\'s down, the other team sends foremen down this lane.</p>';
    } else if (n.kind === "altar") {
      h += '<p class="mx-buff"><strong>' + esc(index.buffs[n.buff].buff_name) + "</strong>: " + buffLines(index.buffs[n.buff]) + ".</p>";
    } else if (n.kind === "nexus") {
      h += "<p>Destroy it to win. It can't be hit until one of this side's inhibitors is down, and then only after both nexus towers fall.</p>";
    } else if (n.kind === "fountain") {
      h += "<p>Where this team spawns, heals and shops.</p>";
    }
    return head + h;
  }
  function laneLength(pts) { var s = 0; for (var i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; }
  function summary() {
    var b = board, count = function (k) { return b.nodes.filter(function (n) { return n.kind === k; }).length; };
    var camps = b.nodes.filter(function (n) { return n.kind === "camp" && !(index.camps[n.camp] || {}).epic; }).length;
    var epics = b.nodes.filter(function (n) { return n.kind === "pit" || (n.camp && (index.camps[n.camp] || {}).epic); });
    var lanes = Object.keys(b.lanes).map(function (k) {
      var len = laneLength(b.lanes[k]);
      return "<li><strong>" + title(k) + "</strong> " + Math.round(len) + " m, about " + Math.round(len / index.minions.minion.move_speed) + " s for a minion to walk</li>";
    }).join("");
    var h = '<p class="eyebrow">' + esc(b.mode) + "</p><h3>" + esc(b.name) + "</h3>" +
      '<dl class="mx-stats">' + statRow("Board", b.size + " × " + b.size + " m") + statRow("Towers", count("tower")) +
      statRow("Jungle camps", camps) + statRow("Epic monsters", epics.length) + statRow("Wall pieces", b.walls.length) + statRow("Brush patches", b.brush.length) + "</dl>" +
      '<ul class="mx-lanes">' + lanes + "</ul>";
    var upcoming = epics.map(function (n) { var c = index.camps[n.camp]; return [c.first_spawn, c.name]; }).filter(function (e) { return e[0] > t; });
    if (upcoming.length) h += '<p class="fine">Next at ' + mmss(t) + ": " + upcoming.map(function (e) { return esc(e[1]) + " in " + mmss(e[0] - t); }).join(", ") + ".</p>";
    h += '<p class="fine">Click a tower, camp or objective to see its numbers.</p>';
    return h;
  }
  function renderPanel() {
    var n = selected && board.nodes.filter(function (o) { return o.id === selected; })[0];
    panel.innerHTML = n ? info(n) + '<p><button class="mx-link" data-mx-clear>← Back to the map overview</button></p>' : summary();
    var clear = panel.querySelector("[data-mx-clear]");
    if (clear) clear.addEventListener("click", function () { select(null); });
  }
  function select(id) {
    selected = id;
    root.querySelectorAll(".mx-pin.selected").forEach(function (p) { p.classList.remove("selected"); });
    g.focus.innerHTML = "";
    if (id && pins[id]) {
      pins[id].classList.add("selected");
      var n = board.nodes.filter(function (o) { return o.id === id; })[0], c = n.camp && index.camps[n.camp];
      var r = n.kind === "tower" ? index.watchfire.attack_range : c ? c.leash : 5;
      g.focus.appendChild(el("circle", { cx: n.x, cy: -n.y, r: r, fill: "#f29e47", "fill-opacity": 0.08, stroke: "#f29e47", "stroke-width": 0.35, "stroke-dasharray": "1 0.7", class: "mx-focus" }));
    }
    renderPanel();
  }

  // ------------------------------------------------------------ pan and zoom
  function setView() {
    var s = board.size, min = s / 9, max = s * 1.08;
    view.w = Math.max(min, Math.min(max, view.w));
    var lim = s / 2;
    view.x = Math.max(-lim, Math.min(lim, view.x));
    view.y = Math.max(-lim, Math.min(lim, view.y));
    svg.setAttribute("viewBox", (view.x - view.w / 2) + " " + (view.y - view.w / 2) + " " + view.w + " " + view.w);
    var k = view.w / board.size;
    g.labels.querySelectorAll("text").forEach(function (tx) { tx.setAttribute("font-size", (3.2 * +tx.getAttribute("data-size") * Math.max(0.45, k)).toFixed(2)); tx.setAttribute("stroke-width", (0.7 * Math.max(0.45, k)).toFixed(2)); });
  }
  function reset() { view = { x: 0, y: 0, w: board.size * 1.04 }; setView(); }
  function toWorld(ev) {
    var r = svg.getBoundingClientRect();
    return { x: view.x - view.w / 2 + (ev.clientX - r.left) / r.width * view.w, y: view.y - view.w / 2 + (ev.clientY - r.top) / r.height * view.w };
  }
  function zoomAt(p, factor) {
    var nw = Math.max(board.size / 9, Math.min(board.size * 1.08, view.w * factor)), k = nw / view.w;
    view.x = p.x - (p.x - view.x) * k; view.y = p.y - (p.y - view.y) * k; view.w = nw; setView();
  }
  svg.addEventListener("wheel", function (ev) { ev.preventDefault(); zoomAt(toWorld(ev), ev.deltaY > 0 ? 1.15 : 1 / 1.15); }, { passive: false });
  var pointers = {}, dragStart = null, moved = false, pinch = null;
  svg.addEventListener("pointerdown", function (ev) {
    pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
    svg.setPointerCapture(ev.pointerId);
    moved = false;
    var ids = Object.keys(pointers);
    if (ids.length === 1) dragStart = { x: ev.clientX, y: ev.clientY, vx: view.x, vy: view.y, target: ev.target };
    if (ids.length === 2) { var a = pointers[ids[0]], b = pointers[ids[1]]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), w: view.w }; }
  });
  svg.addEventListener("pointermove", function (ev) {
    if (!pointers[ev.pointerId]) { hover(ev); return; }
    pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
    var ids = Object.keys(pointers), r = svg.getBoundingClientRect();
    if (ids.length === 2 && pinch) {
      var a = pointers[ids[0]], b = pointers[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y);
      view.w = pinch.w * pinch.d / Math.max(10, d); moved = true; setView(); return;
    }
    if (dragStart) {
      var dx = ev.clientX - dragStart.x, dy = ev.clientY - dragStart.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      if (moved) { view.x = dragStart.vx - dx / r.width * view.w; view.y = dragStart.vy - dy / r.height * view.w; setView(); tip.hidden = true; svg.classList.add("dragging"); }
    }
  });
  function up(ev) {
    var wasDrag = moved, target = dragStart && dragStart.target;
    delete pointers[ev.pointerId];
    if (Object.keys(pointers).length < 2) pinch = null;
    if (!Object.keys(pointers).length) {
      svg.classList.remove("dragging");
      if (!wasDrag && target) {
        var pin = target.closest && target.closest(".mx-pin");
        select(pin ? pin.getAttribute("data-id") : null);
      }
      dragStart = null;
    }
  }
  svg.addEventListener("pointerup", up);
  svg.addEventListener("pointercancel", up);
  svg.addEventListener("pointerleave", function () { tip.hidden = true; });
  svg.addEventListener("keydown", function (ev) {
    var pin = ev.target.closest && ev.target.closest(".mx-pin");
    if (pin && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); select(pin.getAttribute("data-id")); }
  });
  function hover(ev) {
    var pin = ev.target.closest && ev.target.closest(".mx-pin");
    if (!pin) { tip.hidden = true; return; }
    var n = board.nodes.filter(function (o) { return o.id === pin.getAttribute("data-id"); })[0], c = n.camp && index.camps[n.camp];
    var extra = c ? (spawned(n) ? num(c.gold * growth(c.epic ? "epic" : "large").bounty) + " gold · respawns in " + mmss(c.respawn) : "Spawns at " + mmss(c.first_spawn))
      : n.kind === "tower" ? num(index.watchfire.tiers[n.tier].health) + " health" + (ironBound(n.tier) > 0 ? " · iron-bound " + pct(ironBound(n.tier)) : "")
      : n.kind === "altar" ? buffLines(index.buffs[n.buff]) : "";
    tip.innerHTML = "<strong>" + esc(nodeName(n)) + "</strong>" + (extra ? "<span>" + esc(extra) + "</span>" : "");
    var r = root.querySelector(".mx-stage").getBoundingClientRect();
    tip.style.left = Math.min(ev.clientX - r.left + 14, r.width - 220) + "px";
    tip.style.top = (ev.clientY - r.top + 14) + "px";
    tip.hidden = false;
  }
  root.querySelector("[data-mx-zoom-in]").addEventListener("click", function () { zoomAt({ x: view.x, y: view.y }, 1 / 1.4); });
  root.querySelector("[data-mx-zoom-out]").addEventListener("click", function () { zoomAt({ x: view.x, y: view.y }, 1.4); });
  root.querySelector("[data-mx-reset]").addEventListener("click", reset);

  // ------------------------------------------------------------ the clock
  var playing = null;
  clock.addEventListener("input", function () { t = +clock.value; stop(); applyClock(); });
  function stop() { if (playing) { clearInterval(playing); playing = null; playBtn.textContent = "▶ Play"; playBtn.setAttribute("aria-pressed", "false"); } }
  playBtn.addEventListener("click", function () {
    if (playing) { stop(); return; }
    if (t >= +clock.max) t = 0;
    playBtn.textContent = "❚❚ Pause"; playBtn.setAttribute("aria-pressed", "true");
    playing = setInterval(function () { t = Math.min(+clock.max, t + 15); applyClock(); if (t >= +clock.max) stop(); }, 60);
  });
  root.querySelectorAll("[data-mx-event]").forEach(function (e) {
    e.addEventListener("click", function () { stop(); t = +e.getAttribute("data-mx-event"); applyClock(); });
  });

  // ------------------------------------------------------------ boards and layers
  function load(id) {
    var done = function (b) {
      board = b; selected = null; pins = {};
      draw(); reset();
      root.querySelectorAll("[data-mx-board]").forEach(function (btn) {
        var on = btn.getAttribute("data-mx-board") === id.replace(/_.*/, "");
        btn.setAttribute("aria-selected", on ? "true" : "false");
      });
      var witch = /^witchwood/.test(id);
      layoutBar.hidden = !witch;
      root.querySelectorAll("[data-mx-layout]").forEach(function (btn) { btn.setAttribute("aria-pressed", btn.getAttribute("data-mx-layout") === id ? "true" : "false"); });
      var lay = index.layouts.filter(function (l) { return l.board === id; })[0];
      layoutNote.textContent = lay ? lay.blurb : "The standard jungle. Each match picks one of these layouts from its seed.";
    };
    if (boards[id]) done(boards[id]);
    else getJSON("data/maps/" + id + ".json").then(function (b) { boards[id] = b; done(b); }).catch(function () { panel.innerHTML = "<p>This map could not be loaded.</p>"; });
  }
  root.querySelectorAll("[data-mx-board]").forEach(function (btn) {
    btn.addEventListener("click", function () { load(btn.getAttribute("data-mx-board")); });
  });
  root.querySelectorAll("[data-mx-layer]").forEach(function (btn) {
    btn.addEventListener("click", function () { var k = btn.getAttribute("data-mx-layer"); layers[k] = !layers[k]; applyLayers(); });
  });

  document.querySelectorAll("[data-mx-open]").forEach(function (a) {
    a.addEventListener("click", function (ev) {
      ev.preventDefault();
      if (!index) return;
      load(a.getAttribute("data-mx-open"));
      root.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  getJSON("data/maps/index.json").then(function (i) {
    index = i;
    layoutBar.querySelector("[data-mx-layout-list]").innerHTML = '<button class="filter" data-mx-layout="witchwood">Standard</button>' +
      i.layouts.map(function (l) { return '<button class="filter" data-mx-layout="' + esc(l.board) + '">' + esc(l.name) + "</button>"; }).join("");
    layoutBar.querySelectorAll("[data-mx-layout]").forEach(function (btn) {
      btn.addEventListener("click", function () { load(btn.getAttribute("data-mx-layout")); });
    });
    var start = (location.hash.match(/^#map-(\w+)/) || [])[1];
    load(start && /^(hushwood|witchwood|widewood)/.test(start) ? start : "hushwood");
  }).catch(function () { panel.innerHTML = "<p>The maps could not be loaded.</p>"; });
})();
