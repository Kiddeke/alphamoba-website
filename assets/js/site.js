// Wychwood — shared page scripts. No build step, no framework.
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
      }).join("") || '<li class="roster-empty">No champion answers to that.</li>';
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
      }).join("") || '<li class="roster-empty">Nothing on the shelf matches.</li>';
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
})();
