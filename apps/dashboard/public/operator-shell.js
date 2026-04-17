// Shared operator-shell behavior: global search + nav highlighting.
// Loaded by every operator page so the studio feels like one surface.
(function () {
  function escHtml(s) {
    return (s == null ? "" : String(s))
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function typeBadge(t) {
    var colorMap = {
      session: "#6c8aff",
      turn: "#5db0ff",
      memory: "#ffb86b",
      proposal: "#f5c17b",
      artifact: "#a78bfa",
      report: "#34d399",
      case: "#34d399",
    };
    var color = colorMap[t] || "#8b90a0";
    return (
      '<span style="font-family:JetBrains Mono,monospace;font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:' +
      color +
      ';border:1px solid ' +
      color +
      '40;padding:2px 6px;border-radius:4px">' +
      escHtml(t) +
      "</span>"
    );
  }

  function init() {
    var input = document.getElementById("globalSearch");
    var box = document.getElementById("globalSearchResults");
    if (!input || !box) return;

    var debounceTimer = null;
    var lastQuery = "";

    async function runSearch(q) {
      if (!q.trim()) {
        box.style.display = "none";
        box.innerHTML = "";
        return;
      }
      try {
        var productSelect = document.getElementById("productSelect");
        var product =
          (productSelect && productSelect.value) ||
          document.body.dataset.product ||
          "";
        var query =
          "/api/search?q=" +
          encodeURIComponent(q) +
          (product ? "&product=" + encodeURIComponent(product) : "");
        var res = await fetch(query);
        var data = await res.json();
        renderResults(data);
      } catch (e) {
        box.innerHTML =
          '<div style="padding:10px;color:#f87171;font-size:12px">Search failed: ' +
          escHtml(e.message || e) +
          "</div>";
        box.style.display = "block";
      }
    }

    function renderResults(data) {
      if (!data.results || !data.results.length) {
        box.innerHTML =
          '<div style="padding:10px;color:#8b90a0;font-size:12px">No matches.</div>';
        box.style.display = "block";
        return;
      }
      var grouped = {};
      data.results.forEach(function (r) {
        if (!grouped[r.type]) grouped[r.type] = [];
        grouped[r.type].push(r);
      });
      var order = ["session", "turn", "memory", "proposal", "artifact", "case", "report"];
      var html = "";
      order.forEach(function (type) {
        var items = grouped[type];
        if (!items || !items.length) return;
        html +=
          '<div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;color:#8b90a0;padding:8px 10px 4px">' +
          escHtml(type) +
          "s · " +
          items.length +
          "</div>";
        items.slice(0, 8).forEach(function (r) {
          html +=
            '<a href="' +
            escHtml(r.href) +
            '" style="display:block;padding:8px 10px;border-radius:6px;color:#e2e4ea;text-decoration:none;font-size:12px;line-height:1.4" onmouseover="this.style.background=\'#222736\'" onmouseout="this.style.background=\'\'">' +
            '<div style="display:flex;gap:8px;align-items:center">' +
            typeBadge(r.type) +
            '<div style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
            escHtml(r.label || r.id) +
            "</div></div>" +
            (r.sublabel
              ? '<div style="font-size:11px;color:#8b90a0;margin-top:2px;margin-left:50px">' +
                escHtml(r.sublabel) +
                "</div>"
              : "") +
            "</a>";
        });
      });
      if (data.truncated) {
        html +=
          '<div style="padding:6px 10px;font-size:11px;color:#8b90a0;border-top:1px solid #2a3040">Showing ' +
          data.results.length +
          " of " +
          data.total +
          " · refine query to see more</div>";
      }
      box.innerHTML = html;
      box.style.display = "block";
    }

    input.addEventListener("input", function () {
      var q = input.value;
      lastQuery = q;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        if (q === lastQuery) runSearch(q);
      }, 220);
    });

    input.addEventListener("focus", function () {
      if (input.value.trim()) runSearch(input.value);
    });

    document.addEventListener("click", function (e) {
      if (e.target === input) return;
      if (box.contains(e.target)) return;
      box.style.display = "none";
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "/" && document.activeElement !== input) {
        var tag = (document.activeElement && document.activeElement.tagName) || "";
        if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
          e.preventDefault();
          input.focus();
        }
      }
      if (e.key === "Escape") {
        box.style.display = "none";
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
