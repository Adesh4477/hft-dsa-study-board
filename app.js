"use strict";

(() => {
  const chapters = window.STUDY_CHAPTERS;
  const storageKey = "the-hot-path-study-v1";
  const parts = ["Foundations", "Basic data structures", "Trees & hierarchies", "Advanced topics", "Case studies"];
  const $ = (selector) => document.querySelector(selector);
  const validSavedIds = new Set(chapters.flatMap((c) => [
    ...c.notes.map((_, i) => `n-${c.id}-${i}`),
    ...c.questions.map((_, i) => `q-${c.id}-${i}`),
    `d-${c.id}`
  ]));
  const state = { chapter: 1, view: "notes", query: "", level: "all", savedOnly: false, reviewed: new Set(), saved: new Set() };
  let toastTimer;
  let searchTimer;
  let printOpenStates = [];

  function node(tag, attributes = {}, ...children) {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
    for (const child of children.flat(Infinity)) {
      if (child !== null && child !== undefined) element.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return element;
  }

  function notify(message) {
    const toast = $("#toast");
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 7000);
  }

  function storageWarning(message) {
    const warning = $("#storage-warning");
    warning.textContent = message;
    warning.hidden = false;
  }

  function validateProgress(data) {
    if (!data || typeof data !== "object" || data.version !== 1 || !Array.isArray(data.reviewed) || !Array.isArray(data.saved)) {
      throw new Error("Expected a version 1 Hot Path progress file.");
    }
    if (data.reviewed.length > chapters.length || data.saved.length > validSavedIds.size ||
        !data.reviewed.every((id) => Number.isInteger(id) && chapters.some((c) => c.id === id)) ||
        !data.saved.every((id) => typeof id === "string" && validSavedIds.has(id)) ||
        new Set(data.reviewed).size !== data.reviewed.length || new Set(data.saved).size !== data.saved.length) {
      throw new Error("The progress file contains invalid or duplicate chapter/bookmark IDs.");
    }
    return { reviewed: new Set(data.reviewed), saved: new Set(data.saved) };
  }

  function loadProgress() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw !== null) Object.assign(state, validateProgress(JSON.parse(raw)));
    } catch (error) {
      storageWarning(`Saved progress could not be loaded: ${error.message} Your current session still works; use Export progress for a backup.`);
    }
  }

  function progressData() {
    return { version: 1, reviewed: [...state.reviewed].sort((a, b) => a - b), saved: [...state.saved].sort() };
  }

  function persistProgress() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(progressData()));
    } catch (error) {
      storageWarning(`Progress is only in memory because browser storage failed: ${error.message} Export it before closing this page.`);
    }
    updateProgress();
  }

  function updateProgress() {
    $("#progress-count").textContent = `${state.reviewed.size} / ${chapters.length}`;
    $("#study-progress").value = state.reviewed.size;
    $("#study-progress").textContent = `${state.reviewed.size} of ${chapters.length} chapters reviewed`;
    $("#saved-count").textContent = state.saved.size;
    for (const link of document.querySelectorAll(".chapter-link")) {
      const id = Number(link.dataset.chapter);
      const tick = link.querySelector(".chapter-tick");
      tick.textContent = state.reviewed.has(id) ? "\u2713" : "";
      tick.setAttribute("aria-label", state.reviewed.has(id) ? "Reviewed" : "Not yet reviewed");
    }
    for (const button of document.querySelectorAll("[data-action='review']")) {
      const reviewed = state.reviewed.has(Number(button.dataset.chapter));
      button.setAttribute("aria-pressed", String(reviewed));
      button.textContent = reviewed ? "\u2713 Reviewed" : "Mark reviewed";
    }
  }

  function buildNav() {
    const nav = $("#chapter-nav");
    parts.forEach((part, partIndex) => {
      const group = node("div", { class: "nav-group" }, node("span", { class: "nav-label" }, `${String(partIndex + 1).padStart(2, "0")} / ${part}`));
      chapters.filter((c) => c.part === partIndex + 1).forEach((chapter) => {
        group.append(node("a", { class: "chapter-link", href: `#chapter-${chapter.id}`, "data-chapter": chapter.id },
          node("span", { class: "chapter-number" }, String(chapter.id).padStart(2, "0")),
          node("span", { class: "chapter-title" }, chapter.short),
          node("span", { class: "chapter-tick" })
        ));
      });
      nav.append(group);
    });
  }

  function sourcePath(chapter) {
    return `https://github.com/djiangtw/data-structures-in-practice-public/blob/main/manuscript/chapters/chapter${String(chapter.id).padStart(2, "0")}.md`;
  }

  function saveButton(id, label) {
    const saved = state.saved.has(id);
    return node("button", {
      class: "save-button", type: "button", "data-action": "save", "data-id": id,
      "aria-pressed": saved, "aria-label": `${saved ? "Unsave" : "Save"} ${label}`, title: saved ? "Remove bookmark" : "Save for later"
    }, saved ? "\u2605" : "\u2606");
  }

  function renderNote(chapter, note, index) {
    const id = `n-${chapter.id}-${index}`;
    return node("article", { class: "sticky", "data-item-id": id },
      node("div", { class: "note-top" }, node("span", { class: "note-index" }, `NOTE ${String(index + 1).padStart(2, "0")} / CH.${String(chapter.id).padStart(2, "0")}`), saveButton(id, `note: ${note.title}`)),
      node("h3", {}, note.title), node("p", {}, note.body),
      node("div", { class: "note-callout" }, node("h4", {}, "ON THE TRADING PATH"), node("p", {}, note.hft)),
      node("div", { class: "note-callout warning" }, node("h4", {}, "WATCH THE EDGE CASE"), node("p", {}, note.pitfall)),
      node("a", { class: "source-section", href: sourcePath(chapter), target: "_blank", rel: "noopener noreferrer" }, `Book context: ${note.section}`)
    );
  }

  function renderQuestion(chapter, question, index) {
    const id = `q-${chapter.id}-${index}`;
    return node("article", { class: "question", "data-item-id": id, id },
      node("div", { class: "question-top" },
        node("span", { class: "question-id" }, `CH.${String(chapter.id).padStart(2, "0")} / Q${index + 1}`),
        node("span", { class: `level ${question.level.toLowerCase()}` }, question.level === "Design" ? "System design" : question.level),
        saveButton(id, `question: ${question.prompt}`)
      ),
      node("h3", {}, question.prompt),
      node("details", {}, node("summary", {}, "Reveal answer guide & follow-up"),
        node("div", { class: "answer-content" }, node("h4", {}, "WHAT A STRONG ANSWER COVERS"), node("p", {}, question.answer), node("h4", {}, "EXPECT THIS FOLLOW-UP"), node("p", {}, question.followup))
      )
    );
  }

  function renderDrill(chapter) {
    const drill = chapter.drill;
    return node("article", { class: "drill-card", "data-item-id": `d-${chapter.id}` },
      node("div", { class: "drill-top" }, node("span", { class: "eyebrow" }, "BUILD / MEASURE / EXPLAIN"), saveButton(`d-${chapter.id}`, `drill: ${drill.title}`)),
      node("h3", {}, drill.title),
      node("ol", {}, drill.steps.map((step) => node("li", {}, step))),
      drill.code ? node("pre", {}, node("code", {}, drill.code)) : null,
      node("p", { class: "drill-check" }, node("strong", {}, "Acceptance criteria: "), drill.checks)
    );
  }

  const normalize = (text) => text.toLowerCase().normalize("NFKC");
  function queryMatches(text) {
    const words = normalize(state.query).trim().split(/\s+/).filter(Boolean);
    const haystack = normalize(text);
    return words.every((word) => haystack.includes(word));
  }

  function visibleItems(chapter) {
    const context = `${chapter.title} ${chapter.short} ${chapter.tags.join(" ")} ${chapter.summary} ${chapter.decision} ${parts[chapter.part - 1]}`;
    const items = state.view === "notes" ? chapter.notes : state.view === "questions" ? chapter.questions : [chapter.drill];
    return items.map((item, index) => {
      const id = state.view === "notes" ? `n-${chapter.id}-${index}` : state.view === "questions" ? `q-${chapter.id}-${index}` : `d-${chapter.id}`;
      const text = `${context} ${Object.values(item).flat().join(" ")}`;
      return { item, index, id, match: (!state.savedOnly || state.saved.has(id)) && queryMatches(text) && (state.view !== "questions" || state.level === "all" || item.level === state.level) };
    }).filter((result) => result.match);
  }

  function render() {
    const content = $("#study-content");
    content.replaceChildren();
    content.setAttribute("aria-labelledby", `tab-${state.view}`);
    const globalScope = Boolean(state.query.trim()) || state.chapter === "all";
    const candidates = globalScope ? chapters : chapters.filter((c) => c.id === state.chapter);
    let itemCount = 0;
    let chapterCount = 0;
    candidates.forEach((chapter) => {
      const items = visibleItems(chapter);
      if (!items.length) return;
      itemCount += items.length;
      chapterCount++;
      const section = node("section", { class: "chapter-section", "aria-labelledby": `heading-${chapter.id}` });
      section.append(
        node("div", { class: "chapter-header" },
          node("div", {},
            node("div", { class: "chapter-kicker" }, node("span", { class: "chapter-pill" }, `CH ${String(chapter.id).padStart(2, "0")}`), parts[chapter.part - 1]),
            node("h2", { id: `heading-${chapter.id}` }, chapter.title),
            node("p", { class: "chapter-description" }, chapter.summary)
          ),
          node("div", { class: "chapter-actions" },
            node("a", { class: "source-link", href: sourcePath(chapter), target: "_blank", rel: "noopener noreferrer" }, "Read source \u2197"),
            node("button", { class: "review-button", type: "button", "data-action": "review", "data-chapter": chapter.id, "aria-label": `Toggle reviewed: chapter ${chapter.id}`, "aria-pressed": state.reviewed.has(chapter.id) }, state.reviewed.has(chapter.id) ? "\u2713 Reviewed" : "Mark reviewed")
          )
        ),
        node("div", { class: "decision-strip" }, node("strong", {}, "THE DESIGN DECISION"), chapter.decision)
      );
      const container = node("div", { class: state.view === "notes" ? "notes-grid" : state.view === "questions" ? "question-list" : "drill-list" });
      items.forEach(({ item, index }) => container.append(state.view === "notes" ? renderNote(chapter, item, index) : state.view === "questions" ? renderQuestion(chapter, item, index) : renderDrill(chapter)));
      section.append(container);
      content.append(section);
    });
    const kind = state.view === "notes" ? "note" : state.view === "questions" ? "question" : "drill";
    const scope = state.query.trim() ? "Search spans all 20 chapters." : state.chapter === "all" ? "All chapters." : `Chapter ${String(state.chapter).padStart(2, "0")}.`;
    $("#results-line").textContent = `${itemCount} ${kind}${itemCount === 1 ? "" : "s"} \u00b7 ${chapterCount} chapter${chapterCount === 1 ? "" : "s"} \u00b7 ${scope}${state.savedOnly ? " Bookmarks only." : ""}`;
    $("#shuffle").disabled = itemCount === 0;
    if (!itemCount) {
      content.append(node("div", { class: "empty-state" }, node("h2", {}, "A little breathing room."),
        node("p", {}, state.savedOnly ? "No saved items match this view. Star notes, questions, or drills to keep them here." : "No results match these filters. Try a broader concept or another study view."),
        node("button", { class: "quiet-button", type: "button", "data-action": "reset" }, "Clear filters & show all chapters")
      ));
    }
    for (const link of document.querySelectorAll(".chapter-link")) {
      const active = !state.query.trim() && Number(link.dataset.chapter) === state.chapter;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    $("#all-chapters").classList.toggle("active", state.chapter === "all" && !state.query.trim());
    updateProgress();
  }

  function setView(view) {
    state.view = view;
    for (const tab of document.querySelectorAll("[data-view]")) {
      const active = tab.dataset.view === view;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    $("#difficulty").hidden = view !== "questions";
    $("#shuffle").hidden = view !== "questions";
    render();
  }

  function readHash() {
    const match = /^#chapter-(\d+)$/.exec(location.hash);
    state.chapter = location.hash === "#all" ? "all" : match && chapters.some((c) => c.id === Number(match[1])) ? Number(match[1]) : 1;
  }

  function selectChapter(value) {
    clearTimeout(searchTimer);
    state.chapter = value;
    state.query = "";
    $("#search").value = "";
    history.replaceState(null, "", value === "all" ? "#all" : `#chapter-${value}`);
    render();
    $(".study-controls").scrollIntoView({ block: "start" });
  }

  function exportProgress() {
    const blob = new Blob([JSON.stringify({ ...progressData(), exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = node("a", { href: url, download: "hot-path-progress.json" });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Progress exported. Import this file to restore it in another browser.");
  }

  async function importProgress(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 100000) throw new Error("The selected file is too large for a progress backup.");
      const imported = validateProgress(JSON.parse(await file.text()));
      imported.reviewed.forEach((id) => state.reviewed.add(id));
      imported.saved.forEach((id) => state.saved.add(id));
      persistProgress();
      render();
      notify("Progress imported and merged. Your existing bookmarks were kept.");
    } catch (error) {
      notify(`Import failed: ${error.message} Your progress was not changed.`);
    } finally {
      event.target.value = "";
    }
  }

  $("#chapter-nav").addEventListener("click", (event) => {
    const link = event.target.closest("a[data-chapter]");
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    selectChapter(Number(link.dataset.chapter));
  });
  $("#all-chapters").addEventListener("click", () => selectChapter("all"));
  $("#search").addEventListener("input", (event) => {
    state.query = event.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 120);
  });
  for (const tab of document.querySelectorAll("[data-view]")) {
    tab.addEventListener("click", () => setView(tab.dataset.view));
    tab.addEventListener("keydown", (event) => {
      const tabs = [...document.querySelectorAll("[data-view]")];
      let index = tabs.indexOf(event.currentTarget);
      if (event.key === "ArrowRight") index = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft") index = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") index = 0;
      else if (event.key === "End") index = tabs.length - 1;
      else return;
      event.preventDefault();
      tabs[index].focus();
      setView(tabs[index].dataset.view);
    });
  }
  $("#difficulty").addEventListener("change", (event) => { state.level = event.target.value; render(); });
  $("#saved-only").addEventListener("click", () => {
    state.savedOnly = !state.savedOnly;
    $("#saved-only").setAttribute("aria-pressed", String(state.savedOnly));
    render();
  });
  $("#study-content").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "save") {
      const id = button.dataset.id;
      const saved = !state.saved.has(id);
      if (saved) state.saved.add(id);
      else state.saved.delete(id);
      persistProgress();
      if (state.savedOnly) render();
      else {
        button.setAttribute("aria-pressed", String(saved));
        button.setAttribute("aria-label", button.getAttribute("aria-label").replace(/^(Save|Unsave)/, saved ? "Unsave" : "Save"));
        button.title = saved ? "Remove bookmark" : "Save for later";
        button.textContent = saved ? "\u2605" : "\u2606";
      }
    } else if (button.dataset.action === "review") {
      const id = Number(button.dataset.chapter);
      if (state.reviewed.has(id)) state.reviewed.delete(id);
      else state.reviewed.add(id);
      persistProgress();
    } else if (button.dataset.action === "reset") {
      state.query = "";
      state.level = "all";
      state.savedOnly = false;
      $("#search").value = "";
      $("#difficulty").value = "all";
      $("#saved-only").setAttribute("aria-pressed", "false");
      selectChapter("all");
    }
  });
  $("#shuffle").addEventListener("click", () => {
    const questions = [...document.querySelectorAll(".question")];
    if (!questions.length) return;
    questions.forEach((q) => { q.classList.remove("random-pick"); q.querySelector("details").open = false; });
    const selected = questions[Math.floor(Math.random() * questions.length)];
    selected.classList.add("random-pick");
    const summary = selected.querySelector("summary");
    summary.focus({ preventScroll: true });
    selected.scrollIntoView({ block: "center" });
    notify("Practice this question aloud before revealing the answer.");
  });
  $("#export-progress").addEventListener("click", exportProgress);
  $("#import-progress").addEventListener("change", importProgress);
  $("#print").addEventListener("click", () => window.print());
  window.addEventListener("beforeprint", () => {
    printOpenStates = [...document.querySelectorAll(".question details")].map((detail) => [detail, detail.open]);
    printOpenStates.forEach(([detail]) => { detail.open = true; });
  });
  window.addEventListener("afterprint", () => {
    printOpenStates.forEach(([detail, open]) => { detail.open = open; });
    printOpenStates = [];
  });
  window.addEventListener("hashchange", () => { state.query = ""; $("#search").value = ""; readHash(); render(); });
  document.addEventListener("keydown", (event) => {
    const editing = event.target instanceof Element && (event.target.matches("input,textarea,select") || event.target.isContentEditable);
    if (event.key === "/" && !editing && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      $("#search").focus();
    } else if (event.key === "Escape" && event.target === $("#search")) {
      state.query = "";
      $("#search").value = "";
      render();
      $("#search").blur();
    }
  });

  buildNav();
  loadProgress();
  readHash();
  $("#note-total").textContent = chapters.reduce((sum, chapter) => sum + chapter.notes.length, 0);
  $("#question-total").textContent = chapters.reduce((sum, chapter) => sum + chapter.questions.length, 0);
  render();
})();
