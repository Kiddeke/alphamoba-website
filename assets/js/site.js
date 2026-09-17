// Wychwood — shared page scripts. No build step, no framework.
(function () {
  "use strict";

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
    var portraits = { oryssa: "/assets/img/oryssa.png" };
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
        var face = portraits[c.id]
          ? '<img src="' + portraits[c.id] + '" alt="" loading="lazy">'
          : esc(c.name.charAt(0));
        return '<li><a class="roster-tile" href="/champions/' + c.id + '.html" style="--accent:' + esc(c.colour) + '">' +
          '<div class="face" aria-hidden="true">' + face + '<span class="cls">' + esc(c.class) + '</span></div>' +
          '<div class="who"><strong>' + esc(c.name) + '</strong><span>' + esc(c.title) + '</span></div></a></li>';
      }).join("") || '<li class="roster-empty">No champion answers to that.</li>';
      var count = document.querySelector("[data-roster-count]");
      if (count) count.textContent = shown.length === all.length ? all.length + " champions" : shown.length + " of " + all.length;
    }

    fetch("/data/champions.json").then(function (r) { return r.json(); }).then(function (data) {
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
    var tierNames = { 0: "Starter", 1: "Basic", 2: "Advanced", 3: "Finished" };

    function renderItems() {
      var q = (itemSearch && itemSearch.value.trim().toLowerCase()) || "";
      var shown = allItems.filter(function (i) {
        if (tier !== "all" && String(i.tier) !== tier) return false;
        if (cat !== "all" && i.category !== cat) return false;
        if (!q) return true;
        return (i.name + " " + i.description + " " + i.category).toLowerCase().indexOf(q) !== -1;
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
        var active = i.active ? '<p class="item-active">Active — ' + esc(i.active) + (i.active_cooldown ? " (" + fmt(i.active_cooldown) + "s)" : "") + "</p>" : "";
        return '<li class="item tier-' + i.tier + ' cat-' + esc(i.category) + '">' +
          '<div class="item-head"><h3>' + esc(i.name) + '</h3><span class="cost">' + i.cost + "</span></div>" +
          '<p class="item-cat">' + esc(tierNames[i.tier] || "Tier " + i.tier) + " · " + esc(i.category) + "</p>" +
          (stats ? '<ul class="item-stats">' + stats + "</ul>" : "") +
          active +
          '<p class="item-desc">' + esc(i.description) + "</p>" + build + "</li>";
      }).join("") || '<li class="roster-empty">Nothing on the shelf matches.</li>';
      var count = document.querySelector("[data-item-count]");
      if (count) count.textContent = shown.length === allItems.length ? allItems.length + " items" : shown.length + " of " + allItems.length;
    }

    fetch("/data/items.json").then(function (r) { return r.json(); }).then(function (data) {
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

  // ------------------------------------------------------------ the Hushwood map
  var map = document.querySelector("[data-hushwood]");
  if (map) {
    fetch("/data/map.json").then(function (r) { return r.json(); }).then(function (m) {
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
})();
