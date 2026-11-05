/* Chrome side panel UI. Runtime settings are deliberately separate from presets. */
(function (root) {
  "use strict";
  const Core = root.ClassFlowCore;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const symbols = {
    logo: '<path d="M5 5h6v6H5zM14 5h5v6h-5zM5 14h6v5H5z"/><path d="m14 17 2 2 4-5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>', back: '<path d="m14 6-6 6 6 6"/>',
    edit: '<path d="m15 5 4 4M4 20l5-1L20 8a3 3 0 0 0-4-4L5 15z"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>', check: '<path d="m5 12 4 4L19 6"/>',
    capture: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4m8-4v4M8 12h8m-8 4h5"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
    book: '<path d="M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v14"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbols[name] || symbols.book}</svg>`;
  const labelOf = (preset, key) => (preset.fields[key] || []).map(option => option.label).join(", ");
  function mount(container, options) {
    let state = { presets: [], cache: {}, connected: false, connection: "Connecting to attendance…", job: null };
    let draft = null;
    let lastSignature = "";
    let error = "";
    let notice = "";
    let errorSection = "header";
    let noticeSection = "library";
    let removed = null;
    let filter = "";
    let busy = false;
    let disconnected = false;
    let lastView = "";
    let visibleFeedback = new Map();
    let dateEntry = null;
    let dateWrites = Promise.resolve();
    let draggedPreset = null;
    let successTimer = null;
    let removalTimer = null;
    let categoryFormOpen = false;
    let categoryName = "";
    let editingCategory = null;
    let pendingCategoryDelete = null;
    container.className = "cf-app";
    const isRunning = () => state.job?.status === "running";
    const context = () => state.snapshot || { ...(state.context || { origin: "https://jained.jgianveshana.com", account: "current-lecturer" }), ...draft?.scope };
    function fieldOptions(field) {
      // Editing uses the explicitly captured/remembered class context, not the
      // independent settings chosen for the next Apply.
      const reference = context();
      const key = Core.cacheKey(reference, field.key, draft, Core.runtimeFromSnapshot(reference));
      const cached = state.cache[key];
      const live = state.snapshot;
      const sameContext = live && Core.cacheKey(live, field.key) === key && !live.busy;
      const hasLiveOptions = sameContext && live.fields[field.key].options.length > 0;
      const data = hasLiveOptions ? live.fields[field.key].options : cached?.options || [];
      return { options: data, source: hasLiveOptions ? "live" : cached ? "remembered" : "none", observedAt: cached?.observedAt };
    }
    function header() {
      return `<header class="cf-header"><div class="cf-brand"><span class="cf-brand-icon">${icon("logo")}</span><span>Jain ERP Assist</span><span class="cf-version">v${esc(chrome.runtime.getManifest().version)}</span></div>${connection()}</header>`;
    }
    function connection() {
      return `<div class="cf-connection ${state.connected ? "is-connected" : ""}" title="${esc(state.connection)}" aria-label="${esc(state.connection)}"><span class="cf-dot"></span>${state.connected ? '<span>Ready</span>' : '<button data-action="open-page" class="cf-text-button">Open page</button>'}</div>`;
    }
    function runtimeControls() {
      const settings = state.settings || Core.runtimeFromSnapshot(state.snapshot);
      const disabled = busy || isRunning() || !state.connected ? "disabled" : "";
      const [year, month, day] = (settings.previousDate || `${state.previousYear || new Date().getFullYear()}--`).split("-");
      if (!dateEntry) dateEntry = { dayMonth: day ? `${day}/${month || ''}` : '', year };
      return `<section class="cf-runtime" aria-label="Settings for this attendance"><div class="cf-runtime-title"><h2>Attendance settings</h2><button type="button" class="cf-open-attendance" data-action="open-page" title="Open attendance in this tab (Ctrl-click for a new tab)" ${busy || isRunning() ? "disabled" : ""}>Open attendance ${icon("arrow")}</button></div>
        <div class="cf-form-field"><label>Date</label><div class="cf-segment" role="group" aria-label="Date mode">${["current", "previous"].map(mode => `<button type="button" data-action="date-mode" data-value="${mode}" aria-pressed="${settings.dateMode === mode}" class="${settings.dateMode === mode ? "is-selected" : ""}" ${disabled}>${mode === "current" ? "Current Date" : "Previous Date"}</button>`).join("")}</div>
        ${settings.dateMode === "previous" ? `<div class="cf-date-parts" role="group" aria-label="Previous attendance date">
          <div class="cf-date-part"><label for="cf-date-daymonth">Day / Month</label><div class="cf-date-control"><input id="cf-date-daymonth" aria-label="Day / Month" type="text" inputmode="numeric" autocomplete="off" placeholder="DD/MM" maxlength="5" value="${esc(dateEntry.dayMonth)}" ${disabled}><button type="button" class="cf-date-reset" data-action="reset-date" aria-label="Reset day and month" ${disabled}>Reset</button></div></div>
          <label>Year<input id="cf-date-year" aria-label="Year" type="text" inputmode="numeric" autocomplete="off" maxlength="4" pattern="[1-9][0-9]{3}" value="${esc(dateEntry.year)}" ${disabled}></label>
        </div><small id="cf-date-hint" class="cf-date-hint" aria-live="polite"></small>` : ''}</div>
        <div class="cf-form-field"><label>Class type</label><div class="cf-segment" role="group" aria-label="Class type">${["theory", "lab"].map(type => `<button type="button" data-action="class-type" data-value="${type}" aria-pressed="${settings.classType === type}" class="${settings.classType === type ? "is-selected" : ""}" ${disabled}>${type === "lab" ? "Lab" : "Theory"}</button>`).join("")}</div></div>
        </section>`;
    }
    function progress(section) {
      const job = state.job;
      if (!job || (job.kind === "attendance" ? "attendance" : "library") !== section || (error && errorSection === section) || (job.status === "done" && Date.now() >= job.updatedAt + 2000)) return "";
      const running = job.status === "running";
      return `<section class="cf-progress cf-progress-${esc(job.status)}" role="status" aria-live="polite">
        <div class="cf-progress-top"><strong>${running ? '<span class="cf-spinner"></span>' : icon(job.status === "done" ? "check" : "clock")}${esc(running ? job.preset.name : job.status === "done" ? (job.kind === "attendance" ? "Attendance applied" : "Filters applied") : job.status === "error" ? "Needs your attention" : "Run stopped")}</strong>
          ${running ? '<button class="cf-text-button" data-action="stop">Stop</button>' : ''}</div>
        ${job.status !== "done" ? `<p>${esc(job.message)}</p>` : ''}${running ? `<div class="cf-meter" role="progressbar" aria-label="Applying selections" aria-valuemin="0" aria-valuemax="${job.total || 11}" aria-valuenow="${job.progress || 0}"><i style="width:${Math.max(4, (job.progress || 0) / (job.total || 11) * 100)}%"></i></div><small>${job.kind === "attendance" ? "Review and Save on the website when finished" : "Checking each selection on the live page"}</small>` : ''}
        ${job.status === "error" && job.kind !== "attendance" && !job.websiteMessage ? ["dateMode", "classType", "date"].includes(job.field)
          ? `<button class="cf-text-button" data-action="review-settings">Review attendance settings ${icon("arrow")}</button>`
          : `<button class="cf-text-button" data-action="edit" data-id="${esc(job.preset.id)}">Review this preset ${icon("arrow")}</button>` : ''}</section>`;
    }
    function banners(section) {
      return `${error && errorSection === section ? `<div class="cf-banner cf-error" role="alert">${esc(error)}</div>` : ''}${notice && noticeSection === section ? `<div class="cf-banner cf-notice" role="status">${esc(notice)} ${removed ? '<button class="cf-text-button" data-action="undo">Undo</button>' : ''}</div>` : ''}`;
    }
    function feedback(section) {
      const content = banners(section) + progress(section);
      return content ? `<div class="cf-section-feedback" data-feedback-for="${section}">${content}</div>` : "";
    }
    function card(preset) {
      return `<div class="cf-preset" data-class-type="${esc(preset.classTypeOverride || 'dynamic')}" data-preset-id="${esc(preset.id)}" draggable="${!busy && !isRunning()}"><button class="cf-preset-apply" aria-label="${esc(preset.name)}" aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" data-action="apply" data-id="${esc(preset.id)}" title="Drag to reorder; Alt+Up/Down to move. Apply ${esc(preset.name)}${preset.classTypeOverride ? ` · Always ${preset.classTypeOverride === "lab" ? "Lab" : "Theory"}` : ''}" ${!state.connected || busy || isRunning() ? "disabled" : ""}><span class="cf-preset-name">${esc(preset.name)}</span>${preset.classTypeOverride ? `<span class="cf-type-badge" aria-hidden="true">${preset.classTypeOverride === "lab" ? "Lab" : "Theory"}</span>` : ''}</button><button class="cf-icon-button cf-preset-edit" data-action="edit" data-id="${esc(preset.id)}" aria-label="Edit ${esc(preset.name)}" ${busy || isRunning() ? "disabled" : ""}>${icon("edit")}</button></div>`;
    }
    const categoryKey = preset => preset?.category ? `category:${Core.normalize(preset.category)}` : "uncategorized";
    function classGroups(presets) {
      if (!(state.categories || []).length && !state.presets.some(preset => preset.category)) return presets.map(card).join("");
      const groups = new Map();
      for (const name of state.categories || []) {
        if (!filter.trim() || Core.normalize(name).includes(Core.normalize(filter))) groups.set(`category:${Core.normalize(name)}`, { key: `category:${Core.normalize(name)}`, name, presets: [] });
      }
      for (const preset of presets) {
        const key = categoryKey(preset);
        if (!groups.has(key)) groups.set(key, { key, name: preset.category || "Uncategorized", presets: [] });
        groups.get(key).presets.push(preset);
      }
      const ordered = [...groups.values()].filter(group => group.key !== "uncategorized");
      if (groups.has("uncategorized")) ordered.push(groups.get("uncategorized"));
      return ordered.map((group, index) => {
        const collapsed = !filter.trim() && (state.collapsedCategories || []).includes(group.key);
        return `<section class="cf-category" data-category-key="${esc(group.key)}"><div class="cf-category-heading"><h3><button type="button" class="cf-category-toggle" data-action="toggle-category" data-category="${esc(group.key)}" aria-expanded="${!collapsed}" aria-controls="cf-category-${index}" ${busy || isRunning() || filter.trim() ? "disabled" : ""}><span class="cf-category-chevron">${icon("chevron")}</span><span class="cf-category-name">${esc(group.name)}</span><span class="cf-category-count">${group.presets.length}</span></button></h3>${group.key !== "uncategorized" ? `<button type="button" class="cf-category-action" data-action="rename-category" data-name="${esc(group.name)}" aria-label="Rename category ${esc(group.name)}" title="Rename category" ${busy || isRunning() ? "disabled" : ""}>${icon("edit")}</button><button type="button" class="cf-category-action" data-action="ask-delete-category" data-name="${esc(group.name)}" data-category="${esc(group.key)}" aria-label="Delete category ${esc(group.name)}" title="Delete category" ${busy || isRunning() ? "disabled" : ""}>${icon("trash")}</button>` : ''}</div>${pendingCategoryDelete === group.key ? `<div class="cf-category-confirm" role="group" aria-label="Delete ${esc(group.name)}"><span>Classes move to Uncategorized.</span><button type="button" class="cf-text-button cf-category-confirm-delete" data-action="delete-category" data-name="${esc(group.name)}">Delete</button><button type="button" class="cf-text-button" data-action="cancel-delete-category">Cancel</button></div>` : ''}<div id="cf-category-${index}" class="cf-category-items" ${collapsed ? "hidden" : ""}>${group.presets.length ? group.presets.map(card).join("") : '<p class="cf-category-empty">No classes yet.</p>'}</div></section>`;
      }).join("") || '<div class="cf-no-results">No classes match your search.</div>';
    }
    function library() {
      const presets = state.presets.filter(preset => Core.normalize(`${preset.name} ${preset.category || ""} ${labelOf(preset, "course")} ${labelOf(preset, "section")}`).includes(Core.normalize(filter)));
      return `<div class="cf-library">
        <div class="cf-section-title"><h2>Saved classes <span>${state.presets.length.toString().padStart(2, "0")}</span></h2><button class="cf-text-button" data-action="new" ${isRunning() ? "disabled" : ""}>${icon("plus")} New preset</button></div>
        ${!draft ? categoryCreator() : ''}
        ${state.presets.length > 6 ?  `<label class="cf-search">${icon("search")}<input id="cf-search" placeholder="Find a class…" value="${esc(filter)}" aria-label="Find a saved class"></label>` : ''}
        <div class="cf-card-list">${(presets.length || (state.categories || []).length) ? classGroups(presets) : state.presets.length ? '<div class="cf-no-results">No classes match your search.</div>' : `<div class="cf-empty"><h3>No saved classes</h3><p>Select your class on the website, then use Save this class.</p></div>`}</div>
        <div class="cf-preset-tools" aria-label="Preset backups"><button type="button" class="cf-text-button cf-new-category" data-action="new-category" aria-label="New category" ${busy || isRunning() ? "disabled" : ""}>+ Category</button><button type="button" class="cf-text-button" data-action="export-presets" aria-label="Export presets" title="Download a preset backup" ${busy || isRunning() || (!state.presets.length && !(state.categories || []).length) ? "disabled" : ""}>Export</button><span aria-hidden="true">&middot;</span><button type="button" class="cf-text-button" data-action="import-presets" aria-label="Import presets" title="Import presets without replacing existing classes" ${busy || isRunning() ? "disabled" : ""}>Import</button><input type="file" id="cf-import-file" accept=".json,application/json" hidden></div>
      </div>`;
    }
    function attendanceControls() {
      const copy=state.attendanceCopy;
      const disabled=busy || isRunning() || !state.connected ? "disabled" : "";
      return `<section class="cf-attendance" aria-label="Attendance copying"><div class="cf-section-title"><h2>Attendance</h2>${copy ? `<button class="cf-text-button" data-action="clear-attendance" aria-label="Clear copied attendance" ${busy || isRunning() ? "disabled" : ""}>Clear</button>` : ''}</div>
        ${copy ? `<p class="cf-attendance-summary" title="${esc(copy.courseLabel)}">${esc(copy.sessionLabel)} &middot; ${copy.present} present &middot; ${copy.absent} absent<br><span>${esc(copy.date)}</span></p>` : ''}
        <div class="cf-attendance-actions"><button class="cf-primary cf-copy" data-action="copy-attendance" ${disabled}>${copy ? "Copy again" : "Copy attendance"}</button>${copy ? `<button class="cf-primary" data-action="apply-attendance" ${disabled}>Apply to this session</button>` : ''}</div>
        <p class="cf-attendance-hint">${copy ? "Restore here or apply to another session. Review and Save on the website." : "Mark absentees on the website, then copy for the next session."}</p></section>`;
    }
    function fieldEditor(field) {
      const data = fieldOptions(field);
      const selected = draft.fields[field.key] || [];
      const available = [...data.options];
      for (const choice of selected) if (!available.some(option => option.value === choice.value)) available.push({ ...choice, unavailable: true });
      const source = data.source === "live" ? "Captured" : data.source === "remembered" ? "Remembered" : "Capture from website";
      return `<div class="cf-form-field"><div class="cf-label-row"><label for="cf-${field.key}">${esc(field.label)}${field.optional ? ' <small class="cf-optional">Optional</small>' : ''}</label><span class="cf-source ${data.source === "live" ? "is-live" : ""}">${source}</span></div>
        ${field.multiple ? `<fieldset class="cf-sections" id="cf-section" aria-label="Section">${available.length ? available.map(option => `<label class="cf-section-choice"><input type="checkbox" data-field="section" value="${esc(option.value)}" ${selected.some(choice => choice.value === option.value) ? "checked" : ""} ${option.disabled && !selected.some(choice => choice.value === option.value) ? "disabled" : ""}><span>${esc(option.label)}${option.unavailable ? ' <small>· saved selection</small>' : ''}</span></label>`).join("") : '<span class="cf-field-empty">Choose the course first.</span>'}</fieldset>`
          : `<select id="cf-${field.key}" data-field="${field.key}"><option value="">${field.optional ? "Choose on website (not saved)" : `Choose ${esc(field.label.toLowerCase())}…`}</option>${available.map(option => `<option value="${esc(option.value)}" ${selected.some(choice => choice.value === option.value) ? "selected" : ""} ${option.disabled && !selected.some(choice => choice.value === option.value) ? "disabled" : ""}>${esc(option.label)}${option.unavailable ? " · saved selection" : ""}</option>`).join("")}</select>`}
        ${!available.length && !field.multiple ? '<small class="cf-field-hint">Options are remembered as you select them on the website.</small>' : ''}</div>`;
    }
    function categoryCreator() {
      return categoryFormOpen ? `<div class="cf-category-create" role="group" aria-label="${editingCategory ? "Rename category" : "Create category"}"><label for="cf-new-category">${editingCategory ? "Rename category" : "New category"}</label><div><input id="cf-new-category" maxlength="50" placeholder="e.g. Semester 5" value="${esc(categoryName)}" autocomplete="off"><button type="button" class="cf-primary" data-action="create-category" ${busy ? "disabled" : ""}>${editingCategory ? "Save" : "Create"}</button><button type="button" class="cf-icon-button" data-action="cancel-category" aria-label="${editingCategory ? "Cancel category rename" : "Cancel new category"}">${icon("close")}</button></div></div>` : "";
    }
    function editor() {
      const categories = state.categories || [];
      return `<div class="cf-editor"><button class="cf-back" data-action="back">${icon("back")} Saved classes</button>
        <h1>${draft.id ? "Edit class" : "Save class"}</h1><p class="cf-editor-intro">Save your class filters. Session No and a fixed class type are optional.</p>
        <form id="cf-form"><div class="cf-form-field"><label for="cf-name">Class name</label><input id="cf-name" placeholder="e.g. Cyber Security · Lab 1" maxlength="80" value="${esc(draft.name)}" required autocomplete="off"></div>
        ${Core.FIELDS.map(fieldEditor).join("")}
        <div class="cf-form-field"><label for="cf-category">Category <small class="cf-optional">Optional</small></label><div class="cf-category-picker"><select id="cf-category"><option value="">No category</option>${categories.map(name => `<option value="${esc(name)}" ${Core.normalize(draft.category) === Core.normalize(name) ? "selected" : ""}>${esc(name)}</option>`).join("")}</select><button type="button" class="cf-category-new" data-action="new-category" aria-label="New category">${icon("plus")}</button></div>${categoryCreator()}</div>
        <fieldset class="cf-save-mode"><legend>Class type <span class="cf-optional">Optional</span></legend><div class="cf-segment" role="group" aria-label="Preset class type">${[["", "Filters only"], ["theory", "Theory"], ["lab", "Lab"]].map(([value,label]) => `<button type="button" data-action="preset-type" data-value="${value}" aria-pressed="${(draft.classTypeOverride || "") === value}" class="${(draft.classTypeOverride || "") === value ? "is-selected" : ""}">${label}</button>`).join("")}</div><p id="cf-save-summary" role="status">${draft.classTypeOverride ? `Saving as <strong>${draft.classTypeOverride === "lab" ? "Lab" : "Theory"}</strong>. This overrides the class type in Attendance settings.` : 'Saving <strong>filters only</strong>. Theory/Lab will use Attendance settings.'}</p></fieldset>
        <div class="cf-editor-actions">${draft.id ? `<button type="button" class="cf-icon-button cf-delete" data-action="delete" data-id="${esc(draft.id)}" aria-label="Delete this preset">${icon("trash")}</button>` : ''}<button type="button" class="cf-secondary" data-action="back">Cancel</button><button type="submit" class="cf-primary" ${busy ? "disabled" : ""}>${busy ? "Saving…" : "Save preset"}${icon("check")}</button></div></form></div>`;
    }
    function render() {
      lastSignature = signature();
      const focused = container.getRootNode().activeElement;
      const focusId = focused?.id;
      const selection = focused?.selectionStart;
      const view = draft ? "editor" : "library";
      const scroll = lastView === view ? container.querySelector(".cf-body")?.scrollTop || 0 : 0;
      lastView = view;
      container.innerHTML = `<section class="cf-shell" aria-label="Jain ERP Assist attendance filters and copying">
        ${header()}<div class="cf-body">${feedback("header")}${draft ? editor() + feedback("editor") : attendanceControls() + feedback("attendance") + runtimeControls() + feedback("runtime") + library() + feedback("library")}</div>
        ${!draft ? `<div class="cf-capture-zone"><button class="cf-capture" data-action="capture" ${busy || !state.connected || isRunning() ? "disabled" : ""}>${icon("capture")} Save this class</button>${feedback("capture")}<p class="cf-credit">Made by NK Developers</p></div>` : ''}</section>`;
      const body = container.querySelector(".cf-body");
      if (body) body.scrollTop = scroll;
      if (focusId) {
        const element = container.querySelector(`#${CSS.escape(focusId)}`);
        if (element) { element.focus({ preventScroll: true }); if (typeof selection === "number" && element.type !== "date") { try { element.setSelectionRange(selection, selection); } catch {} } }
      }
      // Reveal new/changed feedback once; later renders must respect manual scrolling.
      const nextFeedback = new Map();
      for (const message of container.querySelectorAll("[data-feedback-for]")) {
        const section = message.dataset.feedbackFor;
        const content = message.textContent;
        nextFeedback.set(section, content);
        if (visibleFeedback.get(section) === content) continue;
        const bounds = message.getBoundingClientRect();
        const viewport = body?.contains(message) ? body.getBoundingClientRect() : { top: 0, bottom: innerHeight };
        if (bounds.top < viewport.top || bounds.bottom > viewport.bottom) {
          message.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
        }
      }
      visibleFeedback = nextFeedback;
    }
    function signature() {
      // Polling must not keep replacing focused inputs or disturb an open editor.
      return JSON.stringify([state.tabId, state.settings, state.collapsedCategories, state.categories, state.attendanceCopy, state.connected, state.stable, state.connection, state.presets,
        state.job && [state.job.id, state.job.status, state.job.message, state.job.progress], draft ? state.cache : null,
        draft ? state.snapshot && [state.snapshot.fields, state.snapshot.dateMode, state.snapshot.classType] : null, busy, error, notice, errorSection, noticeSection, categoryFormOpen, editingCategory, pendingCategoryDelete]);
    }
    function update(next) {
      if (!next) return;
      if (next.error) { error = next.error; errorSection = "header"; render(); return; }
      if (state.tabId !== next.tabId) dateEntry = null;
      state = next;
      clearTimeout(successTimer);
      if (state.job?.status === "done") {
        const remaining = state.job.updatedAt + 2000 - Date.now();
        if (remaining > 0) successTimer = setTimeout(() => render(), remaining + 10);
      }
      if (signature() !== lastSignature) render();
    }
    async function request(message) {
      const response = await options.send(message);
      if (response?.error) throw new Error(response.error);
      return response;
    }
    async function refresh() { update(await request({ type: "STATE" })); }
    async function saveSettings(settings, yearOverride) {
      busy = true;
      error = "";
      state.settings = settings;
      render();
      try { update(await request({ type: "SET_SETTINGS", settings, yearOverride })); }
      finally { busy = false; render(); }
    }
    function startDraft(preset = null, capture = false) {
      categoryFormOpen = false; categoryName = ""; editingCategory = null; pendingCategoryDelete = null;
      const live = state.snapshot;
      draft = preset ? structuredClone(preset) : { name: "", category: "", classTypeOverride: null, fields: Object.fromEntries(Core.FIELDS.map(field => [field.key, capture ? structuredClone(live?.fields[field.key].selected || []) : []])),
        scope: { origin: context().origin, account: context().account } };
      error = ""; notice = ""; errorSection = noticeSection = "editor";
      if (capture) {
        const course = labelOf(draft, "course").split(":")[0];
        draft.name = course || "";
        const missing = Core.FIELDS.filter(field => !field.optional && !draft.fields[field.key]?.length);
        if (missing.length) notice = `Captured available selections. Still choose: ${missing.map(field => field.label).join(", ")}.`;
      }
      render();
      container.querySelector("#cf-name")?.focus();
    }
    function clearAfter(key) {
      const index = Core.FIELDS.findIndex(field => field.key === key);
      Core.FIELDS.slice(index + 1).forEach(field => { draft.fields[field.key] = []; });
    }
    function dateSettings() {
      const [day = "", month = ""] = dateEntry.dayMonth.split("/");
      return { ...(state.settings || Core.runtimeFromSnapshot(state.snapshot)), previousDate: `${dateEntry.year}-${month}-${day}` };
    }
    function validateDateEntry() {
      const input = container.querySelector("#cf-date-daymonth");
      if (!input || !dateEntry) return;
      const complete = /^\d{2}\/\d{2}$/.test(dateEntry.dayMonth) && /^[1-9]\d{3}$/.test(dateEntry.year);
      const invalid = complete && !Core.validISODate(dateSettings().previousDate);
      input.setCustomValidity(invalid ? "Enter a valid date in DD/MM format." : "");
      input.setAttribute("aria-invalid", String(invalid));
      const hint = container.querySelector("#cf-date-hint");
      if (hint) hint.textContent = invalid ? "Enter a valid day and month for this year." : "";
    }
    container.addEventListener("input", event => {
      if (event.target.id === "cf-date-daymonth" || event.target.id === "cf-date-year") {
        const input = event.target;
        const isDate = input.id === "cf-date-daymonth";
        let digits = input.value.replace(/\D/g, "").slice(0, 4);
        let cursorDigits = input.value.slice(0, input.selectionStart).replace(/\D/g, "").length;
        // Backspace over the separator removes the preceding digit rather than getting stuck.
        if (isDate && event.inputType === "deleteContentBackward" && dateEntry.dayMonth.endsWith("/") && digits.length === 2) {
          digits = digits.slice(0, 1); cursorDigits = 1;
        }
        input.value = isDate && digits.length >= 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
        const cursor = cursorDigits + (isDate && cursorDigits >= 2 ? 1 : 0);
        input.setSelectionRange(Math.min(cursor, input.value.length), Math.min(cursor, input.value.length));
        dateEntry[isDate ? "dayMonth" : "year"] = input.value;
        state.settings = dateSettings();
        validateDateEntry();
      }

      if (event.target.id === "cf-name") draft.name = event.target.value;
      if (event.target.id === "cf-new-category") categoryName = event.target.value;
      if (event.target.id === "cf-search") { filter = event.target.value; render(); }
    });
    container.addEventListener("change", async event => {
      if (event.target.id === "cf-category") { draft.category = event.target.value; return; }
      if (event.target.id === "cf-import-file") {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        error = ""; notice = ""; removed = null; errorSection = noticeSection = "library";
        try {
          if (file.size > 1024 * 1024) throw new Error("Choose a preset backup smaller than 1 MB.");
          busy = true; render();
          const result = await request({ type: "IMPORT_PRESETS", text: await file.text() });
          notice = `Added ${result.added} preset${result.added === 1 ? "" : "s"}; ${result.skipped} duplicate${result.skipped === 1 ? "" : "s"} skipped.`;
          await refresh();
        } catch (failure) { error = failure.message; }
        finally { busy = false; render(); }
        return;
      }

      if (["cf-date-daymonth", "cf-date-year"].includes(event.target.id)) {
        const settings = dateSettings();
        const yearOverride = event.target.id === "cf-date-year" && /^[1-9]\d{3}$/.test(dateEntry.year) ? dateEntry.year : undefined;
        // Save after editing without disabling/replacing fields or swallowing the next click.
        dateWrites = dateWrites.catch(() => {}).then(async () => {
          await request({ type: "SET_SETTINGS", settings, yearOverride });
          if (yearOverride) state.previousYear = Number(yearOverride);
        });
        dateWrites.catch(failure => { error = failure.message; errorSection = "runtime"; render(); });
        return;
      }
      const field = Core.FIELDS.find(item => item.key === event.target.dataset.field);
      if (!field || !draft) return;
      const data = fieldOptions(field).options;
      const find = value => data.find(option => option.value === value) || draft.fields[field.key].find(option => option.value === value);
      const values = field.multiple ? [...container.querySelectorAll('input[data-field="section"]:checked')].map(element => element.value) : event.target.value ? [event.target.value] : [];
      draft.fields[field.key] = values.map(find).filter(Boolean).map(({ value, label }) => ({ value, label }));
      clearAfter(field.key);
      error = "";
      render();
    });
    container.addEventListener("submit", async event => {
      if (event.target.id !== "cf-form") return;
      event.preventDefault();
      errorSection = "editor";
      error = Core.validatePreset(draft);
      if (error) { render(); return; }
      busy = true; render();
      try {
        await request({ type: "SAVE_PRESET", preset: draft });
        draft = null; notice = ""; removed = null;
        await refresh();
      } catch (failure) { error = failure.message; }
      finally { busy = false; render(); }
    });
    async function reorderPresets(ids) {
      await dateWrites;
      await request({ type: "REORDER_PRESETS", ids });
      await refresh();
    }
    const clearDrag = () => container.querySelectorAll(".cf-drop-before,.cf-drop-after").forEach(row => row.classList.remove("cf-drop-before", "cf-drop-after"));
    container.addEventListener("dragstart", event => {
      const row = event.target.closest("[data-preset-id]");
      if (!row || busy || isRunning() || event.target.closest('[data-action="edit"]')) { event.preventDefault(); return; }
      draggedPreset = row.dataset.presetId;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggedPreset);
    });
    container.addEventListener("dragover", event => {
      const row = event.target.closest("[data-preset-id]");
      if (!draggedPreset || !row || row.dataset.presetId === draggedPreset || busy || isRunning()) return;
      if (categoryKey(state.presets.find(preset => preset.id === draggedPreset)) !== categoryKey(state.presets.find(preset => preset.id === row.dataset.presetId))) { clearDrag(); return; }
      event.preventDefault(); event.dataTransfer.dropEffect = "move";
      clearDrag();
      row.classList.add(event.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2 ? "cf-drop-before" : "cf-drop-after");
    });
    container.addEventListener("drop", async event => {
      const row = event.target.closest("[data-preset-id]");
      if (!draggedPreset || !row || busy || isRunning()) return;
      event.preventDefault();
      const from = draggedPreset; draggedPreset = null;
      const after = event.clientY >= row.getBoundingClientRect().top + row.offsetHeight / 2;
      clearDrag();
      if (from === row.dataset.presetId || categoryKey(state.presets.find(preset => preset.id === from)) !== categoryKey(state.presets.find(preset => preset.id === row.dataset.presetId))) return;
      const ids = state.presets.map(preset => preset.id).filter(id => id !== from);
      ids.splice(ids.indexOf(row.dataset.presetId) + Number(after), 0, from);
      try { await reorderPresets(ids); } catch (failure) { error = failure.message; errorSection = "library"; render(); }
    });
    container.addEventListener("dragend", () => { draggedPreset = null; clearDrag(); });
    container.addEventListener("keydown", async event => {
      if (event.target.id === "cf-new-category" && event.key === "Enter") { event.preventDefault(); container.querySelector('[data-action="create-category"]')?.click(); return; }
      const button = event.target.closest('[data-action="apply"]');
      if (!button || !event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key) || busy || isRunning()) return;
      event.preventDefault();
      const ids = state.presets.map(preset => preset.id);
      const current = state.presets.find(preset => preset.id === button.dataset.id);
      const group = state.presets.filter(preset => categoryKey(preset) === categoryKey(current)).map(preset => preset.id);
      const groupIndex = group.indexOf(button.dataset.id), next = groupIndex + (event.key === "ArrowUp" ? -1 : 1);
      if (next < 0 || next >= group.length) return;
      const index = ids.indexOf(button.dataset.id), nextIndex = ids.indexOf(group[next]);
      [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];
      try { await reorderPresets(ids); container.querySelector(`[data-action="apply"][data-id="${CSS.escape(button.dataset.id)}"]`)?.focus(); }
      catch (failure) { error = failure.message; errorSection = "library"; render(); }
    });
    container.addEventListener("click", async event => {
      const target = event.target.closest("[data-action]");
      if (!target || target.disabled) return;
      const action = target.dataset.action;
      if (action === "import-presets") { container.querySelector("#cf-import-file").click(); return; }
      const actionSection = ["copy-attendance", "apply-attendance", "clear-attendance"].includes(action) ? "attendance"
        : action === "stop" ? (state.job?.kind === "attendance" ? "attendance" : "library")
        : ["reset-date", "date-mode", "class-type", "open-page", "review-settings"].includes(action) ? "runtime"
         : ["new-category", "create-category", "cancel-category", "rename-category", "ask-delete-category", "delete-category", "cancel-delete-category"].includes(action) ? (draft ? "editor" : "library")
        : action === "capture" ? "capture" : ["new", "edit", "preset-type"].includes(action) ? "editor" : "library";
      try {
        await dateWrites;
        if (action === "reset-date") {
          dateEntry.dayMonth = "";
          await saveSettings(dateSettings());
          container.querySelector("#cf-date-daymonth")?.focus({ preventScroll: true });
        }
        else if (["copy-attendance","apply-attendance","clear-attendance"].includes(action)) {
          error=""; notice=""; busy=true; render();
          update(await request({type:{"copy-attendance":"COPY_ATTENDANCE","apply-attendance":"APPLY_ATTENDANCE","clear-attendance":"CLEAR_ATTENDANCE"}[action]}));
        }
        else if (action === "new-category") {
          categoryFormOpen = true; categoryName = ""; editingCategory = null; pendingCategoryDelete = null; error = "";
          render(); container.querySelector("#cf-new-category")?.focus();
        }
        else if (action === "cancel-category") { categoryFormOpen = false; categoryName = ""; editingCategory = null; }
        else if (action === "create-category") {
          busy = true; error = "";
          const result = await request(editingCategory ? { type: "RENAME_CATEGORY", name: editingCategory, newName: categoryName } : { type: "CREATE_CATEGORY", name: categoryName });
          if (draft) draft.category = result.category;
          categoryFormOpen = false; categoryName = ""; editingCategory = null; filter = ""; await refresh();
        }
        else if (action === "rename-category") {
          editingCategory = target.dataset.name; categoryName = editingCategory; categoryFormOpen = true; pendingCategoryDelete = null; error = "";
          render(); const input = container.querySelector("#cf-new-category"); input?.focus(); input?.select();
        }
        else if (action === "ask-delete-category") { pendingCategoryDelete = target.dataset.category; categoryFormOpen = false; editingCategory = null; error = ""; }
        else if (action === "cancel-delete-category") { pendingCategoryDelete = null; }
        else if (action === "delete-category") {
          busy = true; error = "";
          await request({ type: "DELETE_CATEGORY", name: target.dataset.name });
          pendingCategoryDelete = null; clearTimeout(removalTimer); removed = null;
          notice = "Category removed. Its classes are uncategorized."; noticeSection = "library";
          await refresh();
        }
        else if (action === "toggle-category") {
          const key = target.dataset.category;
          await request({ type: "SET_CATEGORY_COLLAPSED", key, collapsed: !(state.collapsedCategories || []).includes(key) });
          await refresh();
        }
        else if (action === "export-presets") {
          const { backup } = await request({ type: "EXPORT_PRESETS" });
          const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
          const link = document.createElement("a");
          link.href = url; link.download = "jain-erp-assist-presets.json";
          container.appendChild(link); link.click(); link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          removed = null; error = ""; notice = "Presets exported."; noticeSection = "library";
        }
        else if (action === "open-page") await request({ type: "OPEN_PAGE", newTab: event.ctrlKey });
        else if (action === "review-settings") { container.querySelector(".cf-body").scrollTop = 0; container.querySelector("#cf-date-daymonth")?.focus({ preventScroll: true }); }
        else if (action === "new") startDraft();
        else if (action === "capture") {
          busy = true; render();
          update(await request({ type: "CAPTURE" }));
          startDraft(null, true);
        }
        else if (action === "back") { categoryFormOpen = false; categoryName = ""; editingCategory = null; draft = null; error = ""; notice = ""; render(); }
        else if (action === "edit") { const preset = state.presets.find(item => item.id === target.dataset.id); if (preset) startDraft(preset); }
        else if (action === "preset-type") { draft.classTypeOverride = target.dataset.value || null; render(); }
        else if (action === "class-type" || action === "date-mode") {
          const settings = structuredClone(state.settings || Core.runtimeFromSnapshot(state.snapshot));
          const key = action === "class-type" ? "classType" : "dateMode";
          if (settings[key] !== target.dataset.value) {
            settings[key] = target.dataset.value;
            if (settings.dateMode === "previous" && !settings.previousDate) settings.previousDate = `${state.previousYear || new Date().getFullYear()}--`;
            await saveSettings(settings);
          }
          render();
          if (action === "date-mode" && settings.dateMode === "previous") container.querySelector("#cf-date-daymonth")?.focus({ preventScroll: true });
        } else if (action === "apply") {
          error = ""; notice = ""; busy = true; render();
          update(await request({ type: "APPLY", id: target.dataset.id }));
        } else if (action === "stop") update(await request({ type: "STOP" }));
        else if (action === "delete") {
          removed = state.presets.find(item => item.id === target.dataset.id);
          await request({ type: "DELETE_PRESET", id: target.dataset.id });
          draft = null; notice = "Preset removed."; noticeSection = "library"; error = "";
          clearTimeout(removalTimer);
          const removedId = removed.id;
          removalTimer = setTimeout(() => {
            if (notice === "Preset removed." && removed?.id === removedId) { notice = ""; removed = null; render(); }
          }, 5000);
          await refresh();
        } else if (action === "undo" && removed) {
          clearTimeout(removalTimer);
          await request({ type: "SAVE_PRESET", preset: removed });
          removed = null; notice = "Preset restored."; noticeSection = "library"; await refresh();
        }
      } catch (failure) { error = failure.message; errorSection = actionSection; }
      finally { busy = false; render(); }
    });
    render();
    {
      let refreshing = false;
      let timer = null;
      const poll = async () => {
        if (refreshing || disconnected) return;
        refreshing = true;
        try { await refresh(); } catch (failure) { error = failure.message; errorSection = "header"; render(); }
        finally {
          refreshing = false;
          clearTimeout(timer);
          if (!disconnected && (isRunning() || (state.connected && !state.stable))) timer = setTimeout(poll, isRunning() ? 250 : 100);
        }
      };
      chrome.runtime.onMessage.addListener(message => { if (message?.type === "classflow:view-changed" && message.tabId === state.tabId) poll(); });
      chrome.storage.onChanged.addListener((_changes, area) => { if (area === "local") poll(); });
      poll();
    }
    return { update, refresh: () => refresh().catch(failure => { error = failure.message; errorSection = "header"; render(); }), disconnected(message) { disconnected = true; state.connected = false; state.connection = message; render(); } };
  }
  root.ClassFlowUI = { mount };
})(globalThis);
