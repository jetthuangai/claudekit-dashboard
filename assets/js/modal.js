/* ============================================================
   ClaudeKit Dashboard — modal.js
   Detail dialog: builds its skeleton once into #modal-root,
   open(item, kitId, trigger) fills it with textContent only.
   A11y: role=dialog aria-modal, focus trap, Esc/backdrop/✕
   close, focus returns to the trigger element.
   Plain script (no modules — file:// support), namespace CKApp.
   ============================================================ */
(function () {
  "use strict";

  var CKApp = (window.CKApp = window.CKApp || {});
  var el; // CKApp.render.el, resolved at init

  var overlay, panel, refs = {};
  var lastFocus = null;
  var currentItem = null;
  var noteTimer = null;
  var noteHintTimer = null;
  var pendingNoteSave = null; // armed debounce save; flushed on fill/close

  function flushNoteSave() {
    window.clearTimeout(noteTimer);
    noteTimer = null;
    if (pendingNoteSave) {
      pendingNoteSave();
      pendingNoteSave = null;
    }
  }

  function setFavState(on) {
    refs.fav.textContent = on ? "★" : "☆";
    refs.fav.setAttribute("aria-pressed", String(on));
  }

  /* ---------- skeleton (static strings only — no data here) ---------- */

  function build() {
    el = CKApp.render.el;
    var root = document.getElementById("modal-root");

    overlay = el("div", "overlay");
    panel = el("div", "modal");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "modal-title");

    /* head */
    var head = el("div", "m-head");
    refs.icon = el("span", "m-icon");
    refs.icon.setAttribute("aria-hidden", "true");
    refs.title = el("h2", "m-cmd");
    refs.title.id = "modal-title";
    refs.fav = el("button", "icon-btn fav", "☆");
    refs.fav.type = "button";
    refs.fav.setAttribute("aria-label", "Yêu thích");
    refs.fav.setAttribute("aria-pressed", "false");
    refs.close = el("button", "m-close", "✕");
    refs.close.type = "button";
    refs.close.setAttribute("aria-label", "Đóng");
    head.appendChild(refs.icon);
    head.appendChild(refs.title);
    head.appendChild(refs.fav);
    head.appendChild(refs.close);
    panel.appendChild(head);

    refs.chips = el("div", "m-chips");
    panel.appendChild(refs.chips);

    refs.desc = el("p", "m-desc");
    panel.appendChild(refs.desc);

    refs.whenLabel = el("p", "m-sec", "Khi nào dùng");
    refs.when = el("ul", "m-when");
    panel.appendChild(refs.whenLabel);
    panel.appendChild(refs.when);

    refs.exampleLabel = el("p", "m-sec", "Ví dụ gõ lệnh");
    refs.exampleWrap = el("div", "m-example");
    refs.example = el("code");
    refs.copy = el("button", "btn-pink", "📋 Chép lệnh");
    refs.copy.type = "button";
    refs.exampleWrap.appendChild(refs.example);
    refs.exampleWrap.appendChild(refs.copy);
    panel.appendChild(refs.exampleLabel);
    panel.appendChild(refs.exampleWrap);

    var noteLabel = el("p", "m-sec", "Ghi chú của bạn");
    refs.noteSaved = el("span", "m-note-saved", "✓ Đã lưu");
    refs.noteSaved.hidden = true;
    noteLabel.appendChild(refs.noteSaved);
    panel.appendChild(noteLabel);
    refs.note = el("textarea", "m-note");
    refs.note.placeholder = "Viết ghi chú riêng... (sẽ tự lưu trên máy bạn)";
    refs.note.setAttribute("aria-label", "Ghi chú của bạn");
    panel.appendChild(refs.note);

    refs.relatedLabel = el("p", "m-sec", "Skill liên quan");
    refs.related = el("div", "m-related");
    panel.appendChild(refs.relatedLabel);
    panel.appendChild(refs.related);

    overlay.appendChild(panel);
    root.appendChild(overlay);

    /* wiring */
    refs.close.addEventListener("click", close);
    overlay.addEventListener("mousedown", function (e) {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", onKeydown);

    /* Note autosave: debounce 400ms → store + "✓ Đã lưu" hint.
       The armed save is kept in pendingNoteSave so fill()/close() can
       flush it synchronously — otherwise a quick close/reopen within
       400ms would show stale text or overwrite the newer value. */
    refs.note.addEventListener("input", function () {
      if (!currentItem) return;
      var id = currentItem.id;
      var value = refs.note.value;
      window.clearTimeout(noteTimer);
      refs.noteSaved.hidden = true;
      pendingNoteSave = function () {
        CKApp.store.setNote(id, value);
        if (CKApp.syncNote) CKApp.syncNote(id);
      };
      noteTimer = window.setTimeout(function () {
        var save = pendingNoteSave;
        pendingNoteSave = null;
        noteTimer = null;
        if (save) save();
        refs.noteSaved.hidden = false;
        window.clearTimeout(noteHintTimer);
        noteHintTimer = window.setTimeout(function () {
          refs.noteSaved.hidden = true;
        }, 1500);
      }, 400);
    });

    /* Fav toggle in modal — syncs the matching card + stats */
    refs.fav.addEventListener("click", function () {
      if (!currentItem) return;
      var on = CKApp.store.toggleFavorite(currentItem.id);
      setFavState(on);
      if (CKApp.syncFav) CKApp.syncFav(currentItem.id, on);
    });

    refs.copy.addEventListener("click", function () {
      if (!currentItem) return;
      var id = currentItem.id;
      var text = currentItem.example || currentItem.name;
      CKApp.copyText(text, function (ok) {
        if (!ok) return;
        CKApp.flashCopied(refs.copy, "✓ Đã chép");
        CKApp.store.bumpUsage(id);
        if (CKApp.syncUsage) CKApp.syncUsage(id);
      });
    });

    /* related chips → open that item, keep the ORIGINAL trigger */
    refs.related.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-open]");
      if (!btn || !CKApp.getItem) return;
      var rec = CKApp.getItem(btn.dataset.open);
      if (rec) fill(rec.item, rec.kit);
    });
  }

  /* ---------- keyboard: Esc close + Tab focus trap ---------- */

  function onKeydown(e) {
    if (!overlay || !overlay.classList.contains("open")) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "Tab") return;
    var focusables = panel.querySelectorAll(
      'button, textarea, input, select, a[href], [tabindex]:not([tabindex="-1"])'
    );
    var list = [];
    for (var i = 0; i < focusables.length; i++) {
      if (focusables[i].offsetParent !== null) list.push(focusables[i]);
    }
    if (!list.length) return;
    var first = list[0];
    var last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /* ---------- content fill (textContent only) ---------- */

  function chip(className, text) {
    refs.chips.appendChild(el("span", className, text));
  }

  function fill(item, kitId) {
    flushNoteSave(); // commit any pending note of the previous item first
    currentItem = item;
    var cat = CKApp.render.categoryOf(kitId, item.category);

    refs.icon.textContent = cat ? cat.icon : "🔹";
    refs.title.textContent = item.name;

    refs.chips.textContent = "";
    if (cat) chip("chip chip-cat", cat.icon + " " + cat.label);
    chip("chip chip-type", CKApp.render.typeLabel(item.type));
    if (item.userInvocable === false) chip("chip chip-type", "⚙️ Chạy tự động");
    var used = CKApp.store.getUsage(item.id);
    if (used > 0) chip("chip chip-type", "Đã dùng " + used + " lần");

    refs.desc.textContent = item.descVi || item.descEn || "";

    /* "Khi nào dùng" — schema stores one Vietnamese string */
    var hasWhen = !!item.whenToUseVi;
    refs.whenLabel.hidden = !hasWhen;
    refs.when.hidden = !hasWhen;
    refs.when.textContent = "";
    if (hasWhen) refs.when.appendChild(el("li", null, item.whenToUseVi));

    var hasExample = !!item.example;
    refs.exampleLabel.hidden = !hasExample;
    refs.exampleWrap.hidden = !hasExample;
    refs.example.textContent = item.example || "";
    refs.copy.textContent = "📋 Chép lệnh";

    setFavState(CKApp.store.isFavorite(item.id));

    refs.note.value = CKApp.store.getNote(item.id) || "";
    refs.noteSaved.hidden = true;

    refs.related.textContent = "";
    var shown = 0;
    (item.related || []).forEach(function (id) {
      var rec = CKApp.getItem ? CKApp.getItem(id) : null;
      if (!rec) return;
      var btn = el("button", "sc-step", rec.item.name);
      btn.type = "button";
      btn.dataset.open = id;
      refs.related.appendChild(btn);
      shown++;
    });
    refs.relatedLabel.hidden = shown === 0;
    refs.related.hidden = shown === 0;

    panel.scrollTop = 0;
  }

  /* ---------- public API ---------- */

  function open(item, kitId, trigger) {
    if (!overlay) build();
    lastFocus = trigger || document.activeElement;
    fill(item, kitId);
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    refs.close.focus();
  }

  function close() {
    if (!overlay) return;
    flushNoteSave();
    overlay.classList.remove("open");
    document.body.style.overflow = "";
    currentItem = null;
    if (lastFocus && document.contains(lastFocus)) {
      lastFocus.focus();
    } else {
      // trigger card may have been removed by a grid re-render
      // (e.g. unfavorite while the ⭐ filter is active)
      var fallback = document.getElementById("search-input");
      if (fallback) fallback.focus();
    }
    lastFocus = null;
  }

  CKApp.modal = { open: open, close: close };
})();
