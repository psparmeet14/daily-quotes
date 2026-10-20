/* Daily Wisdom — app logic.
 * Data-driven from data/quotes.json. Vanilla JS, zero dependencies.
 * Ported from the Claude Design reference (design-reference/).
 *
 * Today view + live clock, per-quote URLs, archive grid, random, share
 * (copy link), theme toggle, and a like button.
 *
 * Likes: if a Supabase config is present (window.DW_CONFIG in js/config.js),
 * the count is GLOBAL — read from and incremented in Supabase, one like per
 * browser (increment-only). Without a config it falls back to a local,
 * per-browser toggle so the site works with zero backend. See CLAUDE.md.
 */
(function () {
  "use strict";

  var THEME_KEY = "dw-theme";

  // Global-likes backend (optional). The anon key is public by design — it can
  // only read counts and call increment_like, per the RLS in supabase/schema.sql.
  var CFG = window.DW_CONFIG || {};
  var LIKES_API = (CFG.supabaseUrl && CFG.supabaseAnonKey)
    ? CFG.supabaseUrl.replace(/\/+$/, "") + "/rest/v1"
    : null; // null => localStorage-only fallback

  // "Already liked" flags live under a mode-specific key. Global mode must NOT
  // reuse the old local-toggle key ("dw-likes"): likes recorded in local mode
  // never reached the server, and a stale entry would silently block this
  // browser's one global like (lit heart, count 0, clicks ignored).
  var LIKE_KEY = LIKES_API ? "dw-likes-global" : "dw-likes";

  var state = {
    quotes: [],       // chronological (oldest -> newest)
    view: "today",   // 'today' | 'archive'
    tag: null,        // active theme filter in the archive, or null for all
    author: null,     // active author filter (slug), or null for all
    filterBy: "theme", // which filter the archive shows: 'theme' | 'author'
    idx: 0,          // index into state.quotes of the displayed quote
    now: new Date(),
    liked: {},        // id -> true (this browser has liked)
    counts: {},       // id -> global like count (backend mode)
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

  /* ---------- likes backend (Supabase REST) ---------- */

  function likeHeaders() {
    return {
      "apikey": CFG.supabaseAnonKey,
      "Authorization": "Bearer " + CFG.supabaseAnonKey,
      "Content-Type": "application/json"
    };
  }

  // Load all global counts once at boot. Failures are non-fatal (show 0s).
  function fetchCounts() {
    if (!LIKES_API) return Promise.resolve();
    return fetch(LIKES_API + "/likes?select=quote_id,count", { headers: likeHeaders() })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        var map = {};
        (rows || []).forEach(function (row) { map[row.quote_id] = row.count; });
        state.counts = map;
      })
      .catch(function () {});
  }

  // Atomically increment one quote's count; resolves to the new total.
  function sendLike(id) {
    return fetch(LIKES_API + "/rpc/increment_like", {
      method: "POST",
      headers: likeHeaders(),
      body: JSON.stringify({ qid: id })
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json(); // scalar: the new count
    });
  }

  // What the heart count should show for a quote.
  function displayCount(id) {
    if (LIKES_API) return state.counts[id] || 0;
    return state.liked[id] ? 1 : 0; // local fallback
  }

  function schedulePopReset() {
    clearTimeout(popTimer);
    popTimer = setTimeout(function () {
      state.justLiked = false;
      if (els.likeBtn) els.likeBtn.classList.remove("pop");
      if (els.plusOne) els.plusOne.hidden = true;
    }, 750);
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
    // ?author=<slug> and ?tag=<theme> open the archive filtered. The static
    // /t/ pages land on ?tag=.
    var author = params.get("author");
    if (author && personBySlug(author)) {
      state.author = author; state.filterBy = "author"; state.view = "archive"; return;
    }
    var tag = params.get("tag");
    if (tag && allTags().indexOf(tag) >= 0) {
      state.tag = tag; state.filterBy = "theme"; state.view = "archive"; return;
    }
    if (params.get("view") === "archive") { state.view = "archive"; return; }
    if (id) {
      var i = idxById(id);
      if (i >= 0) { state.idx = i; state.view = "today"; }
    }
  }

  function syncUrl(replace) {
    var url;
    if (state.view === "archive") {
      url = baseHref().replace(location.origin, "") +
        (state.author ? "?author=" + encodeURIComponent(state.author)
          : state.tag ? "?tag=" + encodeURIComponent(state.tag) : "?view=archive");
    } else {
      url = baseHref().replace(location.origin, "") + "?date=" + state.quotes[state.idx].id;
    }
    var fn = replace ? "replaceState" : "pushState";
    try { history[fn](null, "", url); } catch (e) {}
    updateDocTitle();
  }

  function updateDocTitle() {
    if (state.view === "archive") {
      var p = state.author ? personBySlug(state.author) : null;
      var label = p ? p.name : state.tag ? cap(state.tag) : "";
      document.title = (label ? label + " — Archive" : "Archive") + " — Daily Wisdom";
    } else {
      var q = state.quotes[state.idx];
      document.title = "“" + q.quote + "” — " + q.author + " · Daily Wisdom";
    }
  }

  /* ---------- tags ---------- */

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // Every theme present in the data, ordered by how many quotes carry it.
  function allTags() {
    var counts = tagCounts();
    return Object.keys(counts).sort(function (a, b) {
      return counts[b] - counts[a] || (a < b ? -1 : 1);
    });
  }

  function tagCounts() {
    var counts = {};
    state.quotes.forEach(function (q) {
      (q.tags || []).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; });
    });
    return counts;
  }

  function quotesForTag(tag) {
    if (!tag) return state.quotes.slice();
    return state.quotes.filter(function (q) {
      return (q.tags || []).indexOf(tag) >= 0;
    });
  }

  function setTag(tag) {
    transitionTo(function () {
      state.view = "archive";
      state.tag = tag || null;
      state.author = null;
      state.filterBy = "theme";
    }, false);
  }

  /* ---------- authors ---------- */

  // Authors come from each quote's `person` field — the plain name, separate
  // from the `author` citation shown on the page. null means no known author.
  // The index is by surname, like the back of a book: the last word of the
  // name, except for the few names where that rule is wrong.
  // Includes names from data/philosophers.json not yet on the site, so the
  // weekly batch never has to touch this file; keep the two in step.
  var SORT_AS = {
    "Marcus Aurelius": "Marcus Aurelius",
    "14th Dalai Lama": "Dalai Lama",
    "Thich Nhat Hanh": "Nhat Hanh",
    "Julian of Norwich": "Julian",
    "Zeno of Citium": "Zeno",
    "Diogenes of Sinope": "Diogenes",
    "Augustine of Hippo": "Augustine",
    "François de La Rochefoucauld": "La Rochefoucauld",
    "José Ortega y Gasset": "Ortega y Gasset",
    "W.E.B. Du Bois": "Du Bois",
    "Al-Ghazali": "Ghazali",
    "Ibn Tufail": "Ibn Tufail",
    "Ibn Rushd": "Ibn Rushd",
    "Sun Tzu": "Sun Tzu",
    "Wang Yangming": "Wang Yangming",
    "Zhu Xi": "Zhu Xi"
  };
  var UNKNOWN = "unknown"; // slug for quotes of unknown origin

  // Accent-free form for sorting and URLs. Letters like ø are not accented
  // forms (no mark to strip), so they are folded by hand: Søren -> soren.
  var FOLD = { "ø": "o", "Ø": "O", "æ": "ae", "Æ": "Ae", "œ": "oe", "ß": "ss", "ł": "l", "Ł": "L", "đ": "d", "þ": "th" };
  function plain(s) {
    return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[øØæÆœßłŁđþ]/g, function (c) { return FOLD[c]; });
  }
  function slugify(name) {
    return plain(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }
  function sortKey(name) {
    if (SORT_AS[name]) return SORT_AS[name];
    var parts = name.split(" ");
    return parts[parts.length - 1];
  }
  function personSlug(q) { return q.person ? slugify(q.person) : UNKNOWN; }

  // Every author in the data with a count, in surname order; unknown last.
  function allPeople() {
    var map = {};
    state.quotes.forEach(function (q) {
      var s = personSlug(q);
      if (!map[s]) map[s] = { slug: s, name: q.person || "Unknown origin", count: 0 };
      map[s].count++;
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) {
      if (a.slug === UNKNOWN || b.slug === UNKNOWN) return a.slug === UNKNOWN ? 1 : -1;
      return plain(sortKey(a.name)).localeCompare(plain(sortKey(b.name))) ||
        plain(a.name).localeCompare(plain(b.name));
    });
  }

  function personBySlug(slug) {
    var people = allPeople();
    for (var i = 0; i < people.length; i++) if (people[i].slug === slug) return people[i];
    return null;
  }

  function setAuthor(slug) {
    transitionTo(function () {
      state.view = "archive";
      state.author = slug || null;
      state.tag = null;
      state.filterBy = "author";
    }, false);
  }

  // Themes or Authors. One filter at a time: switching drops whatever the
  // other mode had selected rather than combining them, which at this archive
  // size would mostly come back empty.
  function setFilterBy(mode) {
    if (mode === state.filterBy) return;
    if (state.tag || state.author) {
      transitionTo(function () {
        state.filterBy = mode; state.tag = null; state.author = null;
      }, false);
    } else {
      state.filterBy = mode;
      renderFilters();
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
    renderByline(q);

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

    // Themes, clickable through to the filtered archive — the main way a
    // reader discovers that filtering exists at all.
    if (els.quoteTags) {
      els.quoteTags.innerHTML = "";
      (q.tags || []).forEach(function (t) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "quote-tag";
        b.textContent = t;
        b.setAttribute("aria-label", "See all " + t + " quotes");
        b.addEventListener("click", function () { setTag(t); });
        els.quoteTags.appendChild(b);
      });
      els.quoteTags.hidden = !(q.tags || []).length;
    }

    els.likeBtn.classList.toggle("liked", liked);
    els.likeCount.textContent = displayCount(q.id);
    els.plusOne.hidden = !state.justLiked;
    els.likeBtn.classList.toggle("pop", state.justLiked);
  }

  // The byline links to everything else by the same author, once there is
  // anything else. Only the name is the link when the citation contains it
  // ("Attributed to Helen Keller"); otherwise the whole citation is.
  function renderByline(q) {
    var el = els.quoteAuthor;
    el.textContent = "— ";
    var p = q.person ? personBySlug(personSlug(q)) : null;
    if (!p || p.count < 2) { el.appendChild(document.createTextNode(q.author)); return; }
    var at = q.author.indexOf(q.person);
    if (at > 0) el.appendChild(document.createTextNode(q.author.slice(0, at)));
    var b = document.createElement("button");
    b.type = "button";
    b.className = "byline-link";
    b.textContent = at >= 0 ? q.person : q.author;
    b.setAttribute("aria-label", "See all " + p.count + " quotes by " + p.name);
    b.addEventListener("click", function () { setAuthor(p.slug); });
    el.appendChild(b);
    if (at >= 0) el.appendChild(document.createTextNode(q.author.slice(at + q.person.length)));
  }

  function renderArchive() {
    var grid = els.archiveGrid;
    grid.innerHTML = "";
    renderFilters();
    if (!state.quotes.length) {
      var empty = document.createElement("p");
      empty.className = "archive-empty";
      empty.textContent = "No quotes yet — check back soon.";
      grid.appendChild(empty);
      return;
    }
    // Newest first, filtered to the active theme or author when one is set.
    var shown = 0;
    for (var i = state.quotes.length - 1; i >= 0; i--) {
      var q = state.quotes[i];
      if (state.tag && (q.tags || []).indexOf(state.tag) < 0) continue;
      if (state.author && personSlug(q) !== state.author) continue;
      grid.appendChild(archiveCard(i));
      shown++;
    }
    if (!shown) {
      var none = document.createElement("p");
      none.className = "archive-empty";
      none.textContent = state.tag ? "No quotes tagged “" + state.tag + "” yet." : "No quotes here yet.";
      grid.appendChild(none);
    }
  }

  // Everything above the grid: the Themes/Authors switch, then whichever
  // filter is selected.
  function renderFilters() {
    var byAuthor = state.filterBy === "author";
    if (els.filterTheme && els.filterAuthor) {
      els.filterTheme.classList.toggle("active", !byAuthor);
      els.filterTheme.setAttribute("aria-pressed", byAuthor ? "false" : "true");
      els.filterAuthor.classList.toggle("active", byAuthor);
      els.filterAuthor.setAttribute("aria-pressed", byAuthor ? "true" : "false");
    }
    if (els.tagBar) els.tagBar.hidden = byAuthor;
    if (els.authorIndex) els.authorIndex.hidden = !byAuthor;
    if (byAuthor) renderAuthorIndex(); else renderTagBar();
  }

  // Filter chips above the grid: one per theme, with counts.
  function renderTagBar() {
    var bar = els.tagBar;
    if (!bar) return;
    bar.innerHTML = "";
    var counts = tagCounts();
    var tags = allTags();
    if (!tags.length) return;

    bar.appendChild(tagChip("All", state.quotes.length, !state.tag, function () { setTag(null); }));
    tags.forEach(function (t) {
      bar.appendChild(tagChip(cap(t), counts[t], state.tag === t, function () { setTag(t); }));
    });
  }

  // The author filter. There are far too many names for chips, and more every
  // month, so it reads like a book index: A–Z by surname under letter
  // headings, with a row of letters to jump by. Choosing a name collapses it
  // to a single pill; the × on the pill brings the index back.
  function renderAuthorIndex() {
    var box = els.authorIndex;
    if (!box) return;
    box.innerHTML = "";

    if (state.author) {
      var p = personBySlug(state.author);
      if (!p) return;
      var current = document.createElement("div");
      current.className = "author-current";
      var pill = tagChip(p.name, p.count, true, function () { setAuthor(null); });
      var x = document.createElement("span");
      x.className = "x";
      x.setAttribute("aria-hidden", "true");
      x.textContent = "×";
      pill.appendChild(x);
      pill.setAttribute("aria-label", "Clear filter: " + p.name);
      current.appendChild(pill);
      box.appendChild(current);
      return;
    }

    var letters = [], byLetter = {};
    allPeople().forEach(function (person) {
      var L = person.slug === UNKNOWN ? "—" : plain(sortKey(person.name)).charAt(0).toUpperCase();
      if (!byLetter[L]) { byLetter[L] = []; letters.push(L); }
      byLetter[L].push(person);
    });

    var jump = document.createElement("div");
    jump.className = "letter-jump";
    jump.setAttribute("aria-label", "Jump to letter");
    letters.forEach(function (L) {
      if (L === "—") return;
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = L;
      b.addEventListener("click", function () {
        var h = document.getElementById("letter-" + L);
        if (h) h.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      jump.appendChild(b);
    });
    box.appendChild(jump);

    var cols = document.createElement("div");
    cols.className = "author-columns";
    letters.forEach(function (L) {
      var group = document.createElement("div");
      group.className = "letter-group";
      var h = document.createElement("h3");
      h.className = "letter";
      h.id = "letter-" + (L === "—" ? "unknown" : L);
      h.textContent = L;
      group.appendChild(h);
      byLetter[L].forEach(function (person) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "author-link";
        b.appendChild(document.createTextNode(person.name));
        var n = document.createElement("span");
        n.className = "n";
        n.textContent = person.count;
        b.appendChild(n);
        b.addEventListener("click", function () { setAuthor(person.slug); });
        group.appendChild(b);
      });
      cols.appendChild(group);
    });
    box.appendChild(cols);
  }

  function tagChip(label, count, active, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "tag-chip" + (active ? " active" : "");
    b.setAttribute("aria-pressed", active ? "true" : "false");
    b.innerHTML = "";
    b.appendChild(document.createTextNode(label));
    var n = document.createElement("span");
    n.className = "n";
    n.textContent = count;
    b.appendChild(n);
    b.addEventListener("click", onClick);
    return b;
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
    likes.querySelector(".n").textContent = displayCount(q.id);
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
    var id = q.id;

    if (LIKES_API) {
      // Global counter: increment-only, one like per browser.
      if (state.liked[id]) return;
      var next = Object.assign({}, state.liked);
      next[id] = true;
      state.liked = next;
      saveLiked(next);
      state.counts[id] = (state.counts[id] || 0) + 1; // optimistic
      state.justLiked = true;
      renderQuote();
      schedulePopReset();

      sendLike(id).then(function (serverCount) {
        if (typeof serverCount === "number") {
          state.counts[id] = serverCount;
          if (state.view === "today" && state.quotes[state.idx] &&
              state.quotes[state.idx].id === id) {
            els.likeCount.textContent = serverCount;
          }
        }
      }).catch(function () {
        // Roll back the optimistic like so the user can retry.
        state.counts[id] = Math.max(0, (state.counts[id] || 1) - 1);
        var reverted = Object.assign({}, state.liked);
        delete reverted[id];
        state.liked = reverted;
        saveLiked(reverted);
        renderQuote();
        showToast("Couldn't save your like — try again");
      });
      return;
    }

    // Fallback: local per-browser toggle (no backend configured).
    var nowLiked = !state.liked[id];
    var local = Object.assign({}, state.liked);
    if (nowLiked) local[id] = true; else delete local[id];
    state.liked = local;
    state.justLiked = nowLiked;
    saveLiked(local);
    renderQuote();
    if (nowLiked) schedulePopReset();
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
    els.quoteTags = document.getElementById("quote-tags");
    els.tagBar = document.getElementById("tag-bar");
    els.filterTheme = document.getElementById("filter-theme");
    els.filterAuthor = document.getElementById("filter-author");
    els.authorIndex = document.getElementById("author-index");
    els.archiveGrid = document.getElementById("archive-grid");
    els.toast = document.getElementById("toast");
    els.sinceLabel = document.getElementById("since-label");
  }

  // Click/tap the quote image to enlarge it in a full-screen overlay.
  function setupLightbox() {
    if (!els.quoteImage) return;

    var overlay = document.createElement("div");
    overlay.className = "lightbox";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Enlarged image");

    var big = document.createElement("img");
    big.alt = "";
    var closeBtn = document.createElement("button");
    closeBtn.className = "lightbox-close";
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close enlarged image");
    closeBtn.textContent = "✕";

    overlay.appendChild(big);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);

    var lastFocus = null;

    function open() {
      var src = els.quoteImage.getAttribute("src");
      if (!src || els.quoteImage.hidden) return;
      big.src = els.quoteImage.currentSrc || src;
      big.alt = els.quoteImage.alt || "";
      lastFocus = document.activeElement;
      overlay.classList.add("open");
      document.body.style.overflow = "hidden";
      closeBtn.focus();
    }
    function close() {
      if (!overlay.classList.contains("open")) return;
      overlay.classList.remove("open");
      document.body.style.overflow = "";
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    // Clicking anywhere in the overlay (scrim, image, or ✕) closes it.
    overlay.addEventListener("click", close);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });

    els.quoteImage.setAttribute("role", "button");
    els.quoteImage.setAttribute("tabindex", "0");
    els.quoteImage.setAttribute("aria-label", "Enlarge image");
    els.quoteImage.addEventListener("click", open);
    els.quoteImage.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });

    els.lightboxClose = close;
  }

  function wire() {
    els.navToday.addEventListener("click", function () {
      transitionTo(function () { state.view = "today"; state.idx = defaultIdx(); }, false);
    });
    els.navArchive.addEventListener("click", function () {
      transitionTo(function () { state.view = "archive"; state.tag = null; state.author = null; }, false);
    });
    els.navRandom.addEventListener("click", navRandom);
    if (els.filterTheme) els.filterTheme.addEventListener("click", function () { setFilterBy("theme"); });
    if (els.filterAuthor) els.filterAuthor.addEventListener("click", function () { setFilterBy("author"); });
    els.themeToggle.addEventListener("click", toggleTheme);
    els.likeBtn.addEventListener("click", toggleLike);
    els.shareBtn.addEventListener("click", share);
    window.addEventListener("popstate", function () {
      var prevView = state.view;
      state.view = "today";
      state.tag = null;
      state.author = null;
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
        setupLightbox();
        setSinceLabel();
        render();
        syncUrl(true);
        startClock();
        // Populate global like counts, then refresh what's on screen.
        fetchCounts().then(function () { if (LIKES_API) render(); });
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
