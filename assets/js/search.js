/* ============================================================
   ClaudeKit Dashboard — search.js
   Fuse.js fuzzy search, one index per kit. Queries are ALSO
   diacritic-folded (same NFD strip + đ→d as scripts/build-data)
   so "sua loi" matches "sửa lỗi" via the searchFold field.
   Offline guard: if window.Fuse is missing (CDN unreachable on
   file://), fall back to substring match over searchFold+descVi.
   Plain script (no modules — file:// support), namespace CKApp.
   ============================================================ */
(function () {
  "use strict";

  var CKApp = (window.CKApp = window.CKApp || {});

  /* Same folding as scripts/build-data.mjs produced searchFold with. */
  function fold(str) {
    return String(str || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase();
  }

  var indexes = {}; // kitId → Fuse instance

  function getIndex(kitId, items) {
    if (!window.Fuse) return null;
    if (!indexes[kitId]) {
      indexes[kitId] = new window.Fuse(items, {
        keys: [
          { name: "name", weight: 2 },
          { name: "searchFold", weight: 1.5 },
          { name: "descVi", weight: 1.5 },
          { name: "descEn", weight: 1 },
          { name: "keywords", weight: 1 }
        ],
        threshold: 0.35,
        ignoreLocation: true, // searchFold is long; match anywhere in it
        includeScore: true
      });
    }
    return indexes[kitId];
  }

  /* Returns filtered + ranked items; full list when query is empty. */
  function query(kitId, items, rawQuery) {
    var q = String(rawQuery || "").trim();
    if (!q) return items.slice();

    var folded = fold(q);
    var fuse = getIndex(kitId, items);

    /* Offline fallback: plain substring over folded fields */
    if (!fuse) {
      return items.filter(function (it) {
        return (
          (it.searchFold && it.searchFold.indexOf(folded) !== -1) ||
          fold(it.descVi).indexOf(folded) !== -1 ||
          fold(it.name).indexOf(folded) !== -1
        );
      });
    }

    /* Run raw query (hits descVi/name with diacritics) AND folded
       query (hits searchFold); merge keeping each item's best score. */
    var best = {}; // id → { item, score }
    function take(results) {
      for (var i = 0; i < results.length; i++) {
        var r = results[i];
        var prev = best[r.item.id];
        if (!prev || r.score < prev.score) {
          best[r.item.id] = { item: r.item, score: r.score };
        }
      }
    }
    take(fuse.search(q));
    if (folded !== q.toLowerCase()) take(fuse.search(folded));

    return Object.keys(best)
      .map(function (id) { return best[id]; })
      .sort(function (a, b) { return a.score - b.score; })
      .map(function (entry) { return entry.item; });
  }

  CKApp.search = {
    fold: fold,
    query: query,
    reset: function () { indexes = {}; }
  };
})();
