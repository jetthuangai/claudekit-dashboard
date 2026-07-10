/* ============================================================
   ClaudeKit Dashboard — render.js
   Pure DOM builders: card, grid, sidebar, stats, tab counts.
   XSS-safe by construction: createElement + textContent ONLY —
   descriptions come from an external repo, never trust them.
   Plain script (no modules — file:// support), namespace CKApp.
   ============================================================ */
(function () {
  "use strict";

  var CKApp = (window.CKApp = window.CKApp || {});

  var TYPE_LABELS = { skill: "Skill", agent: "Agent", command: "Lệnh" };
  var FALLBACK_ICON = "🔹";

  /* ---------- helpers ---------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function kitData(kitId) {
    return window.CK_DATA.kits[kitId];
  }

  function categoryOf(kitId, catId) {
    var cats = kitData(kitId).categories;
    for (var i = 0; i < cats.length; i++) {
      if (cats[i].id === catId) return cats[i];
    }
    return null;
  }

  function typeLabel(type) {
    return TYPE_LABELS[type] || type;
  }

  function favCountForKit(kitId) {
    var items = kitData(kitId).items;
    var n = 0;
    for (var i = 0; i < items.length; i++) {
      if (CKApp.store.isFavorite(items[i].id)) n++;
    }
    return n;
  }

  /* ---------- tab counts ---------- */

  function tabCounts() {
    var kits = window.CK_DATA.kits;
    Object.keys(kits).forEach(function (kitId) {
      var slot = document.querySelector('[data-count-for="' + kitId + '"]');
      if (!slot) return;
      var s = kits[kitId].stats;
      var parts = [s.skills + " skill", s.agents + " agent"];
      if (s.commands > 0) parts.push(s.commands + " lệnh");
      slot.textContent = parts.join(" · ");
    });
  }

  /* ---------- stats strip ---------- */

  function statBlock(value, label) {
    var block = el("div", "stat");
    block.appendChild(el("b", null, String(value)));
    block.appendChild(el("span", null, label));
    return block;
  }

  function stats(kitId) {
    var mount = document.getElementById("stats");
    var kit = kitData(kitId);
    mount.textContent = "";
    mount.appendChild(statBlock(kit.stats.skills, "Skill"));
    mount.appendChild(statBlock(kit.stats.agents, "Agent"));
    if (kit.stats.commands > 0) {
      mount.appendChild(statBlock(kit.stats.commands, "Lệnh"));
    }
    mount.appendChild(statBlock(kit.categories.length, "Nhóm chức năng"));
    mount.appendChild(statBlock(favCountForKit(kitId), "⭐ Yêu thích"));
    mount.appendChild(el("span", "hint", "Bấm vào thẻ để xem hướng dẫn chi tiết"));
  }

  /* ---------- sidebar filters ---------- */

  function countBadge(n) {
    return el("span", "cnt", String(n));
  }

  function sidebar(kitId, state) {
    var mount = document.getElementById("sidebar-filters");
    var kit = kitData(kitId);
    mount.textContent = "";

    /* Quick filters */
    mount.appendChild(el("p", "f-label", "Bộ lọc nhanh"));
    var favBtn = el("button", "f-item" + (state.favOnly ? " active" : ""), "⭐ Yêu thích ");
    favBtn.type = "button";
    favBtn.dataset.filter = "fav";
    favBtn.setAttribute("aria-pressed", String(!!state.favOnly));
    favBtn.appendChild(countBadge(favCountForKit(kitId)));
    mount.appendChild(favBtn);

    /* Type toggles — hide "Lệnh" when the kit has no commands */
    mount.appendChild(el("p", "f-label", "Loại"));
    var chips = el("div", "type-chips");
    ["skill", "agent", "command"].forEach(function (type) {
      if (type === "command" && kit.stats.commands === 0) return;
      var on = !!(state.types && state.types[type]);
      var chip = el("button", "type-chip" + (on ? " active" : ""), typeLabel(type));
      chip.type = "button";
      chip.dataset.type = type;
      chip.setAttribute("aria-pressed", String(on));
      chips.appendChild(chip);
    });
    mount.appendChild(chips);

    /* Categories (single-select) */
    mount.appendChild(el("p", "f-label", "Nhóm chức năng"));
    var allBtn = el("button", "f-item" + (state.category ? "" : " active"), "Tất cả ");
    allBtn.type = "button";
    allBtn.dataset.category = "";
    allBtn.appendChild(countBadge(kit.items.length));
    mount.appendChild(allBtn);

    kit.categories.forEach(function (cat) {
      var n = 0;
      for (var i = 0; i < kit.items.length; i++) {
        if (kit.items[i].category === cat.id) n++;
      }
      var active = state.category === cat.id;
      var btn = el("button", "f-item" + (active ? " active" : ""), cat.icon + " " + cat.label + " ");
      btn.type = "button";
      btn.dataset.category = cat.id;
      btn.appendChild(countBadge(n));
      mount.appendChild(btn);
    });
  }

  /* ---------- card ---------- */

  function card(item, kitId) {
    var cat = categoryOf(kitId, item.category);

    var root = el("article", "card");
    root.dataset.id = item.id;
    root.tabIndex = 0;
    root.setAttribute("role", "button");
    root.setAttribute("aria-haspopup", "dialog");

    /* top row: icon + actions */
    var top = el("div", "card-top");
    var icon = el("span", "card-icon", cat ? cat.icon : FALLBACK_ICON);
    icon.setAttribute("aria-hidden", "true");
    top.appendChild(icon);

    var actions = el("div", "card-actions");
    var fav = el("button", "icon-btn fav", CKApp.store.isFavorite(item.id) ? "★" : "☆");
    fav.type = "button";
    fav.setAttribute("aria-label", "Yêu thích");
    fav.setAttribute("aria-pressed", String(CKApp.store.isFavorite(item.id)));
    actions.appendChild(fav);

    var copy = el("button", "icon-btn copy", "📋");
    copy.type = "button";
    copy.setAttribute("aria-label", "Chép lệnh");
    actions.appendChild(copy);
    top.appendChild(actions);
    root.appendChild(top);

    /* name (mono), description */
    root.appendChild(el("h3", "card-cmd", item.name));
    root.appendChild(el("p", "card-desc", item.descVi || item.descEn || ""));

    /* meta row */
    var meta = el("div", "card-meta");
    if (cat) meta.appendChild(el("span", "chip chip-cat", cat.icon + " " + cat.label));
    meta.appendChild(el("span", "chip chip-type", typeLabel(item.type)));
    if (CKApp.store.getNote(item.id)) meta.appendChild(noteIndicator());
    var used = CKApp.store.getUsage(item.id);
    if (used > 0) meta.appendChild(el("span", "usage", "Đã dùng " + used + " lần"));
    root.appendChild(meta);

    return root;
  }

  /* Small "has a note" marker shown in the card meta row */
  function noteIndicator() {
    var mark = el("span", "note-ind", "📝");
    mark.setAttribute("role", "img");
    mark.setAttribute("aria-label", "Có ghi chú");
    mark.title = "Có ghi chú";
    return mark;
  }

  /* ---------- grid (single DocumentFragment per render) ---------- */

  function grid(items, kitId) {
    var mount = document.getElementById("card-grid");
    mount.textContent = "";
    if (!items.length) {
      mount.appendChild(el("p", "empty-state",
        "Không tìm thấy mục nào phù hợp. Thử từ khoá khác hoặc xoá bớt bộ lọc."));
      return;
    }
    var frag = document.createDocumentFragment();
    for (var i = 0; i < items.length; i++) {
      frag.appendChild(card(items[i], kitId));
    }
    mount.appendChild(frag);
  }

  /* ---------- scenarios ("Gợi ý theo tình huống") ----------
     Renders the active kit's curated flows from CK_SCENARIOS.
     Chips are BUTTONS (data-open=item id) — app.js delegates
     clicks to CKApp.modal. Refs are build-time validated. */

  function scenarios(kitId) {
    var mount = document.getElementById("scenarios");
    if (!mount) return;
    mount.textContent = "";

    var list = (window.CK_SCENARIOS || []).filter(function (sc) {
      return sc.kit === kitId;
    });
    var section = mount.closest(".scenarios");
    if (section) section.hidden = list.length === 0;
    if (!list.length) return;

    var frag = document.createDocumentFragment();
    list.forEach(function (sc) {
      var card = el("article", "sc-card");
      card.appendChild(el("h3", null, (sc.icon ? sc.icon + " " : "") + sc.question));

      var flow = el("div", "sc-flow");
      (sc.steps || []).forEach(function (step, i) {
        if (i > 0) {
          var arrow = el("span", "sc-arrow", "→");
          arrow.setAttribute("aria-hidden", "true");
          flow.appendChild(arrow);
        }
        var rec = CKApp.getItem ? CKApp.getItem(step.ref) : null;
        var chip = el("button", "sc-step", rec ? rec.item.name : step.ref);
        chip.type = "button";
        chip.dataset.open = step.ref;
        flow.appendChild(chip);
        if (step.note) flow.appendChild(el("span", "sc-note", "(" + step.note + ")"));
      });
      card.appendChild(flow);

      if (sc.tip) card.appendChild(el("p", "sc-tip", "💡 " + sc.tip));
      frag.appendChild(card);
    });
    mount.appendChild(frag);
  }

  CKApp.render = {
    el: el,
    card: card,
    grid: grid,
    sidebar: sidebar,
    stats: stats,
    scenarios: scenarios,
    tabCounts: tabCounts,
    categoryOf: categoryOf,
    typeLabel: typeLabel,
    noteIndicator: noteIndicator
  };
})();
