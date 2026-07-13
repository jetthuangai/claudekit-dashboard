/* ============================================================
   AgentKit Dashboard — app.js (entry point, loaded LAST)

   ARCHITECTURE NOTE: all app files are plain non-module scripts
   sharing the window.CKApp namespace. ES modules are ruled out —
   they fail CORS on file://, and opening index.html directly
   from disk is an acceptance criterion. Keep script order:
   fuse (CDN, sync) → data → scenarios → storage → render →
   search → modal → app.
   ============================================================ */
(function () {
  "use strict";

  var CKApp = (window.CKApp = window.CKApp || {});
  var DATA = window.CK_DATA;

  /* ---------- theme toggle (đen–hồng ⇄ AgentKit) ----------
     Đặt TRƯỚC guard dữ liệu: nút đổi theme chỉ đụng localStorage +
     attribute trên <html>, không phụ thuộc CK_DATA — data lỗi thì
     đổi theme vẫn phải chạy. Snippet inline trong <head> đã áp
     theme trước khi CSS vẽ; ở đây chỉ đồng bộ nút + xử lý click. */
  (function initThemeToggle() {
    var btn = document.getElementById("theme-toggle");
    if (!btn || !CKApp.store) return;

    var THEME_COLOR = { "": "#121212", agentkit: "#050507" };

    function apply(theme) {
      if (theme === "agentkit") {
        document.documentElement.dataset.theme = "agentkit";
      } else {
        delete document.documentElement.dataset.theme;
      }
      btn.setAttribute("aria-pressed", theme === "agentkit" ? "true" : "false");
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = THEME_COLOR[theme] || THEME_COLOR[""];
    }

    apply(CKApp.store.getTheme());

    btn.addEventListener("click", function () {
      var next = CKApp.store.getTheme() === "agentkit" ? "" : "agentkit";
      apply(CKApp.store.setTheme(next));
    });
  })();

  /* Guard: without data the shell keeps its "Đang tải dữ liệu..."
     empty-state — never throw. */
  if (!DATA || !DATA.kits) return;

  /* ---------- shared state ---------- */

  var state = {
    kit: "engineer",
    query: "",
    category: "",     // "" = all (single-select)
    types: {},        // { skill:true, ... } multi-toggle
    favOnly: false
  };

  /* Global id → { item, kit } lookup (used by modal related chips) */
  var byId = {};
  Object.keys(DATA.kits).forEach(function (kitId) {
    DATA.kits[kitId].items.forEach(function (item) {
      byId[item.id] = { item: item, kit: kitId };
    });
  });
  CKApp.getItem = function (id) { return byId[id] || null; };

  /* ---------- clipboard (navigator.clipboard + execCommand fallback
     so copy works on file:// and non-secure http) ---------- */

  function copyText(text, done) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
      document.body.removeChild(ta);
      done(ok);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
    } else {
      fallback();
    }
  }
  CKApp.copyText = copyText;

  /* Button feedback: "✓ Đã chép" / "✓" for ~1.5s */
  function flashCopied(btn, label) {
    if (btn.dataset.flashing) return;
    var original = btn.textContent;
    btn.dataset.flashing = "1";
    btn.textContent = label;
    window.setTimeout(function () {
      btn.textContent = original;
      delete btn.dataset.flashing;
    }, 1500);
  }
  CKApp.flashCopied = flashCopied;

  /* ---------- live DOM sync after store mutations ----------
     Cards are re-built on every filter change, so these only
     patch what is currently on screen. */

  function findCard(id) {
    var cards = document.querySelectorAll("#card-grid .card[data-id]");
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].dataset.id === id) return cards[i];
    }
    return null;
  }

  /* Fav changed (card or modal): star, stats strip, sidebar count */
  CKApp.syncFav = function (id, on) {
    var card = findCard(id);
    if (card) {
      var btn = card.querySelector(".icon-btn.fav");
      if (btn) {
        btn.textContent = on ? "★" : "☆";
        btn.setAttribute("aria-pressed", String(on));
      }
    }
    CKApp.render.stats(state.kit);
    CKApp.render.sidebar(state.kit, state);
    if (state.favOnly) applyFilters();
  };

  /* Note saved/cleared: toggle 📝 indicator on the visible card */
  CKApp.syncNote = function (id) {
    var card = findCard(id);
    if (!card) return;
    var meta = card.querySelector(".card-meta");
    var mark = meta.querySelector(".note-ind");
    var has = !!CKApp.store.getNote(id);
    if (has && !mark) {
      var usageBadge = meta.querySelector(".usage");
      meta.insertBefore(CKApp.render.noteIndicator(), usageBadge || null);
    } else if (!has && mark) {
      meta.removeChild(mark);
    }
  };

  /* Usage bumped (copy success): refresh "Đã dùng N lần" badge */
  CKApp.syncUsage = function (id) {
    var card = findCard(id);
    if (!card) return;
    var meta = card.querySelector(".card-meta");
    var badge = meta.querySelector(".usage");
    var n = CKApp.store.getUsage(id);
    if (n <= 0) return;
    if (!badge) {
      badge = CKApp.render.el("span", "usage");
      meta.appendChild(badge);
    }
    badge.textContent = "Đã dùng " + n + " lần";
  };

  /* ---------- single filter pipeline ---------- */

  function activeTypes() {
    return Object.keys(state.types).filter(function (t) { return state.types[t]; });
  }

  function applyFilters() {
    var kit = DATA.kits[state.kit];

    /* kit items → search → category → type → favorites */
    var items = CKApp.search.query(state.kit, kit.items, state.query);

    if (state.category) {
      items = items.filter(function (it) { return it.category === state.category; });
    }
    var types = activeTypes();
    if (types.length) {
      items = items.filter(function (it) { return state.types[it.type]; });
    }
    if (state.favOnly) {
      items = items.filter(function (it) { return CKApp.store.isFavorite(it.id); });
    }

    /* Browse order: skills → commands → agents (ids sort agents first,
       which buries the /ak: skills casual users came for). Search keeps
       Fuse relevance order untouched. */
    if (!state.query.trim()) {
      var rank = { skill: 0, command: 1, agent: 2 };
      items = items.slice().sort(function (a, b) {
        return rank[a.type] - rank[b.type] || a.name.localeCompare(b.name);
      });
    }

    CKApp.render.grid(items, state.kit);
    document.getElementById("grid-count").textContent =
      "hiển thị " + items.length + " / " + kit.items.length + " mục";
  }

  /* ---------- tabs / kit switching ---------- */

  var GRID_TITLES = {
    engineer: "Tất cả skill & agent",
    marketing: "Tất cả skill, agent & lệnh"
  };

  /* Guide view: static help panel shown by the "Hướng dẫn" tab. It is not a
     kit, so it lives outside the kit render path — just show/hide the DOM. */
  var guideActive = false;

  function setGuideView(on) {
    guideActive = on;
    var stats = document.getElementById("stats");
    var layout = document.querySelector(".layout");
    var guide = document.getElementById("guide-panel");
    if (stats) stats.hidden = on;
    if (layout) layout.hidden = on;
    if (guide) guide.hidden = !on;
  }

  function selectGuide() {
    setGuideView(true);
    var tabs = document.querySelectorAll("#tabs .tab");
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].setAttribute("aria-selected", String(tabs[i].dataset.view === "guide"));
    }
    document.getElementById("panel-main").setAttribute("aria-labelledby", "tab-guide");
  }

  function selectKit(kitId) {
    setGuideView(false);
    state.kit = kitId;
    /* reset filters, keep query (spec) */
    state.category = "";
    state.types = {};
    state.favOnly = false;

    var tabs = document.querySelectorAll("#tabs .tab");
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].setAttribute("aria-selected", String(tabs[i].dataset.kit === kitId));
    }
    var panel = document.getElementById("panel-main");
    panel.setAttribute("aria-labelledby", "tab-" + kitId);

    var title = document.getElementById("grid-title");
    if (title) title.textContent = GRID_TITLES[kitId] || "Tất cả mục";

    CKApp.render.stats(kitId);
    CKApp.render.sidebar(kitId, state);
    CKApp.render.scenarios(kitId);
    applyFilters();
  }

  document.getElementById("tabs").addEventListener("click", function (e) {
    var tab = e.target.closest(".tab");
    if (!tab) return;
    if (tab.dataset.view === "guide") {
      if (!guideActive) selectGuide();
      return;
    }
    /* Re-select the kit if we're leaving the guide, even if it's the same kit. */
    if (tab.dataset.kit && (guideActive || tab.dataset.kit !== state.kit)) {
      selectKit(tab.dataset.kit);
    }
  });

  /* ---------- sidebar filters (event delegation) ---------- */

  document.getElementById("sidebar-filters").addEventListener("click", function (e) {
    var favBtn = e.target.closest('[data-filter="fav"]');
    if (favBtn) {
      state.favOnly = !state.favOnly;
      favBtn.classList.toggle("active", state.favOnly);
      favBtn.setAttribute("aria-pressed", String(state.favOnly));
      applyFilters();
      return;
    }

    var typeChip = e.target.closest("[data-type]");
    if (typeChip) {
      var type = typeChip.dataset.type;
      state.types[type] = !state.types[type];
      typeChip.classList.toggle("active", state.types[type]);
      typeChip.setAttribute("aria-pressed", String(state.types[type]));
      applyFilters();
      return;
    }

    var catBtn = e.target.closest("[data-category]");
    if (catBtn) {
      state.category = catBtn.dataset.category; // "" = all
      var all = catBtn.parentNode.querySelectorAll("[data-category]");
      for (var i = 0; i < all.length; i++) {
        all[i].classList.toggle("active", all[i] === catBtn);
      }
      applyFilters();
    }
  });

  /* ---------- card grid (event delegation) ---------- */

  function itemFromCard(node) {
    var card = node.closest(".card");
    if (!card) return null;
    return byId[card.dataset.id] || null;
  }

  var grid = document.getElementById("card-grid");

  grid.addEventListener("click", function (e) {
    var rec;

    var fav = e.target.closest(".icon-btn.fav");
    if (fav) {
      e.stopPropagation();
      rec = itemFromCard(fav);
      if (!rec) return;
      var on = CKApp.store.toggleFavorite(rec.item.id);
      CKApp.syncFav(rec.item.id, on);
      return;
    }

    var copy = e.target.closest(".icon-btn.copy");
    if (copy) {
      e.stopPropagation();
      rec = itemFromCard(copy);
      if (!rec) return;
      copyText(rec.item.name, function (ok) {
        if (!ok) return;
        flashCopied(copy, "✓");
        CKApp.store.bumpUsage(rec.item.id);
        CKApp.syncUsage(rec.item.id);
      });
      return;
    }

    rec = itemFromCard(e.target);
    if (rec) {
      CKApp.modal.open(rec.item, state.kit, e.target.closest(".card"));
    }
  });

  grid.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var card = e.target.closest(".card");
    if (!card || e.target !== card) return; // buttons handle their own keys
    e.preventDefault();
    var rec = byId[card.dataset.id];
    if (rec) CKApp.modal.open(rec.item, state.kit, card);
  });

  /* ---------- scenario chips → modal (refs are build-validated) ---------- */

  document.getElementById("scenarios").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-open]");
    if (!btn) return;
    var rec = byId[btn.dataset.open];
    if (rec) CKApp.modal.open(rec.item, rec.kit, btn);
  });

  /* ---------- search ---------- */

  var searchInput = document.getElementById("search-input");
  var debounceTimer = null;

  searchInput.addEventListener("input", function () {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(function () {
      state.query = searchInput.value;
      applyFilters();
    }, 120);
  });

  /* Ctrl+K (or Cmd+K) and "/" focus the search box.
     Inert while the modal is open — focusing the search box behind an
     aria-modal dialog would break the focus trap. */
  document.addEventListener("keydown", function (e) {
    if (document.querySelector("#modal-root .overlay.open")) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
      return;
    }
    if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        searchInput.focus();
      }
    }
  });

  /* ---------- footer date from CK_DATA.generatedAt (YYYY-MM-DD → DD/MM/YYYY) ---------- */

  var updated = document.getElementById("footer-updated");
  if (updated && DATA.generatedAt) {
    var parts = String(DATA.generatedAt).split("-");
    if (parts.length === 3) updated.textContent = parts[2] + "/" + parts[1] + "/" + parts[0];
  }

  /* ---------- init ---------- */

  CKApp.render.tabCounts();
  selectKit("engineer");
})();
