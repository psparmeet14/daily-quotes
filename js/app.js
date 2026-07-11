/* Daily Wisdom — app logic.
 * Data-driven from data/quotes.json. Vanilla JS, zero dependencies.
 * Ported from the Claude Design reference (design-reference/).
 *
 * Phase 1 scope: today view + live clock, per-quote URLs, archive grid,
 * random, share (copy link), theme toggle, and a LOCAL like button.
 * NOTE: likes are localStorage-only for now — the global Supabase-backed
 * counter is Phase 3. See CLAUDE.md.
 */
(function () {
  "use strict";

  var LIKE_KEY = "dw-likes";
  var THEME_KEY = "dw-theme";

  var state = {
    quotes: [],       // chronological (oldest -> newest)
    view: "today",   // 'today' | 'archive'
    idx: 0,           // index into state.quotes of the displayed quote
    now: new Date(),
    liked: {},        // id -> true
    justLiked: false
  };

  var els = {};
  var clockTimer = null;
  var fadeTimer = null;
  var toastTimer = null;
  var popTimer = null;

  /* ---------- helpers ---------- */

  function loadLiked() {
    try { return JSON.parse(localStorage.getItem(LIKE_KEY) || "{}"); }
    catch (e) { return {}; }
  }
  function saveLiked(v) {
    try { localStorage.setItem(LIKE_KEY, JSON.stringify(v)); } catch (e) {}
  }

  function prefersDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function isDark() {
    var saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark") return true;
    if (saved === "light") return false;
    return prefersDark();
  }
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", isDark() ? "dark" : "light");
    if (els.themeToggle) els.themeToggle.textContent = isDark() ? "☀" : "☾"; // ☀ / ☾
  }

  // Parse "YYYY-MM-DD" as a LOCAL date (avoids UTC off-by-one from new Date(str)).
  function parseDate(id) {
    var p = String(id).split("-");
    return new Date(+p[0], (+p[1]) - 1, +p[2]);
  }
  function fmtDate(id, opts) {
    return parseDate(id).toLocaleDateString("en-US", opts || {
      weekday: "long", month: "long", day: "numeric", year: "numeric"
    });
  }
  function fmtTime(d) {
    return d.toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", second: "2-digit"
    }).toLowerCase();
  }

  function quoteNum(i) { return i + 1; } // chronological streak number
  function isLatest(i) { return i === state.quotes.length - 1; }

  function todayId() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  // The "today" quote: exact match on today's date, else the most recent.
  function defaultIdx() {
    var t = todayId();
    for (var i = state.quotes.length - 1; i >= 0; i--) {
      if (state.quotes[i].id === t) return i;
    }
    return state.quotes.length - 1;
  }

  function idxById(id) {
    for (var i = 0; i < state.quotes.length; i++) {
      if (state.quotes[i].id === id) return i;
    }
    return -1;
  }

  // Directory that index.html / archive.html live in (site root on Pages).
  function baseHref() {
    return location.origin + location.pathname.replace(/[^/]*$/, "");
  }
  // Canonical shareable link = the pre-rendered OG page (unfurls richly).
  function shareUrl(id) {
    return baseHref() + "q/" + id + ".html";
  }

  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.classList.remove("show"); }, 2200);
  }

  /* ---------- URL <-> state ---------- */

  function readUrl() {
    var params = new URLSearchParams(location.search);
    var id = params.get("date") || (location.hash ? location.hash.slice(1) : "");
    if (params.get("view") === "archive") { state.view = "archive"; return; }
    if (id) {
      var i = idxById(id);
      if (i >= 0) { state.idx = i; state.view = "today"; }
    }
  }

  function syncUrl(replace) {
    var url;
    if (state.view === "archive") {
      url = baseHref().replace(location.origin, "") + "?view=archive";
    } else {
      url = baseHref().replace(location.origin, "") + "?date=" + state.quotes[state.idx].id;
    }
    var fn = replace ? "replaceState" : "pushState";
    try { history[fn](null, "", url); } catch (e) {}
    updateDocTitle();
  }

  function updateDocTitle() {
    if (state.view === "archive") {
      document.title = "Archive — Daily Wisdom";
    } else {
      var q = state.quotes[state.idx];
      document.title = "“" + q.quote + "” — " + q.author + " · Daily Wisdom";
    }
  }

  /* ---------- rendering ---------- */

  function render() {
    var isToday = state.view === "today";
    els.quoteView.hidden = !isToday;
    els.archiveView.hidden = isToday;
    els.navToday.classList.toggle("active", isToday);
    els.navArchive.classList.toggle("active", !isToday);
    if (isToday) renderQuote(); else renderArchive();
  }

  function renderQuote() {
    var q = state.quotes[state.idx];
    var i = state.idx;
    var num = quoteNum(i);
    var liked = !!state.liked[q.id];

    els.dateLabel.textContent = fmtDate(q.id);
    // Live clock only on the latest quote's day.
    if (isLatest(i)) {
      els.clock.hidden = false;
      els.time.textContent = fmtTime(state.now);
    } else {
      els.clock.hidden = true;
    }

    els.quoteNum.textContent = "Quote №" + num;
    els.quoteText.textContent = "“" + q.quote + "”";
    els.quoteAuthor.textContent = "— " + q.author;

    if (q.description) {
      els.quoteDesc.textContent = q.description;
      els.quoteDesc.hidden = false;
    } else {
      els.quoteDesc.hidden = true;
    }

    if (q.image) {
      els.quoteImage.src = q.image;
      els.quoteImage.alt = q.author;
      els.quoteImage.hidden = false;
    } else {
      els.quoteImage.hidden = true;
      els.quoteImage.removeAttribute("src");
    }

    els.likeBtn.classList.toggle("liked", liked);
    els.likeCount.textContent = liked ? 1 : 0;
    els.plusOne.hidden = !state.justLiked;
    els.likeBtn.classList.toggle("pop", state.justLiked);
  }

  function renderArchive() {
    var grid = els.archiveGrid;
    grid.innerHTML = "";
    if (!state.quotes.length) {
      var empty = document.createElement("p");
      empty.className = "archive-empty";
      empty.textContent = "No quotes yet — check back soon.";
      grid.appendChild(empty);
      return;
    }
    // Newest first.
    for (var i = state.quotes.length - 1; i >= 0; i--) {
      grid.appendChild(archiveCard(i));
    }
  }

  function archiveCard(i) {
    var q = state.quotes[i];
    var liked = !!state.liked[q.id];
    var card = document.createElement("button");
    card.className = "archive-card";
    card.type = "button";

    var row = document.createElement("div");
    row.className = "row";
    var date = document.createElement("span");
    date.className = "date";
    date.textContent = fmtDate(q.id, { month: "short", day: "numeric", year: "numeric" });
    var num = document.createElement("span");
    num.className = "num";
    num.textContent = "№" + quoteNum(i);
    row.appendChild(date); row.appendChild(num);

    var preview = document.createElement("div");
    preview.className = "preview";
    preview.textContent = "“" + q.quote + "”";

    var foot = document.createElement("div");
    foot.className = "foot";
    var author = document.createElement("span");
    author.className = "author";
    author.textContent = q.author;
    var likes = document.createElement("span");
    likes.className = "likes" + (liked ? " liked" : "");
    likes.innerHTML = "♥ <span class=\"n\"></span>";
    likes.querySelector(".n").textContent = liked ? 1 : 0;
    foot.appendChild(author); foot.appendChild(likes);

    card.appendChild(row); card.appendChild(preview); card.appendChild(foot);
    card.addEventListener("click", function () {
      transitionTo(function () { state.view = "today"; state.idx = i; }, false);
    });
    return card;
  }

  /* ---------- transitions & actions ---------- */

  function transitionTo(mutate, replaceUrl) {
    els.main.classList.add("fade");
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(function () {
      mutate();
      state.justLiked = false;
      render();
      syncUrl(replaceUrl);
      els.main.classList.remove("fade");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 300);
  }

  function navRandom() {
    if (state.quotes.length <= 1) {
      transitionTo(function () { state.view = "today"; state.idx = 0; }, false);
      return;
    }
    var r = state.idx;
    while (r === state.idx) r = Math.floor(Math.random() * state.quotes.length);
    transitionTo(function () { state.view = "today"; state.idx = r; }, false);
  }

  function toggleLike() {
    var q = state.quotes[state.idx];
    var nowLiked = !state.liked[q.id];
    var next = Object.assign({}, state.liked);
    if (nowLiked) next[q.id] = true; else delete next[q.id];
    state.liked = next;
    state.justLiked = nowLiked;
    saveLiked(next);
    renderQuote();
    clearTimeout(popTimer);
    if (nowLiked) {
      popTimer = setTimeout(function () {
        state.justLiked = false;
        els.likeBtn.classList.remove("pop");
        els.plusOne.hidden = true;
      }, 750);
    }
  }

  function share() {
    var q = state.quotes[state.idx];
    var url = shareUrl(q.id);
    var done = function () { showToast("Link to Quote №" + quoteNum(state.idx) + " copied"); };
    if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
      navigator.share({ title: "Daily Wisdom", text: "“" + q.quote + "” — " + q.author, url: url })
        .catch(function () {});
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, done);
    } else {
      window.prompt("Copy this link:", url);
    }
  }

  function toggleTheme() {
    var nextDark = !isDark();
    try { localStorage.setItem(THEME_KEY, nextDark ? "dark" : "light"); } catch (e) {}
    applyTheme();
  }

  /* ---------- boot ---------- */

  function cacheEls() {
    els.main = document.getElementById("main");
    els.quoteView = document.getElementById("quote-view");
    els.archiveView = document.getElementById("archive-view");
    els.navToday = document.getElementById("nav-today");
    els.navArchive = document.getElementById("nav-archive");
    els.navRandom = document.getElementById("nav-random");
    els.themeToggle = document.getElementById("theme-toggle");
    els.dateLabel = document.getElementById("date-label");
    els.clock = document.getElementById("clock");
    els.time = document.getElementById("time");
    els.quoteNum = document.getElementById("quote-num");
    els.quoteText = document.getElementById("quote-text");
    els.quoteAuthor = document.getElementById("quote-author");
    els.quoteDesc = document.getElementById("quote-desc");
    els.quoteImage = document.getElementById("quote-image");
    els.likeBtn = document.getElementById("like-btn");
    els.likeCount = document.getElementById("like-count");
    els.plusOne = document.getElementById("plus-one");
    els.shareBtn = document.getElementById("share-btn");
    els.archiveGrid = document.getElementById("archive-grid");
    els.toast = document.getElementById("toast");
    els.sinceLabel = document.getElementById("since-label");
  }

  function wire() {
    els.navToday.addEventListener("click", function () {
      transitionTo(function () { state.view = "today"; state.idx = defaultIdx(); }, false);
    });
    els.navArchive.addEventListener("click", function () {
      transitionTo(function () { state.view = "archive"; }, false);
    });
    els.navRandom.addEventListener("click", navRandom);
    els.themeToggle.addEventListener("click", toggleTheme);
    els.likeBtn.addEventListener("click", toggleLike);
    els.shareBtn.addEventListener("click", share);
    window.addEventListener("popstate", function () {
      var prevView = state.view;
      state.view = "today";
      readUrl();
      render();
      if (state.view !== prevView) updateDocTitle();
    });
  }

  function startClock() {
    clockTimer = setInterval(function () {
      state.now = new Date();
      if (state.view === "today" && isLatest(state.idx)) {
        els.time.textContent = fmtTime(state.now);
      }
    }, 1000);
  }

  function setSinceLabel() {
    if (!els.sinceLabel || !state.quotes.length) return;
    els.sinceLabel.textContent = fmtDate(state.quotes[0].id, { month: "long", year: "numeric" });
  }

  function boot() {
    cacheEls();
    applyTheme();
    state.liked = loadLiked();

    // archive.html sets this to open in archive mode by default.
    if (document.body.getAttribute("data-default-view") === "archive") {
      state.view = "archive";
    }

    fetch("data/quotes.json", { cache: "no-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        state.quotes = (Array.isArray(data) ? data : [])
          .slice()
          .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
        if (state.view !== "archive") state.idx = defaultIdx();
        readUrl();
        wire();
        setSinceLabel();
        render();
        syncUrl(true);
        startClock();
      })
      .catch(function (err) {
        var t = document.getElementById("quote-text");
        if (t) t.textContent = "Could not load quotes.";
        // eslint-disable-next-line no-console
        console.error("Daily Wisdom: failed to load quotes.json", err);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
