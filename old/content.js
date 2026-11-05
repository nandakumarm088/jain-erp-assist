(() => {
  const SCRIPT_VERSION = "2026-04-30-production-hardening";
  const CONFIG_KEY = "attendanceWebsitePanelConfig";
  const JOB_KEY = "attendanceWebsitePanelJob";
  const HISTORY_KEY = "attendanceWebsiteDateHistory";
  const PANEL_ID = "erp-attendance-floating-panel";
  const STYLE_ID = "erp-attendance-floating-panel-style";
  let resetConfirmButton = null;
  let resetConfirmTimer = null;

  if (
    window.__attendanceFloatingPanelBooted &&
    window.__attendanceFloatingPanelVersion === SCRIPT_VERSION
  ) {
    try {
      Promise.resolve(window.__attendanceFloatingPanelRefresh?.()).catch(() => {});
    } catch {
      // Ignore refresh failures from stale injected copies.
    }
    return;
  }

  if (window.__attendanceFloatingPanelBooted) {
    try {
      document.getElementById(PANEL_ID)?.remove();
      document.getElementById(STYLE_ID)?.remove();
    } catch {
      // A stale copy should never block the fresh content script from booting.
    }
  }

  window.__attendanceFloatingPanelBooted = true;
  window.__attendanceFloatingPanelVersion = SCRIPT_VERSION;

  const memoryFallback = Object.create(null);

  const readLocalFallback = (key, fallback) => {
    return Object.prototype.hasOwnProperty.call(memoryFallback, key)
      ? memoryFallback[key]
      : fallback;
  };

  const writeLocalFallback = (key, value) => {
    if (value === null || value === undefined) {
      delete memoryFallback[key];
    } else {
      memoryFallback[key] = value;
    }
  };

  const getChromeStorage = () => {
    try {
      if (typeof chrome === "undefined") return null;
      if (!chrome.runtime?.id) return null;
      if (!chrome.storage?.local) return null;
      return chrome.storage.local;
    } catch {
      return null;
    }
  };

  const hasChromeRuntime = () => {
    try {
      return typeof chrome !== "undefined" && !!chrome.runtime?.id;
    } catch {
      return false;
    }
  };

  const getChromeLastError = () => {
    try {
      return chrome.runtime?.lastError || null;
    } catch {
      return { message: "Extension runtime unavailable" };
    }
  };

  const storageGet = (key, fallback) => new Promise(resolve => {
    const finish = value => resolve(value ?? fallback);
    const localValue = () => readLocalFallback(key, fallback);
    try {
      const store = getChromeStorage();
      if (!store) {
        finish(localValue());
        return;
      }
      store.get(key, data => {
        try {
          if (!hasChromeRuntime() || getChromeLastError()) {
            finish(localValue());
            return;
          }
          finish(data?.[key] ?? localValue());
        } catch {
          finish(localValue());
        }
      });
    } catch {
      finish(localValue());
    }
  });

  const storageSet = (key, value) => new Promise(resolve => {
    try {
      writeLocalFallback(key, value);
      const store = getChromeStorage();
      if (!store) {
        resolve();
        return;
      }
      store.set({ [key]: value }, () => {
        try {
          if (hasChromeRuntime()) void getChromeLastError();
        } catch {
          // Ignore invalidated extension contexts; local fallback already has the value.
        }
        resolve();
      });
    } catch {
      resolve();
    }
  });

  const q = selector => document.querySelector(selector);

  const isAttendancePage = () =>
    location.href.includes("JVPL_Regular_Class_Attendance") ||
    !!q("#Body_ddlGraduationType") ||
    !!q("#Body_ddlsubject");

  const getSelect = (kind) => {
    const selectors = {
      program: ["#Body_ddlGraduationType", 'select[id*="GraduationType"]', 'select[name*="GraduationType"]'],
      academicBatch: ["#Body_ddlAcademicBatch", 'select[id*="AcademicBatch"]', 'select[name*="AcademicBatch"]'],
      courseSemester: ["#Body_ddlcourseyearsem", 'select[id*="ddlcourseyearsem"]', 'select[name*="ddlcourseyearsem"]', 'select[id*="courseyearsem"]', 'select[name*="courseyearsem"]'],
      specialization: ["#Body_ddlBranch", 'select[id*="ddlBranch"]', 'select[name*="ddlBranch"]', 'select[id*="Branch"]', 'select[name*="Branch"]'],
      course: ["#Body_ddlsubject", 'select[id*="ddlsubject"]', 'select[name*="ddlsubject"]', 'select[id*="subject"]', 'select[name*="subject"]']
    };

    return selectors[kind].map(selector => q(selector)).find(Boolean) || null;
  };

  const isPlaceholderOption = (option) => {
    const value = option?.value || "";
    const text = option?.text?.trim() || "";
    return !value ||
      value === "0" ||
      value === "--Select--" ||
      text === "-- Select --" ||
      text === "--Select--" ||
      text === "Select an Option";
  };

  const getOptions = (select) => {
    if (!select) return [];
    return [...select.options]
      .filter(option => !isPlaceholderOption(option))
      .map(option => ({ value: option.value, text: option.text.trim() }));
  };

  const parseDate = (value) => {
    const match = (value || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;
    const [, dd, mm, yyyy] = match;
    const date = new Date(+yyyy, +mm - 1, +dd);
    return date.getFullYear() === +yyyy && date.getMonth() + 1 === +mm && date.getDate() === +dd ? date : null;
  };

  const findDateInput = () =>
    q("#Body_txtdDAad") ||
    q('input[id*="txtdDAad"]') ||
    q('input[id*="date"],input[name*="date"],input[class*="date"]');

  const getPageDate = () => {
    const input = findDateInput();
    const display = q("#Body_lbldate")?.textContent?.trim() || "";
    return input?.value?.trim() || display || "";
  };

  const postBackTarget = (element) => {
    const raw = `${element.getAttribute("onchange") || ""} ${element.getAttribute("onclick") || ""}`.replace(/\\/g, "");
    const match = raw.match(/__doPostBack\('([^']+)'/);
    return match?.[1] || "";
  };

  const triggerElement = (element) => {
    const target = postBackTarget(element);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    if (window.jQuery) {
      try { window.jQuery(element).trigger("chosen:updated"); } catch {}
    }

    if (target) {
      if (window.__doPostBack) {
        window.__doPostBack(target, "");
      } else {
        element.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return true;
    }

    element.dispatchEvent(new Event("change", { bubbles: true }));
    return false;
  };

  const setRadio = (selectors) => {
    const radio = selectors.map(selector => q(selector)).find(Boolean);
    if (!radio) return { error: "Required radio option was not found" };
    if (radio.checked) return { done: true };
    radio.click();
    return { posted: !!postBackTarget(radio) };
  };

  const setSelectValue = (kind, value, label) => {
    if (!value) return { done: true };

    const select = getSelect(kind);
    if (!select) return { pending: true, message: `Waiting for ${label}` };

    const options = getOptions(select);
    if (!options.length) return { pending: true, message: `Waiting for ${label} options` };
    if (!options.some(option => option.value === value)) {
      return { error: `${label} changed on site. Re-pin or update the saved selection.` };
    }

    if (select.value === value) return { done: true };

    select.value = value;
    const posted = triggerElement(select);
    return { posted, message: `Selected ${label}` };
  };

  const dateMatchesPage = (fullDate) => {
    if (!fullDate) return true;
    const input = findDateInput();
    const display = q("#Body_lbldate")?.textContent?.trim() || "";
    const inputValue = input?.value?.trim() || "";
    return inputValue === fullDate || display === fullDate || (!input && !display);
  };

  const setStatus = (message, type = "") => {
    const panel = q(`#${PANEL_ID}`);
    const status = panel?.querySelector("[data-status]");
    if (!status) return;
    status.textContent = message || "";
    status.className = type ? `afp-status ${type}` : "afp-status";
  };

  const saveConfigPatch = async (patch) => {
    const config = await storageGet(CONFIG_KEY, {});
    await storageSet(CONFIG_KEY, { ...config, ...patch });
  };

  const injectStyle = () => {
    if (q(`#${STYLE_ID}`)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID} {
        position: fixed;
        left: 50%;
        top: 14px;
        transform: translateX(-50%);
        z-index: 2147483000;
        width: 300px;
        max-width: calc(100vw - 24px);
        border: 1px solid #d1d5db;
        border-radius: 8px;
        background: #ffffff;
        color: #1f2937;
        box-shadow: 0 12px 30px rgba(0,0,0,.18);
        font-family: Arial, sans-serif;
        font-size: 13px;
      }

      #${PANEL_ID}.dragging {
        opacity: .92;
        user-select: none;
      }

      #${PANEL_ID} .afp-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 9px 10px;
        border-bottom: 1px solid #e5e7eb;
        cursor: move;
        font-weight: 700;
      }

      #${PANEL_ID} .afp-close {
        width: 24px;
        height: 24px;
        border: 0;
        border-radius: 50%;
        background: #f3f4f6;
        color: #374151;
        cursor: pointer;
        font-size: 16px;
        font-weight: 800;
        line-height: 1;
      }

      #${PANEL_ID} .afp-body {
        padding: 10px;
      }

      #${PANEL_ID} .afp-row {
        display: grid;
        grid-template-columns: 1fr 78px;
        gap: 8px;
        margin-bottom: 8px;
      }

      #${PANEL_ID} .afp-date-control {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 6px;
      }

      #${PANEL_ID} .afp-clear-date {
        width: auto;
        min-width: 46px;
        border: 0;
        border-radius: 7px;
        padding: 0 8px;
        background: #eef2ff;
        color: #1e3a8a;
        cursor: pointer;
        font-size: 12px;
        font-weight: 700;
      }

      #${PANEL_ID} .afp-clear-date:hover {
        background: #dbeafe;
      }

      #${PANEL_ID} input,
      #${PANEL_ID} button {
        box-sizing: border-box;
        font-family: Arial, sans-serif;
      }

      #${PANEL_ID} button:disabled,
      #${PANEL_ID} input:disabled {
        opacity: .62;
        cursor: not-allowed;
      }

      #${PANEL_ID} input {
        width: 100%;
        border: 1px solid #d1d5db;
        border-radius: 7px;
        padding: 7px 8px;
        font-size: 13px;
      }

      #${PANEL_ID} button:focus-visible,
      #${PANEL_ID} input:focus-visible {
        outline: 2px solid #2563eb;
        outline-offset: 2px;
      }

      #${PANEL_ID} .afp-mode {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        margin-bottom: 8px;
      }

      #${PANEL_ID} .afp-mode button,
      #${PANEL_ID} .afp-preset {
        border: 0;
        border-radius: 7px;
        padding: 8px 9px;
        cursor: pointer;
        font-weight: 700;
      }

      #${PANEL_ID} .afp-mode button {
        background: #eef2ff;
        color: #1e3a8a;
      }

      #${PANEL_ID} .afp-mode button.active {
        background: #2563eb;
        color: #fff;
      }

      #${PANEL_ID} .afp-history {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 6px;
        margin-bottom: 8px;
      }

      #${PANEL_ID} .afp-history button {
        width: 100%;
        min-width: 0;
        height: 32px;
        border: 1px solid #bfdbfe;
        border-radius: 8px;
        padding: 0 6px;
        background: linear-gradient(180deg, #f8fbff 0%, #eaf2ff 100%);
        color: #1d4ed8;
        cursor: pointer;
        font-size: 12px;
        font-weight: 700;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.55);
      }

      #${PANEL_ID} .afp-history button:hover {
        background: linear-gradient(180deg, #f0f7ff 0%, #dbeafe 100%);
      }

      #${PANEL_ID} .afp-presets {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
        justify-content: center;
        align-items: center;
      }

      #${PANEL_ID} .afp-preset {
        width: auto;
        max-width: 100%;
        background: #2563eb;
        color: #fff;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        min-width: 108px;
      }

      #${PANEL_ID} .afp-preset:hover {
        background: #1d4ed8;
      }

      #${PANEL_ID} .afp-site-reset {
        display: block;
        width: auto;
        min-width: 70px;
        margin-top: 10px;
        margin-left: auto;
        margin-right: auto;
        border: 0;
        border-radius: 7px;
        padding: 8px 9px;
        background: #da4453;
        color: #fff;
        cursor: pointer;
        font-weight: 700;
      }

      #${PANEL_ID} .afp-site-reset:hover {
        background: #c9303e;
      }

      #${PANEL_ID} .afp-empty,
      #${PANEL_ID} .afp-status {
        margin-top: 8px;
        min-height: 15px;
        font-size: 12px;
        color: #6b7280;
      }

      #${PANEL_ID} .afp-status.success { color: #059669; }
      #${PANEL_ID} .afp-status.error { color: #dc2626; }
    `;
    document.documentElement.appendChild(style);
  };

  const makeButton = (text, className) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    return button;
  };

  const attachDrag = (panel, config) => {
    const header = panel.querySelector(".afp-header");
    let drag = null;

    header.addEventListener("mousedown", event => {
      if (event.target.closest("button")) return;
      const rect = panel.getBoundingClientRect();
      panel.style.transform = "none";
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.top}px`;
      panel.classList.add("dragging");
      drag = {
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top
      };
      event.preventDefault();
    });

    document.addEventListener("mousemove", event => {
      if (!drag) return;
      const left = Math.max(8, Math.min(window.innerWidth - panel.offsetWidth - 8, event.clientX - drag.offsetX));
      const top = Math.max(8, Math.min(window.innerHeight - panel.offsetHeight - 8, event.clientY - drag.offsetY));
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    });

    document.addEventListener("mouseup", async () => {
      if (!drag) return;
      drag = null;
      panel.classList.remove("dragging");
      await saveConfigPatch({
        position: {
          left: panel.style.left,
          top: panel.style.top
        }
      });
    });
  };

  const maskDateInput = (input) => {
    input.addEventListener("input", async () => {
      let value = input.value.replace(/\D/g, "").slice(0, 4);
      if (value.length > 2) value = `${value.slice(0, 2)}/${value.slice(2)}`;
      input.value = value;
      await saveConfigPatch({ panelDate: value });
    });
  };

  const updatePanelDateHistory = async (rawDate) => {
    if (!rawDate) return;
    const history = await storageGet(HISTORY_KEY, []);
    const next = [rawDate, ...history.filter(value => value !== rawDate)].slice(0, 4);
    await storageSet(HISTORY_KEY, next);
  };

  const clearResetConfirmation = () => {
    if (resetConfirmTimer) clearTimeout(resetConfirmTimer);
    if (resetConfirmButton) resetConfirmButton.textContent = "Reset";
    resetConfirmTimer = null;
    resetConfirmButton = null;
  };

  const clickWebsiteReset = (button) => {
    if (resetConfirmButton !== button) {
      clearResetConfirmation();
      resetConfirmButton = button;
      button.textContent = "Confirm";
      setStatus("Click Confirm to reset website", "error");
      resetConfirmTimer = setTimeout(clearResetConfirmation, 3500);
      return;
    }

    clearResetConfirmation();

    const reset =
      q("#Body_btnReset") ||
      q('input[name="ctl00$Body$btnReset"]') ||
      q('input[id*="btnReset"]');

    if (!reset) {
      setStatus("Website reset button not found", "error");
      return;
    }

    setStatus("Resetting website...", "success");
    reset.click();
  };

  const renderPanel = async () => {
    const [config, dateHistory, activeJob] = await Promise.all([
      storageGet(CONFIG_KEY, {}),
      storageGet(HISTORY_KEY, []),
      storageGet(JOB_KEY, null)
    ]);
    q(`#${PANEL_ID}`)?.remove();

    if (!config.enabled || !isAttendancePage()) return;
    injectStyle();

    const isBusy =
      !!activeJob?.preset &&
      Date.now() - (activeJob.startedAt || Date.now()) < 90000;

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    if (config.position?.left && config.position?.top) {
      panel.style.transform = "none";
      panel.style.left = config.position.left;
      panel.style.top = config.position.top;
    }

    const header = document.createElement("div");
    header.className = "afp-header";
    const title = document.createElement("span");
    title.textContent = "Attendance";
    const close = makeButton("x", "afp-close");
    close.title = "Remove floating box";
    close.addEventListener("click", async () => {
      clearResetConfirmation();
      await storageSet(CONFIG_KEY, { ...config, enabled: false });
      await storageSet(JOB_KEY, null);
      panel.remove();
    });
    header.appendChild(title);
    header.appendChild(close);

    const body = document.createElement("div");
    body.className = "afp-body";

    const row = document.createElement("div");
    row.className = "afp-row";
    const dateInput = document.createElement("input");
    dateInput.type = "text";
    dateInput.maxLength = 5;
    dateInput.placeholder = "dd/mm";
    dateInput.value = config.panelDate || "";
    dateInput.disabled = isBusy;
    maskDateInput(dateInput);

    const dateControl = document.createElement("div");
    dateControl.className = "afp-date-control";
    const clearDate = makeButton("Clear", "afp-clear-date");
    clearDate.title = "Clear date";
    clearDate.disabled = isBusy;
    clearDate.addEventListener("click", async () => {
      dateInput.value = "";
      await saveConfigPatch({ panelDate: "" });
      setStatus("Date cleared", "success");
    });
    dateControl.appendChild(dateInput);
    dateControl.appendChild(clearDate);

    const yearInput = document.createElement("input");
    yearInput.type = "text";
    yearInput.maxLength = 4;
    yearInput.placeholder = "year";
    yearInput.value = config.year || String(new Date().getFullYear());
    yearInput.disabled = isBusy;
    yearInput.addEventListener("input", async () => {
      yearInput.value = yearInput.value.replace(/\D/g, "").slice(0, 4);
      await saveConfigPatch({ year: yearInput.value });
    });

    row.appendChild(dateControl);
    row.appendChild(yearInput);

    const historyRow = document.createElement("div");
    historyRow.className = "afp-history";
    (dateHistory || []).slice(0, 4).forEach(value => {
      const button = makeButton(value, "afp-history-btn");
      button.title = value;
      button.disabled = isBusy;
      button.addEventListener("click", async () => {
        dateInput.value = value;
        await saveConfigPatch({ panelDate: value });
      });
      historyRow.appendChild(button);
    });

    let activeAttendanceType = config.attendanceType === "lab" ? "lab" : "theory";
    const mode = document.createElement("div");
    mode.className = "afp-mode";
    const theory = makeButton("Theory", "");
    const lab = makeButton("Lab", "");
    const setMode = async (value) => {
      activeAttendanceType = value === "lab" ? "lab" : "theory";
      theory.classList.toggle("active", activeAttendanceType !== "lab");
      lab.classList.toggle("active", activeAttendanceType === "lab");
      await saveConfigPatch({ attendanceType: activeAttendanceType });
    };
    theory.addEventListener("click", () => setMode("theory"));
    lab.addEventListener("click", () => setMode("lab"));
    theory.disabled = isBusy;
    lab.disabled = isBusy;
    mode.appendChild(theory);
    mode.appendChild(lab);
    setMode(config.attendanceType || "theory");

    const presets = document.createElement("div");
    presets.className = "afp-presets";
    (config.presets || []).forEach(preset => {
      const button = makeButton(preset.name || "Saved selection", "afp-preset");
      button.disabled = isBusy;
      button.addEventListener("click", () => startJob(preset, dateInput.value.trim(), yearInput.value.trim(), activeAttendanceType));
      presets.appendChild(button);
    });

    if (!presets.children.length) {
      const empty = document.createElement("div");
      empty.className = "afp-empty";
      empty.textContent = "No pinned saved selections.";
      presets.appendChild(empty);
    }

    const websiteReset = makeButton("Reset", "afp-site-reset");
    websiteReset.title = "Click the website reset button";
    websiteReset.disabled = isBusy;
    websiteReset.addEventListener("click", () => clickWebsiteReset(websiteReset));

    const status = document.createElement("div");
    status.className = "afp-status";
    status.dataset.status = "";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    if (isBusy) status.textContent = `Applying ${activeJob.preset.name || "saved selection"}...`;

    body.appendChild(row);
    if (historyRow.children.length) body.appendChild(historyRow);
    body.appendChild(mode);
    body.appendChild(presets);
    body.appendChild(websiteReset);
    body.appendChild(status);
    panel.appendChild(header);
    panel.appendChild(body);
    document.documentElement.appendChild(panel);
    attachDrag(panel, config);
  };

  const startJob = async (preset, rawDate, year, attendanceType) => {
    const existingJob = await storageGet(JOB_KEY, null);
    if (existingJob?.preset && Date.now() - (existingJob.startedAt || Date.now()) < 90000) {
      setStatus("A saved selection is already being applied", "error");
      return;
    }
    if (existingJob) await storageSet(JOB_KEY, null);

    let fullDate = "";
    if (rawDate) {
      if (!/^\d{2}\/\d{2}$/.test(rawDate)) return setStatus("Enter date as dd/mm", "error");
      if (!/^\d{4}$/.test(year)) return setStatus("Enter a valid year", "error");
      fullDate = `${rawDate}/${year}`;
      if (!parseDate(fullDate)) return setStatus("Invalid calendar date", "error");
      await saveConfigPatch({ panelDate: rawDate, year });
    }

    const job = {
      preset,
      rawDate,
      fullDate,
      attendanceType: attendanceType === "lab" ? "lab" : "theory",
      step: "attendance",
      startedAt: Date.now()
    };
    await storageSet(JOB_KEY, job);
    await renderPanel();
    setStatus(`Applying ${preset.name || "saved selection"}...`);
    runSavedJob().catch(() => setStatus("Could not start saved selection", "error"));
  };

  const continueLater = async (job, message) => {
    await storageSet(JOB_KEY, job);
    setStatus(message || "Waiting for website refresh...");
    setTimeout(runSavedJob, 900);
    return { pending: true };
  };

  const advanceJob = (job, step) => ({ ...job, step });

  const stopJob = async (message) => {
    await storageSet(JOB_KEY, null);
    setStatus(message, "error");
    return { error: message };
  };

  const completeJob = async () => {
    await storageSet(JOB_KEY, null);
    await renderPanel();
    setStatus("Filters applied", "success");
    return { done: true };
  };

  const ensureDate = async (job) => {
    if (!job.fullDate) return { done: true };

    const input = findDateInput();
    const display = q("#Body_lbldate")?.textContent?.trim() || "";
    if (!input && display === job.fullDate) {
      await updatePanelDateHistory(job.rawDate);
      await renderPanel();
      return { done: true };
    }
    if (!input) return { pending: true, message: "Waiting for date field" };

    if (input.value === job.fullDate) {
      await updatePanelDateHistory(job.rawDate);
      await renderPanel();
      return { done: true };
    }
    input.focus();
    input.value = job.fullDate;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const posted = triggerElement(input);
    input.blur();
    await updatePanelDateHistory(job.rawDate);
    await renderPanel();
    return { posted, message: "Set date" };
  };

  const ensureDateMode = (job) => {
    if (!job.fullDate) return { done: true };

    const desiredDate = parseDate(job.fullDate);
    const pageDate = parseDate(getPageDate());
    if (!desiredDate || !pageDate) return { done: true };

    const usePrevious = desiredDate < pageDate;
    const result = setRadio(usePrevious
      ? ["#Body_rdNextDate", 'input[id*="rdNextDate"]', 'input[value="rdNextDate"]']
      : ["#Body_rdCurrentDate", 'input[id*="rdCurrentDate"]', 'input[value="rdCurrentDate"]']);

    return {
      ...result,
      message: usePrevious ? "Opening previous date field" : "Switching date mode"
    };
  };

  const steps = [
    {
      name: "program",
      next: "academicBatch",
      kind: "program",
      label: "Program",
      value: job => job.preset.programValue,
      ready: job => dateMatchesPage(job.fullDate)
    },
    {
      name: "academicBatch",
      next: "courseSemester",
      kind: "academicBatch",
      label: "Academic batch",
      value: job => job.preset.academicBatchValue,
      ready: job => dateMatchesPage(job.fullDate) && getSelect("program")?.value === job.preset.programValue
    },
    {
      name: "courseSemester",
      next: "specialization",
      kind: "courseSemester",
      label: "Course year / semester",
      value: job => job.preset.courseSemesterValue,
      ready: job =>
        dateMatchesPage(job.fullDate) &&
        getSelect("program")?.value === job.preset.programValue &&
        getSelect("academicBatch")?.value === job.preset.academicBatchValue
    },
    {
      name: "specialization",
      next: "course",
      kind: "specialization",
      label: "Specialization",
      value: job => job.preset.specializationValue,
      ready: job =>
        dateMatchesPage(job.fullDate) &&
        getSelect("program")?.value === job.preset.programValue &&
        getSelect("academicBatch")?.value === job.preset.academicBatchValue &&
        getSelect("courseSemester")?.value === job.preset.courseSemesterValue
    },
    {
      name: "course",
      next: "complete",
      kind: "course",
      label: "Course",
      value: job => job.preset.courseValue,
      ready: job =>
        dateMatchesPage(job.fullDate) &&
        getSelect("program")?.value === job.preset.programValue &&
        getSelect("academicBatch")?.value === job.preset.academicBatchValue &&
        getSelect("courseSemester")?.value === job.preset.courseSemesterValue &&
        getSelect("specialization")?.value === job.preset.specializationValue
    }
  ];

  const runJob = async (job) => {
    if (!isAttendancePage()) return stopJob("Open the attendance page first");
    if (Date.now() - (job.startedAt || Date.now()) > 90000) {
      return stopJob("Website took too long to apply filters");
    }

    const currentStep = job.step || "attendance";

    if (currentStep === "attendance") {
      const typeResult = setRadio(job.attendanceType === "lab"
        ? ["#Body_rdLab", 'input[id*="rdLab"]', 'input[value="rdLab"]']
        : ["#Body_rdTheory", 'input[id*="rdTheory"]', 'input[value="rdTheory"]']);
      if (typeResult.error) return stopJob(typeResult.error);
      const nextJob = advanceJob(job, "dateMode");
      if (typeResult.posted) return continueLater(nextJob, "Setting Theory/Lab");
      return runJob(nextJob);
    }

    if (currentStep === "dateMode") {
      const modeResult = ensureDateMode(job);
      if (modeResult.error) return stopJob(modeResult.error);
      const nextJob = advanceJob(job, "dateField");
      if (modeResult.posted) return continueLater(nextJob, modeResult.message);
      return runJob(nextJob);
    }

    if (currentStep === "dateField") {
      const dateResult = await ensureDate(job);
      if (dateResult.error) return stopJob(dateResult.error);
      if (dateResult.pending) return continueLater(job, dateResult.message);
      const nextJob = advanceJob(job, "program");
      if (dateResult.posted) return continueLater(nextJob, dateResult.message);
      return runJob(nextJob);
    }

    const step = steps.find(item => item.name === currentStep);
    if (!step) return completeJob();

    if (!step.ready(job)) {
      return continueLater(job, `Waiting for ${step.label}`);
    }

    const result = setSelectValue(step.kind, step.value(job), step.label);
    if (result.error) return stopJob(result.error);
    if (result.pending) return continueLater(job, result.message);

    const nextJob = advanceJob(job, step.next);
    if (result.posted) return continueLater(nextJob, result.message);
    return runJob(nextJob);
  };

  const runSavedJob = async () => {
    const [config, job] = await Promise.all([
      storageGet(CONFIG_KEY, {}),
      storageGet(JOB_KEY, null)
    ]);

    if (!config.enabled || !job?.preset) return;
    await runJob(job);
  };

  window.__attendanceFloatingPanelRefresh = async () => {
    try {
      await renderPanel();
      await runSavedJob();
    } catch {
      // The website can be mid-postback while this runs; retry happens on the next refresh/load.
    }
  };

  if (hasChromeRuntime()) {
    try {
      chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message?.type !== "attendancePanel:refresh") return false;
        window.__attendanceFloatingPanelRefresh()
          .then(() => sendResponse({ ok: true }))
          .catch(() => sendResponse({ ok: false }));
        return true;
      });
    } catch {
      // The panel still works from page load even if extension messaging is unavailable.
    }
  }

  window.__attendanceFloatingPanelRefresh().catch(() => {});
})();
