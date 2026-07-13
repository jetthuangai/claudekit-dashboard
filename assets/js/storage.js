/* ============================================================
   AgentKit Dashboard — storage.js
   Real localStorage persistence (favorites, notes, usage).
   Keys: ckdash:favorites (string[]), ckdash:notes ({id:string}),
   ckdash:usage ({id:number}), ckdash:v = 1 (future migrations).
   Strategy: read once at load into memory, write-through on
   mutation. EVERY localStorage touch is try/catch-guarded —
   private mode / quota / disabled storage must never break the
   app; it silently degrades to in-memory only (single session).
   Single-device only by design (documented limitation).
   Plain script (no modules — file:// support), namespace CKApp.
   ============================================================ */
(function () {
  "use strict";

  var CKApp = (window.CKApp = window.CKApp || {});

  var KEYS = {
    version: "ckdash:v",
    favorites: "ckdash:favorites",
    notes: "ckdash:notes",
    usage: "ckdash:usage",
    theme: "ckdash:theme"
  };

  /* ---------- guarded localStorage access ---------- */

  function safeGet(key) {
    try { return window.localStorage.getItem(key); } catch (err) { return null; }
  }

  function safeSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (err) { /* in-memory only */ }
  }

  function readJSON(key, fallback, validate) {
    var raw = safeGet(key);
    if (raw === null || raw === "") return fallback;
    try {
      var parsed = JSON.parse(raw);
      return validate(parsed) ? parsed : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function isStringArray(v) {
    if (!Array.isArray(v)) return false;
    for (var i = 0; i < v.length; i++) {
      if (typeof v[i] !== "string") return false;
    }
    return true;
  }

  function isPlainObject(v) {
    return !!v && typeof v === "object" && !Array.isArray(v);
  }

  /* ---------- in-memory state (source of truth at runtime) ---------- */

  var favorites = readJSON(KEYS.favorites, [], isStringArray);
  var notes = readJSON(KEYS.notes, {}, isPlainObject);
  var usage = readJSON(KEYS.usage, {}, isPlainObject);

  /* Theme: chuỗi đơn, không phải JSON — chỉ nhận "agentkit", còn lại
     coi như theme mặc định (đen–hồng, "" = không set data-theme). */
  var theme = safeGet(KEYS.theme) === "agentkit" ? "agentkit" : "";

  safeSet(KEYS.version, "1");

  function persist(key, value) {
    safeSet(key, JSON.stringify(value));
  }

  /* ---------- public API (frozen surface from phase 4) ---------- */

  CKApp.store = {
    /* Favorites */
    getFavorites: function () {
      return favorites.slice();
    },
    isFavorite: function (id) {
      return favorites.indexOf(id) !== -1;
    },
    toggleFavorite: function (id) {
      var idx = favorites.indexOf(id);
      var on;
      if (idx === -1) {
        favorites.push(id);
        on = true;
      } else {
        favorites.splice(idx, 1);
        on = false;
      }
      persist(KEYS.favorites, favorites);
      return on;
    },

    /* Personal notes */
    getNote: function (id) {
      return typeof notes[id] === "string" ? notes[id] : "";
    },
    setNote: function (id, text) {
      var value = String(text == null ? "" : text);
      if (value.trim() === "") {
        delete notes[id];
      } else {
        notes[id] = value;
      }
      persist(KEYS.notes, notes);
    },

    /* Usage counter ("Đã dùng N lần") */
    bumpUsage: function (id) {
      usage[id] = (typeof usage[id] === "number" ? usage[id] : 0) + 1;
      persist(KEYS.usage, usage);
    },
    getUsage: function (id) {
      return typeof usage[id] === "number" ? usage[id] : 0;
    },

    /* Theme ("" = đen–hồng mặc định | "agentkit") */
    getTheme: function () {
      return theme;
    },
    setTheme: function (name) {
      theme = name === "agentkit" ? "agentkit" : "";
      safeSet(KEYS.theme, theme);
      return theme;
    }
  };
})();
