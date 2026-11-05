const dateInput = document.getElementById("date");
const yearInput = document.getElementById("year");
const programSelect = document.getElementById("program");
const academicBatchSelect = document.getElementById("academicBatch");
const courseSemesterSelect = document.getElementById("courseSemester");
const setDateBtn = document.getElementById("setDate");
const saveDefaultBtn = document.getElementById("saveDefault");
const clearDateBtn = document.getElementById("clearDate");
const refreshProgramsBtn = document.getElementById("refreshPrograms");
const refreshAcademicBatchesBtn = document.getElementById("refreshAcademicBatches");
const refreshCourseSemestersBtn = document.getElementById("refreshCourseSemesters");
const specializationSelect = document.getElementById("specialization");
const refreshSpecializationsBtn = document.getElementById("refreshSpecializations");
const courseSelect = document.getElementById("course");
const refreshCoursesBtn = document.getElementById("refreshCourses");
const attendanceTypeRadios = document.querySelectorAll('input[name="attendanceType"]');
const websiteResetBtn = document.getElementById("websiteReset");

const refreshBtn = document.getElementById("refreshBtn");
const dateHistory = document.getElementById("dateHistory");
const clearDateHistoryBtn = document.getElementById("clearDateHistory");
const presetList = document.getElementById("presetList");
const msg = document.getElementById("msg");
const continueModal = document.getElementById("continueModal");
const continueTitle = document.getElementById("continueModalTitle");
const continueText = document.getElementById("continueText");
const continueYesBtn = document.getElementById("continueYes");
const continueNoBtn = document.getElementById("continueNo");

const editPresetsBtn = document.getElementById("editPresets");

const confirmModal = document.getElementById("confirmModal");
const confirmTitle = document.getElementById("confirmModalTitle");
const confirmText = document.getElementById("confirmText");
const confirmDeleteBtn = document.getElementById("confirmDelete");
const cancelDeleteBtn = document.getElementById("cancelDelete");

const saveModal = document.getElementById("saveModal");
const saveNameInput = document.getElementById("saveNameInput");
const confirmSaveBtn = document.getElementById("confirmSave");
const cancelSaveBtn = document.getElementById("cancelSave");
const websitePanelBtn = document.getElementById("websitePanelBtn");
const websitePanelModal = document.getElementById("websitePanelModal");
const websitePresetList = document.getElementById("websitePresetList");
const showWebsitePanelBtn = document.getElementById("showWebsitePanel");
const hideWebsitePanelBtn = document.getElementById("hideWebsitePanel");
const cancelWebsitePanelBtn = document.getElementById("cancelWebsitePanel");

const DEFAULT_YEAR = String(new Date().getFullYear());

const KEYS = {
  draft: "attendanceDraft",
  presets: "attendancePresets",
  year: "attendanceYear",
  programs: "attendanceProgramsCache",
  academicBatches: "attendanceAcademicBatchesCache",
  dateHistory: "attendanceDateHistory",
  courseSemesters: "attendanceCourseSemestersCache",
  specializations: "attendanceSpecializationsCache",
  courses: "attendanceCoursesCache"
};

const WEBSITE_PANEL_KEY = "attendanceWebsitePanelConfig";
const WEBSITE_PANEL_JOB_KEY = "attendanceWebsitePanelJob";
const WEBSITE_PANEL_HISTORY_KEY = "attendanceWebsiteDateHistory";

let editMode = false;
let pendingDeleteIndex = null;
let pendingSave = null;
let activeModal = null;
let lastFocusedElement = null;
let popupBusy = false;

const actionButtons = [
  setDateBtn,
  websiteResetBtn,
  refreshBtn,
  saveDefaultBtn,
  editPresetsBtn,
  websitePanelBtn,
  showWebsitePanelBtn,
  hideWebsitePanelBtn,
  refreshProgramsBtn,
  refreshAcademicBatchesBtn,
  refreshCourseSemestersBtn,
  refreshSpecializationsBtn,
  refreshCoursesBtn
];

const getFocusableModalItems = (modal) => [...modal.querySelectorAll(
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
)].filter(item => !item.disabled && item.offsetParent !== null);

const showModal = (modal, focusTarget = null) => {
  lastFocusedElement = document.activeElement;
  activeModal = modal;
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");

  setTimeout(() => {
    const target =
      focusTarget ||
      getFocusableModalItems(modal)[0] ||
      modal.querySelector(".modal-box");
    target?.focus?.();
  }, 0);
};

const hideModal = (modal) => {
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
  if (activeModal === modal) activeModal = null;

  if (lastFocusedElement?.focus) {
    setTimeout(() => lastFocusedElement.focus(), 0);
  }
};

const setPopupBusy = (busy) => {
  popupBusy = busy;
  actionButtons.forEach(button => {
    if (button) button.disabled = busy;
  });
};

const runWithBusy = async (button, busyText, task) => {
  if (popupBusy) return;

  const originalText = button?.textContent;
  setPopupBusy(true);
  if (button && busyText) button.textContent = busyText;

  try {
    return await task();
  } finally {
    if (button && originalText != null) button.textContent = originalText;
    setPopupBusy(false);
  }
};

const getRuntimeLastError = () => {
  try {
    return chrome.runtime?.lastError || null;
  } catch {
    return { message: "Extension runtime unavailable" };
  }
};

const closeDeleteModal = () => {
  pendingDeleteIndex = null;
  hideModal(confirmModal);
};

const openSaveModal = (data) => {
  pendingSave = data;
  saveNameInput.value = "";
  showModal(saveModal, saveNameInput);
};

const closeSaveModal = () => {
  pendingSave = null;
  saveNameInput.value = "";
  hideModal(saveModal);
};

const showMessage = (text, type = "") => {
  msg.className = `msg ${type}`;
  msg.textContent = text;
  clearTimeout(showMessage._t);
  showMessage._t = setTimeout(() => {
    msg.textContent = "";
    msg.className = "msg";
  }, 2500);
};

const getSelectedAttendanceType = () => {
  const selected = [...attendanceTypeRadios].find(r => r.checked);
  return selected ? selected.value : "theory";
};

const setSelectedAttendanceType = (type = "theory") => {
  const safeType = type === "lab" ? "lab" : "theory";
  attendanceTypeRadios.forEach(radio => {
    radio.checked = radio.value === safeType;
  });
};

const awaitContinueConfirmation = (message, title = "Continue?") => new Promise(resolve => {
  continueTitle.textContent = title;
  continueText.textContent = message;
  showModal(continueModal, continueYesBtn);

  const cleanup = () => {
    hideModal(continueModal);
    continueYesBtn.removeEventListener("click", onYes);
    continueNoBtn.removeEventListener("click", onNo);
  };

  const onYes = () => { cleanup(); resolve(true); };
  const onNo = () => { cleanup(); resolve(false); };

  continueYesBtn.addEventListener("click", onYes);
  continueNoBtn.addEventListener("click", onNo);
});

document.addEventListener("keydown", (event) => {
  if (!activeModal) return;

  if (event.key === "Escape") {
    event.preventDefault();
    if (activeModal === continueModal) continueNoBtn.click();
    else if (activeModal === saveModal) closeSaveModal();
    else if (activeModal === confirmModal) closeDeleteModal();
    else if (activeModal === websitePanelModal) cancelWebsitePanelBtn.click();
    return;
  }

  if (event.key !== "Tab") return;

  const focusable = getFocusableModalItems(activeModal);
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

const isValidDate = (dd, mm, yyyy) => {
  const d = new Date(+yyyy, +mm - 1, +dd);
  return d.getFullYear() === +yyyy && d.getMonth() + 1 === +mm && d.getDate() === +dd;
};

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

const storageGet = (key, fallback) => new Promise(resolve => {
  try {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return resolve(fallback);
    chrome.storage.local.get(key, data => {
      if (getRuntimeLastError()) return resolve(fallback);
      resolve(data?.[key] ?? fallback);
    });
  } catch {
    resolve(fallback);
  }
});

const storageSet = (key, value) => new Promise(resolve => {
  try {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return resolve(false);
    chrome.storage.local.set({ [key]: value }, () => {
      resolve(!getRuntimeLastError());
    });
  } catch {
    resolve(false);
  }
});

const getYear = () => {
  try {
    return localStorage.getItem(KEYS.year) || DEFAULT_YEAR;
  } catch {
    return DEFAULT_YEAR;
  }
};

const setYear = (value) => {
  try {
    localStorage.setItem(KEYS.year, value || DEFAULT_YEAR);
  } catch {}
};

const getPresets = () => read(KEYS.presets, []);
const savePresets = (data) => write(KEYS.presets, data);

const getCachedPrograms = () => read(KEYS.programs, []);
const saveCachedPrograms = (data) => write(KEYS.programs, data);

const getCached = (key, id) => {
  const all = read(key, {});
  return id ? all[id] || [] : [];
};

const saveCached = (key, id, data) => {
  if (!id) return;
  const all = read(key, {});
  all[id] = data;
  write(key, all);
};

const getDraft = () => read(KEYS.draft, {});
const getCachedAcademicBatches = (program) => getCached(KEYS.academicBatches, program);
const saveCachedAcademicBatches = (program, data) => saveCached(KEYS.academicBatches, program, data);
const getCachedCourseSemesters = (academicBatch) => getCached(KEYS.courseSemesters, academicBatch);
const saveCachedCourseSemesters = (academicBatch, data) => saveCached(KEYS.courseSemesters, academicBatch, data);
const getCachedSpecializations = (courseSemester) => getCached(KEYS.specializations, courseSemester);
const saveCachedSpecializations = (courseSemester, data) => saveCached(KEYS.specializations, courseSemester, data);
const getCourseCacheId = (courseSemester, specialization) => courseSemester && specialization ? `${courseSemester}::${specialization}` : "";
const getCachedCourses = (courseSemester, specialization) => getCached(KEYS.courses, getCourseCacheId(courseSemester, specialization));
const saveCachedCourses = (courseSemester, specialization, data) => saveCached(KEYS.courses, getCourseCacheId(courseSemester, specialization), data);

const getDateHistory = () => read(KEYS.dateHistory, []);
const saveDateHistory = (data) => write(KEYS.dateHistory, data);
const getSelectedText = (select) => select.options[select.selectedIndex]?.text || "";
const syncWebsiteDateHistory = () => storageSet(WEBSITE_PANEL_HISTORY_KEY, getDateHistory().slice(0, 4));

const saveRecentDate = async (rawDate) => {
  if (!rawDate) return;
  const history = getDateHistory();
  const next = [rawDate, ...history.filter(date => date !== rawDate)].slice(0, 5);
  saveDateHistory(next);
  await syncWebsiteDateHistory();
  renderDateHistory();
  await refreshWebsitePanelOnActiveTab();
};

const mergeWebsiteDateHistory = async () => {
  const websiteHistory = await storageGet(WEBSITE_PANEL_HISTORY_KEY, []);
  if (!Array.isArray(websiteHistory) || !websiteHistory.length) return;

  const localHistory = getDateHistory();
  const merged = [];
  [...websiteHistory, ...localHistory].forEach(date => {
    if (date && !merged.includes(date)) merged.push(date);
  });

  saveDateHistory(merged.slice(0, 5));
  await syncWebsiteDateHistory();
};

const saveDraft = () => {
  write(KEYS.draft, {
    date: dateInput.value,
    program: programSelect.value,
    programText: getSelectedText(programSelect),
    academicBatch: academicBatchSelect.value,
    academicBatchText: getSelectedText(academicBatchSelect),
    courseSemester: courseSemesterSelect.value,
    courseSemesterText: getSelectedText(courseSemesterSelect),
    specializationValue: specializationSelect.value,
    specializationText: getSelectedText(specializationSelect),
    courseValue: courseSelect.value,
    courseText: getSelectedText(courseSelect),
    attendanceType: getSelectedAttendanceType()
  });
};

const loadPersistentState = () => {
  yearInput.value = getYear();
};

const loadDraftState = () => {
  const draft = getDraft();
  const specializationValue = draft.specializationValue || draft.specialization || "";
  const courseValue = draft.courseValue || draft.course || "";
  dateInput.value = draft.date || "";
  setSelectedAttendanceType(draft.attendanceType || "theory");
  fillProgramsWithSelection(getCachedPrograms(), draft.program, draft.programText);

  fillAcademicBatchesForProgram(programSelect.value, draft.academicBatch, draft.academicBatchText);
  fillCourseSemestersForAcademicBatch(draft.academicBatch, draft.courseSemester, draft.courseSemesterText);
  fillSpecializationsForCourseSemester(draft.courseSemester, specializationValue, draft.specializationText);
  fillCoursesForSpecialization(draft.courseSemester, specializationValue, courseValue, draft.courseText);
};

const createOption = (text, value) => {
  const option = document.createElement("option");
  option.value = value != null ? value : "";
  option.textContent = text || "";
  return option;
};

const fillOptions = (select, items = [], selectedValue = "", selectedText = "", placeholder = "-- Select --") => {
  select.innerHTML = "";
  select.appendChild(createOption(placeholder, ""));
  (items || []).forEach(item => select.appendChild(createOption(item.text, item.value)));
  if (!selectedValue) return;
  const matched = [...select.options].some(o => o.value === selectedValue);
  if (matched) {
    select.value = selectedValue;
    return;
  }
  const option = createOption(selectedText || selectedValue, selectedValue);
  select.appendChild(option);
  select.value = selectedValue;
};

const fillPrograms = (programs, selectedValue = "") => fillOptions(programSelect, programs, selectedValue, "", "Select program");
const fillProgramsWithSelection = (programs, selectedValue = "", selectedText = "") => fillOptions(programSelect, programs, selectedValue, selectedText, "Select program");
const fillAcademicBatches = (items, selectedValue = "", selectedText = "") => fillOptions(academicBatchSelect, items, selectedValue, selectedText, "Select academic batch");
const fillAcademicBatchesForProgram = (program, selectedValue = "", selectedText = "") => fillAcademicBatches(getCachedAcademicBatches(program), selectedValue, selectedText);
const fillCourseSemesters = (items, selectedValue = "", selectedText = "") => fillOptions(courseSemesterSelect, items, selectedValue, selectedText, "Select course year / semester");
const fillCourseSemestersForAcademicBatch = (academicBatch, selectedValue = "", selectedText = "") => fillCourseSemesters(getCachedCourseSemesters(academicBatch), selectedValue, selectedText);
const fillSpecializations = (items, selectedValue = "", selectedText = "") => fillOptions(specializationSelect, items, selectedValue, selectedText, "Select specialization");
const fillSpecializationsForCourseSemester = (courseSemester, selectedValue = "", selectedText = "") => fillSpecializations(getCachedSpecializations(courseSemester), selectedValue, selectedText);
const fillCourses = (items, selectedValue = "", selectedText = "") => fillOptions(courseSelect, items, selectedValue, selectedText, "Select course");
const fillCoursesForSpecialization = (courseSemester, specialization, selectedValue = "", selectedText = "") => fillCourses(getCachedCourses(courseSemester, specialization), selectedValue, selectedText);

const openDeleteModal = (index, label) => {
  pendingDeleteIndex = index;
  confirmTitle.textContent = "Delete selection?";
  confirmText.textContent = typeof label === "string" && label ? `Delete "${label}"?` : "Confirm delete?";
  showModal(confirmModal, confirmDeleteBtn);
};

const renderDateHistory = () => {
  dateHistory.innerHTML = "";
  const history = getDateHistory();
  if (!history.length) {
    const empty = document.createElement("div");
    empty.className = "empty-message";
    empty.textContent = "No recent dates saved.";
    dateHistory.appendChild(empty);
    return;
  }

  history.forEach(date => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "date-history-item";
    button.textContent = date;
    button.addEventListener("click", () => {
      dateInput.value = date;
      saveDraft();
      showMessage("Date loaded", "success");
    });
    dateHistory.appendChild(button);
  });
};

const renderPresets = () => {
  presetList.innerHTML = "";
  const presets = getPresets();

  if (!presets.length) {
    const empty = document.createElement("div");
    empty.className = "empty-message";
    empty.textContent = "No saved selections.";
    presetList.appendChild(empty);
    return;
  }

  presets.forEach((preset, index) => {
    const wrap = document.createElement("div");
    wrap.className = editMode ? "preset-wrap editing" : "preset-wrap";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "preset-btn";
    btn.textContent = preset.name;
    btn.addEventListener("click", () => {
      fillProgramsWithSelection(getCachedPrograms(), preset.programValue, preset.programText);
      fillAcademicBatchesForProgram(
        programSelect.value,
        preset.academicBatchValue,
        preset.academicBatchText
      );
      fillCourseSemestersForAcademicBatch(
        academicBatchSelect.value,
        preset.courseSemesterValue,
        preset.courseSemesterText
      );
      fillSpecializationsForCourseSemester(
        courseSemesterSelect.value,
        preset.specializationValue,
        preset.specializationText
      );
      fillCoursesForSpecialization(
        courseSemesterSelect.value,
        specializationSelect.value,
        preset.courseValue,
        preset.courseText
      );
      saveDraft();
      showMessage(`Loaded ${preset.name}`, "success");
    });

    if (editMode) {
      const del = document.createElement("button");
      del.type = "button";
      del.className = "preset-del";
      del.textContent = "\u00d7";
      del.title = `Delete ${preset.name}`;
      del.setAttribute("aria-label", `Delete ${preset.name}`);
      del.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openDeleteModal(index, preset.name);
      });
      wrap.appendChild(del);
    }

    wrap.appendChild(btn);
    presetList.appendChild(wrap);
  });
};

dateInput.addEventListener("input", e => {
  let v = e.target.value.replace(/\D/g, "").slice(0, 4);
  if (v.length > 2) v = `${v.slice(0, 2)}/${v.slice(2)}`;
  e.target.value = v;
  saveDraft();
});

clearDateBtn.addEventListener("click", () => {
  dateInput.value = "";
  saveDraft();
  showMessage("Date cleared", "success");
});

clearDateHistoryBtn.addEventListener("click", () => {
  if (!getDateHistory().length) {
    return showMessage("No saved date history", "error");
  }

  pendingDeleteIndex = "__date_history__";
  confirmTitle.textContent = "Clear recent dates?";
  confirmText.textContent = "Clear all saved recent dates?";
  showModal(confirmModal, confirmDeleteBtn);
});

const bindSyncButton = (button, options, listKey, noItemsText, itemText) => {
  button.addEventListener("click", () => runWithBusy(button, "Syncing...", async () => {
    const synced = await syncFiltersFromSite(options);
    if (!synced.ok) return showMessage("Open the attendance site first", "error");

    const count = synced[listKey]?.length || 0;
    showMessage(count ? itemText(count) : noItemsText, count ? "success" : "error");
  }));
};

bindSyncButton(refreshProgramsBtn, { adoptProgram: true }, "programs", "No programs found on site", c => `Synced ${c} programs`);
bindSyncButton(refreshAcademicBatchesBtn, { adoptProgram: true, adoptAcademicBatch: true }, "academicBatches", "No academic batches found on site", c => `Synced ${c} academic batches`);
bindSyncButton(refreshCourseSemestersBtn, { adoptProgram: true, adoptAcademicBatch: true, adoptCourseSemester: true }, "courseSemesters", "No course year / semester options found on site", c => `Synced ${c} course year / semester options`);
bindSyncButton(refreshSpecializationsBtn, { adoptProgram: true, adoptAcademicBatch: true, adoptCourseSemester: true, adoptSpecialization: true }, "specializations", "No specializations found on site", c => `Synced ${c} specializations`);
bindSyncButton(refreshCoursesBtn, { adoptProgram: true, adoptAcademicBatch: true, adoptCourseSemester: true, adoptSpecialization: true, adoptCourse: true }, "courses", "No courses found on site", c => `Synced ${c} courses`);

yearInput.addEventListener("input", e => {
  e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4);
  setYear(e.target.value);
});

programSelect.addEventListener("change", () => {
  fillAcademicBatchesForProgram(programSelect.value);
  fillCourseSemestersForAcademicBatch("");
  fillSpecializationsForCourseSemester("");
  fillCoursesForSpecialization("", "");
  saveDraft();
  loadAcademicBatches();
});

academicBatchSelect.addEventListener("change", () => {
  fillCourseSemestersForAcademicBatch(academicBatchSelect.value);
  fillSpecializationsForCourseSemester("");
  fillCoursesForSpecialization("", "");
  saveDraft();
});

courseSemesterSelect.addEventListener("change", () => {
  fillSpecializationsForCourseSemester(courseSemesterSelect.value);
  fillCoursesForSpecialization("", "");
  saveDraft();
});

specializationSelect.addEventListener("change", () => {
  fillCoursesForSpecialization(courseSemesterSelect.value, specializationSelect.value);
  saveDraft();
});

courseSelect.addEventListener("change", saveDraft);
attendanceTypeRadios.forEach(radio => radio.addEventListener("change", saveDraft));

editPresetsBtn.addEventListener("click", () => {
  editMode = !editMode;
  editPresetsBtn.classList.toggle("active", editMode);
  editPresetsBtn.textContent = editMode ? "Done" : "Edit Selections";
  renderPresets();
});

confirmDeleteBtn.addEventListener("click", async () => {
  if (pendingDeleteIndex === null) return;

  if (pendingDeleteIndex === "__date_history__") {
    saveDateHistory([]);
    await syncWebsiteDateHistory();
    await refreshWebsitePanelOnActiveTab();
    closeDeleteModal();
    renderDateHistory();
    return showMessage("Date history cleared", "success");
  }

  const presets = getPresets();
  presets.splice(pendingDeleteIndex, 1);
  savePresets(presets);
  closeDeleteModal();
  renderPresets();
  showMessage("Selection deleted", "success");
});

cancelDeleteBtn.addEventListener("click", closeDeleteModal);

confirmSaveBtn.addEventListener("click", () => {
  const name = saveNameInput.value.trim();
  if (!name || !pendingSave) return;

  const presets = getPresets();
  presets.push({
    name,
    programValue: pendingSave.programValue,
    programText: pendingSave.programText,
    academicBatchValue: pendingSave.academicBatchValue,
    academicBatchText: pendingSave.academicBatchText,
    courseSemesterValue: pendingSave.courseSemesterValue,
    courseSemesterText: pendingSave.courseSemesterText,
    specializationValue: pendingSave.specializationValue,
    specializationText: pendingSave.specializationText,
    courseValue: pendingSave.courseValue,
    courseText: pendingSave.courseText
  });

  savePresets(presets);
  renderPresets();
  closeSaveModal();
  showMessage("Selection saved", "success");
});

cancelSaveBtn.addEventListener("click", closeSaveModal);

saveNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    confirmSaveBtn.click();
  }
});

const presetIdentity = (preset) => [
  preset.name,
  preset.programValue,
  preset.academicBatchValue,
  preset.courseSemesterValue,
  preset.specializationValue,
  preset.courseValue
].join("|");

const closeWebsitePanelModal = () => {
  hideModal(websitePanelModal);
};

const renderWebsitePanelPresetChoices = async () => {
  websitePresetList.innerHTML = "";
  const presets = getPresets();
  const config = await storageGet(WEBSITE_PANEL_KEY, {});
  const selected = new Set((config.presets || []).map(presetIdentity));

  if (!presets.length) {
    const empty = document.createElement("div");
    empty.className = "empty-message";
    empty.textContent = "No saved selections yet.";
    websitePresetList.appendChild(empty);
    return;
  }

  presets.forEach((preset, index) => {
    const label = document.createElement("label");
    label.className = "website-preset-choice";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = String(index);
    checkbox.checked = selected.has(presetIdentity(preset));

    const text = document.createElement("span");
    text.textContent = preset.name;

    label.appendChild(checkbox);
    label.appendChild(text);
    websitePresetList.appendChild(label);
  });
};

const refreshWebsitePanelOnActiveTab = async () => {
  const tab = await getActiveTab();
  if (!tab?.id || !tab.url) return false;
  if (!tab.url.includes("jained.jainuniversity.ac.in")) return false;

  const sendRefresh = () => new Promise(resolve => {
    try {
      chrome.tabs.sendMessage(tab.id, { type: "attendancePanel:refresh" }, () => {
        resolve(!getRuntimeLastError());
      });
    } catch {
      resolve(false);
    }
  });

  if (await sendRefresh()) return true;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
    return sendRefresh();
  } catch {
    return false;
  }
};

websitePanelBtn.addEventListener("click", () => runWithBusy(websitePanelBtn, "Loading...", async () => {
  await renderWebsitePanelPresetChoices();
  showModal(websitePanelModal, showWebsitePanelBtn);
}));

showWebsitePanelBtn.addEventListener("click", () => runWithBusy(showWebsitePanelBtn, "Adding...", async () => {
  const presets = getPresets();
  const selectedIndexes = [...websitePresetList.querySelectorAll('input[type="checkbox"]:checked')]
    .map(input => Number(input.value))
    .filter(index => Number.isInteger(index) && presets[index]);

  if (!selectedIndexes.length) return showMessage("Choose at least one saved selection", "error");

  const previous = await storageGet(WEBSITE_PANEL_KEY, {});
  await storageSet(WEBSITE_PANEL_KEY, {
    ...previous,
    enabled: true,
    presets: selectedIndexes.map(index => presets[index]),
    year: yearInput.value.trim() || getYear()
  });

  closeWebsitePanelModal();
  const refreshed = await refreshWebsitePanelOnActiveTab();
  showMessage(refreshed ? "Website box added" : "Open the attendance site first", refreshed ? "success" : "error");
}));

hideWebsitePanelBtn.addEventListener("click", () => runWithBusy(hideWebsitePanelBtn, "Removing...", async () => {
  const previous = await storageGet(WEBSITE_PANEL_KEY, {});
  await storageSet(WEBSITE_PANEL_KEY, { ...previous, enabled: false });
  await storageSet(WEBSITE_PANEL_JOB_KEY, null);
  closeWebsitePanelModal();
  const refreshed = await refreshWebsitePanelOnActiveTab();
  showMessage(refreshed ? "Website box removed" : "Website box will stay removed", "success");
}));

cancelWebsitePanelBtn.addEventListener("click", closeWebsitePanelModal);

websiteResetBtn.addEventListener("click", () => runWithBusy(websiteResetBtn, "Resetting...", async () => {
  const confirmed = await awaitContinueConfirmation(
    "This will click the website Reset button and reload the attendance filters on the page.",
    "Reset website?"
  );
  if (!confirmed) return showMessage("Reset cancelled", "error");

  const result = await runInPage(() => {
    const reset =
      document.querySelector("#Body_btnReset") ||
      document.querySelector('input[name="ctl00$Body$btnReset"]') ||
      document.querySelector('input[id*="btnReset"]');

    if (!reset) return { clicked: false };
    reset.click();
    return { clicked: true };
  });

  if (result?.value?.clicked) {
    showMessage("Website reset clicked", "success");
  } else {
    showMessage("Website reset button not found", "error");
  }
}));

async function getActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  } catch {
    return null;
  }
}

async function runInPage(func, args = []) {
  try {
    const tab = await getActiveTab();
    if (!tab?.id || !tab.url) return { blocked: true };

    return runInTab(tab.id, func, args);
  } catch {
    return { blocked: true };
  }
}

async function runInTab(tabId, func, args = []) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      args,
      func
    });

    return { ok: true, value: res?.result ?? null };
  } catch {
    return { blocked: true };
  }
}

const wait = ms => new Promise(r => setTimeout(r, ms));

async function readSiteFilters() {
  return runInPage(() => {
    const getSelect = (selectors) => {
      for (const selector of selectors) {
        const match = document.querySelector(selector);
        if (match) return match;
      }
      return null;
    };

    const getOptions = (select) => {
      if (!select) return [];
      return [...select.options]
        .filter(o =>
          o.value &&
          o.value !== "0" &&
          o.value !== "--Select--" &&
          o.text.trim() !== "-- Select --" &&
          o.text.trim() !== "--Select--" &&
          o.text.trim() !== "Select an Option"
        )
        .map(o => ({ value: o.value, text: o.text.trim() }));
    };

    const isPlaceholder = (option) => {
      const text = option?.text?.trim() || "";
      const value = option?.value || "";
      return !value ||
        value === "0" ||
        value === "--Select--" ||
        text === "-- Select --" ||
        text === "--Select--" ||
        text === "Select an Option";
    };

    const getSelected = (select) => {
      const option = select?.options?.[select.selectedIndex];
      if (!select || isPlaceholder(option)) {
        return { value: "", text: "" };
      }

      return {
        value: select.value,
        text: option?.text.trim() || ""
      };
    };

    const programSelect = getSelect([
      "#Body_ddlGraduationType",
      'select[id*="GraduationType"]',
      'select[name*="GraduationType"]'
    ]);

    const batchSelect = getSelect([
      "#Body_ddlAcademicBatch",
      'select[id*="AcademicBatch"]',
      'select[name*="AcademicBatch"]'
    ]);

    const courseSemesterSelect = getSelect([
      "#Body_ddlcourseyearsem",
      'select[id*="ddlcourseyearsem"]',
      'select[name*="ddlcourseyearsem"]',
      'select[id*="courseyearsem"]',
      'select[name*="courseyearsem"]'
    ]);

    const specializationSelect = getSelect([
      "#Body_ddlBranch",
      'select[id*="ddlBranch"]',
      'select[name*="ddlBranch"]',
      'select[id*="Branch"]',
      'select[name*="Branch"]'
    ]);

    const courseSelect = getSelect([
      "#Body_ddlsubject",
      'select[id*="ddlsubject"]',
      'select[name*="ddlsubject"]',
      'select[id*="subject"]',
      'select[name*="subject"]'
    ]);

    const program = getSelected(programSelect);
    const academicBatch = getSelected(batchSelect);
    const courseSemester = getSelected(courseSemesterSelect);
    const specialization = getSelected(specializationSelect);
    const course = getSelected(courseSelect);

    return {
      programs: getOptions(programSelect),
      programValue: program.value,
      programText: program.text,
      academicBatches: getOptions(batchSelect),
      academicBatchValue: academicBatch.value,
      academicBatchText: academicBatch.text,
      courseSemesters: getOptions(courseSemesterSelect),
      courseSemesterValue: courseSemester.value,
      courseSemesterText: courseSemester.text,
      specializations: getOptions(specializationSelect),
      specializationValue: specialization.value,
      specializationText: specialization.text,
      courses: getOptions(courseSelect),
      courseValue: course.value,
      courseText: course.text
    };
  });
}

async function syncFiltersFromSite({
  adoptProgram = false,
  adoptAcademicBatch = false,
  adoptCourseSemester = false,
  adoptSpecialization = false,
  adoptCourse = false
} = {}) {
  const result = await readSiteFilters();
  if (result?.blocked) return { ok: false, blocked: true };

  const state = result?.value;
  if (!state) return { ok: false };

  const currentProgram = programSelect.value;
  const currentProgramText = getSelectedText(programSelect);
  const currentBatch = academicBatchSelect.value;
  const currentBatchText = getSelectedText(academicBatchSelect);
  const currentCourseSemester = courseSemesterSelect.value;
  const currentCourseSemesterText = getSelectedText(courseSemesterSelect);
  const currentSpecialization = specializationSelect.value;
  const currentSpecializationText = getSelectedText(specializationSelect);
  const currentCourse = courseSelect.value;
  const currentCourseText = getSelectedText(courseSelect);

  if (state.programs?.length) {
    saveCachedPrograms(state.programs);
    fillProgramsWithSelection(
      state.programs,
      adoptProgram && state.programValue ? state.programValue : currentProgram,
      adoptProgram && state.programValue ? state.programText : currentProgramText
    );
  }

  const activeProgram = state.programValue || programSelect.value;

  if (state.programValue && state.academicBatches?.length) {
    saveCachedAcademicBatches(state.programValue, state.academicBatches);
  }

  if (state.academicBatchValue && state.courseSemesters?.length) {
    saveCachedCourseSemesters(state.academicBatchValue, state.courseSemesters);
  }

  if (state.courseSemesterValue && state.specializations?.length) {
    saveCachedSpecializations(state.courseSemesterValue, state.specializations);
  }

  if (state.courseSemesterValue && state.specializationValue && state.courses?.length) {
    saveCachedCourses(state.courseSemesterValue, state.specializationValue, state.courses);
  }

  if (adoptProgram && state.programValue) {
    programSelect.value = state.programValue;
  }

  if (state.academicBatches?.length && activeProgram && programSelect.value === activeProgram) {
    let batchValue = adoptAcademicBatch ? state.academicBatchValue : currentBatch;
    let batchText = adoptAcademicBatch ? state.academicBatchText : currentBatchText;

    if (batchValue && !state.academicBatches.some(o => o.value === batchValue)) {
      batchValue = "";
      batchText = "";
    }

    fillAcademicBatches(
      state.academicBatches,
      batchValue,
      batchText
    );
  } else {
    fillAcademicBatchesForProgram(
      programSelect.value,
      adoptAcademicBatch ? state.academicBatchValue : currentBatch,
      adoptAcademicBatch ? state.academicBatchText : currentBatchText
    );
  }

  if (state.courseSemesters?.length && academicBatchSelect.value === (state.academicBatchValue || academicBatchSelect.value)) {
    let courseSemesterValue = adoptCourseSemester ? state.courseSemesterValue : currentCourseSemester;
    let courseSemesterText = adoptCourseSemester ? state.courseSemesterText : currentCourseSemesterText;

    if (courseSemesterValue && !state.courseSemesters.some(o => o.value === courseSemesterValue)) {
      courseSemesterValue = "";
      courseSemesterText = "";
    }

    fillCourseSemesters(state.courseSemesters, courseSemesterValue, courseSemesterText);
  } else {
    fillCourseSemestersForAcademicBatch(
      academicBatchSelect.value,
      currentCourseSemester,
      currentCourseSemesterText
    );
  }

  if (state.specializations?.length && courseSemesterSelect.value === (state.courseSemesterValue || courseSemesterSelect.value)) {
    let specializationValue = adoptSpecialization ? state.specializationValue : currentSpecialization;
    let specializationText = adoptSpecialization ? state.specializationText : currentSpecializationText;

    if (specializationValue && !state.specializations.some(o => o.value === specializationValue)) {
      specializationValue = "";
      specializationText = "";
    }

    fillSpecializations(state.specializations, specializationValue, specializationText);
  } else {
    fillSpecializationsForCourseSemester(courseSemesterSelect.value, currentSpecialization, currentSpecializationText);
  }

  const activeCourseSemester = courseSemesterSelect.value;
  const activeSpecialization = specializationSelect.value;

  if (state.courses?.length && activeSpecialization && activeSpecialization === (state.specializationValue || activeSpecialization)) {
    let courseValue = adoptCourse ? state.courseValue : currentCourse;
    let courseText = adoptCourse ? state.courseText : currentCourseText;

    if (courseValue && !state.courses.some(o => o.value === courseValue)) {
      courseValue = "";
      courseText = "";
    }

    fillCourses(state.courses, courseValue, courseText);
  } else {
    fillCoursesForSpecialization(
      activeCourseSemester,
      activeSpecialization,
      activeSpecialization ? currentCourse : "",
      activeSpecialization ? currentCourseText : ""
    );
  }

  saveDraft();

  return {
    ok: true,
    programs: state.programs || [],
    academicBatches: state.academicBatches || [],
    courseSemesters: state.courseSemesters || [],
    specializations: state.specializations || [],
    courses: state.courses || [],
    programValue: state.programValue,
    academicBatchValue: state.academicBatchValue,
    courseSemesterValue: state.courseSemesterValue,
    specializationValue: state.specializationValue,
    courseValue: state.courseValue
  };
}

const parseDateString = (value) => {
  const match = (value || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const date = new Date(+yyyy, +mm - 1, +dd);
  return date && date.getFullYear() === +yyyy && date.getMonth() + 1 === +mm && date.getDate() === +dd ? date : null;
};

async function getPageDefaultDate(tabId) {
  const result = await runInTab(tabId, () => {
    const display = document.querySelector("#Body_lbldate")?.textContent?.trim();
    const input =
      document.querySelector("#Body_txtdDAad") ||
      document.querySelector('input[id*="date"],input[name*="date"],input[class*="date"]');
    return {
      displayDate: display || "",
      inputValue: input?.value?.trim() || "",
      hasInput: !!input
    };
  });
  return result?.value || null;
}

async function ensureSiteRadio(tabId, selectors, desiredChecked) {
  const started = Date.now();
  const timeout = 15000;

  while (Date.now() - started < timeout) {
    const result = await runInTab(tabId, ({ selectors, desiredChecked }) => {
      const radio = selectors.map(s => document.querySelector(s)).find(Boolean);
      if (!radio) return { ready: false };
      if (radio.checked === desiredChecked) return { ready: true, selected: true };

      radio.click();
      return { ready: true, selected: false };
    }, [{ selectors, desiredChecked }]);

    if (!result?.ok) {
      await wait(400);
      continue;
    }
    if (result.value?.selected) return true;
    if (result.value?.ready) {
      await wait(400);
      continue;
    }
    await wait(300);
  }

  return false;
}

async function ensurePageAttendanceType(tabId, type) {
  const selectors = type === "lab"
    ? ["#Body_rdLab", 'input[id*="rdLab"]', 'input[value="rdLab"]']
    : ["#Body_rdTheory", 'input[id*="rdTheory"]', 'input[value="rdTheory"]'];
  return ensureSiteRadio(tabId, selectors, true);
}

async function ensurePageDateMode(tabId, usePreviousDate) {
  const selectors = usePreviousDate
    ? ["#Body_rdNextDate", 'input[id*="rdNextDate"]', 'input[value="rdNextDate"]']
    : ["#Body_rdCurrentDate", 'input[id*="rdCurrentDate"]', 'input[value="rdCurrentDate"]'];
  return ensureSiteRadio(tabId, selectors, true);
}

async function ensureSiteDateField(tabId, fullDate) {
  const started = Date.now();
  const timeout = 15000;
  let lastValue = { found: false, matchesDisplay: false };

  while (Date.now() - started < timeout) {
    const result = await runInTab(tabId, ({ fullDate }) => {
      const input =
        document.querySelector("#Body_txtdDAad") ||
        document.querySelector('input[id*="txtdDAad"]') ||
        document.querySelector('input[id*="date"],input[name*="date"],input[class*="date"]');

      const display = document.querySelector("#Body_lbldate")?.textContent?.trim() || "";
      if (display === fullDate && !input) {
        return { found: false, matchesDisplay: true, posted: false };
      }

      if (!input) {
        return { found: false, matchesDisplay: false, ready: false, display };
      }

      if (input.value === fullDate) {
        return { found: true, matchesDisplay: false, set: true, posted: false };
      }

      input.focus();
      input.value = fullDate;
      input.dispatchEvent(new Event("input", { bubbles: true }));

      const raw = (input.getAttribute("onchange") || "").replace(/\\/g, "");
      const m = raw.match(/__doPostBack\('([^']+)'/);
      if (m && window.__doPostBack) {
        window.__doPostBack(m[1], "");
        return { found: true, matchesDisplay: false, set: true, posted: true };
      }

      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.blur();
      return { found: true, matchesDisplay: false, set: true, posted: !!m };
    }, [{ fullDate }]);

    if (!result?.ok) {
      await wait(500);
      continue;
    }

    lastValue = result.value || lastValue;
    if (lastValue.found || lastValue.matchesDisplay) return lastValue;
    await wait(400);
  }

  return { ...lastValue, timedOut: true };
}

async function waitForPageDate(tabId, fullDate) {
  if (!fullDate) return true;

  const started = Date.now();
  const timeout = 15000;
  await wait(800);

  while (Date.now() - started < timeout) {
    const result = await runInTab(tabId, ({ fullDate }) => {
      const input =
        document.querySelector("#Body_txtdDAad") ||
        document.querySelector('input[id*="date"],input[name*="date"],input[class*="date"]');
      const display = document.querySelector("#Body_lbldate")?.textContent?.trim() || "";
      const inputValue = input?.value?.trim() || "";

      return {
        hasDateSignal: !!input || !!display,
        matches: inputValue === fullDate || display === fullDate
      };
    }, [{ fullDate }]);

    if (result?.value?.matches) return true;
    await wait(result?.ok ? 300 : 500);
  }

  return false;
}

async function compareWithPageDefaultDate(tabId, fullDate) {
  const siteDate = await getPageDefaultDate(tabId);
  if (!siteDate) return null;
  const pageValue = siteDate.inputValue || siteDate.displayDate || "";
  const pageDate = parseDateString(pageValue);
  const desiredDate = parseDateString(fullDate);
  if (!desiredDate || !pageDate) return null;
  return desiredDate < pageDate ? -1 : desiredDate > pageDate ? 1 : 0;
}

async function selectProgramAfterDateReload(tabId, fullDate, program) {
  const started = Date.now();
  const timeout = 15000;

  while (Date.now() - started < timeout) {
    const result = await runInTab(tabId, ({ fullDate, program }) => {
      const getOptions = (select) => {
        if (!select) return [];
        return [...select.options]
          .filter(o =>
            o.value &&
            o.value !== "0" &&
            o.value !== "--Select--" &&
            o.text.trim() !== "-- Select --" &&
            o.text.trim() !== "--Select--" &&
            o.text.trim() !== "Select an Option"
          )
          .map(o => ({ value: o.value, text: o.text.trim() }));
      };

      const postBackTarget = (element) => {
        const raw = (element.getAttribute("onchange") || "").replace(/\\/g, "");
        const match = raw.match(/__doPostBack\('([^']+)'/);
        return match?.[1] || "";
      };

      const triggerPostBack = (select) => {
        select.dispatchEvent(new Event("input", { bubbles: true }));
        if (window.jQuery) {
          try { window.jQuery(select).trigger("chosen:updated"); } catch {}
        }

        const target = postBackTarget(select);
        if (target) {
          if (window.__doPostBack) {
            window.__doPostBack(target, "");
          } else {
            select.dispatchEvent(new Event("change", { bubbles: true }));
          }
          return true;
        }

        select.dispatchEvent(new Event("change", { bubbles: true }));
        return false;
      };

      const dateInput =
        document.querySelector("#Body_txtdDAad") ||
        document.querySelector('input[id*="date"],input[name*="date"],input[class*="date"]') ||
        [...document.querySelectorAll('input[type="text"]')].find(x => x.offsetParent);

      const displayDate = document.querySelector("#Body_lbldate")?.textContent?.trim() || "";
      const dateMatches = !fullDate ||
        dateInput?.value?.trim() === fullDate ||
        displayDate === fullDate ||
        (!dateInput && !displayDate);

      const programSelect =
        document.querySelector("#Body_ddlGraduationType") ||
        document.querySelector('select[id*="GraduationType"]') ||
        document.querySelector('select[name*="GraduationType"]');

      if (!dateMatches || !programSelect) return { ready: false };

      const options = getOptions(programSelect);
      if (!options.length) return { ready: false };

      const match = options.find(o => o.value === program);
      if (!match) return { ready: true, selected: false, programs: options };

      if (programSelect.value === program) {
        return { ready: true, selected: true, programs: options };
      }

      programSelect.value = program;
      const posted = triggerPostBack(programSelect);
      return { ready: true, selected: false, posted, programs: options };
    }, [{ fullDate, program }]);

    if (result?.value?.programs?.length) {
      saveCachedPrograms(result.value.programs);
    }

    if (result?.value?.selected) return { selected: true };
    if (result?.value?.ready && !result.value.posted) return { selected: false };

    await wait(result?.value?.posted ? 800 : 300);
  }

  return { selected: false, timedOut: true };
}

async function selectAcademicBatchAfterProgramReload(tabId, fullDate, program, academicBatch) {
  const started = Date.now();
  const timeout = 15000;

  while (Date.now() - started < timeout) {
    const result = await runInTab(tabId, ({ fullDate, program, academicBatch }) => {
      const getOptions = (select) => {
        if (!select) return [];
        return [...select.options]
          .filter(o =>
            o.value &&
            o.value !== "0" &&
            o.value !== "--Select--" &&
            o.text.trim() !== "-- Select --" &&
            o.text.trim() !== "--Select--" &&
            o.text.trim() !== "Select an Option"
          )
          .map(o => ({ value: o.value, text: o.text.trim() }));
      };

      const postBackTarget = (element) => {
        const raw = (element.getAttribute("onchange") || "").replace(/\\/g, "");
        const match = raw.match(/__doPostBack\('([^']+)'/);
        return match?.[1] || "";
      };

      const triggerPostBack = (select) => {
        select.dispatchEvent(new Event("input", { bubbles: true }));
        if (window.jQuery) {
          try { window.jQuery(select).trigger("chosen:updated"); } catch {}
        }

        const target = postBackTarget(select);
        if (target) {
          if (window.__doPostBack) {
            window.__doPostBack(target, "");
          } else {
            select.dispatchEvent(new Event("change", { bubbles: true }));
          }
          return true;
        }

        select.dispatchEvent(new Event("change", { bubbles: true }));
        return false;
      };

      const dateInput =
        document.querySelector("#Body_txtdDAad") ||
        document.querySelector('input[id*="date"],input[name*="date"],input[class*="date"]') ||
        [...document.querySelectorAll('input[type="text"]')].find(x => x.offsetParent);

      const displayDate = document.querySelector("#Body_lbldate")?.textContent?.trim() || "";
      const dateMatches = !fullDate ||
        dateInput?.value?.trim() === fullDate ||
        displayDate === fullDate ||
        (!dateInput && !displayDate);

      const programSelect =
        document.querySelector("#Body_ddlGraduationType") ||
        document.querySelector('select[id*="GraduationType"]') ||
        document.querySelector('select[name*="GraduationType"]');

      const batchSelect =
        document.querySelector("#Body_ddlAcademicBatch") ||
        document.querySelector('select[id*="AcademicBatch"]') ||
        document.querySelector('select[name*="AcademicBatch"]');

      if (
        !dateMatches ||
        !programSelect ||
        programSelect.value !== program ||
        !batchSelect
      ) {
        return { ready: false };
      }

      const options = getOptions(batchSelect);
      if (!options.length) return { ready: false };

      const match = options.find(o => o.value === academicBatch);
      if (!match) return { ready: true, selected: false, academicBatches: options };

      if (batchSelect.value === academicBatch) {
        return { ready: true, selected: true, academicBatches: options };
      }

      batchSelect.value = academicBatch;
      const posted = triggerPostBack(batchSelect);
      return { ready: true, selected: false, posted, academicBatches: options };
    }, [{ fullDate, program, academicBatch }]);

    if (result?.value?.selected) {
      if (result.value.academicBatches?.length) {
        saveCachedAcademicBatches(program, result.value.academicBatches);
      }
      return { selected: true };
    }

    if (result?.value?.ready && !result.value.posted) {
      if (result.value.academicBatches?.length) {
        saveCachedAcademicBatches(program, result.value.academicBatches);
      }
      return { selected: false };
    }

    await wait(result?.value?.posted ? 800 : 300);
  }

  return { selected: false, timedOut: true };
}

async function selectCourseSemesterAfterAcademicBatchReload(tabId, fullDate, program, academicBatch, courseSemester) {
  const started = Date.now();
  const timeout = 15000;

  while (Date.now() - started < timeout) {
    const result = await runInTab(tabId, ({ fullDate, program, academicBatch, courseSemester }) => {
      const getOptions = (select) => {
        if (!select) return [];
        return [...select.options]
          .filter(o =>
            o.value &&
            o.value !== "0" &&
            o.value !== "--Select--" &&
            o.text.trim() !== "-- Select --" &&
            o.text.trim() !== "--Select--" &&
            o.text.trim() !== "Select an Option"
          )
          .map(o => ({ value: o.value, text: o.text.trim() }));
      };

      const postBackTarget = (element) => {
        const raw = (element.getAttribute("onchange") || "").replace(/\\/g, "");
        const match = raw.match(/__doPostBack\('([^']+)'/);
        return match?.[1] || "";
      };

      const triggerPostBack = (select) => {
        select.dispatchEvent(new Event("input", { bubbles: true }));
        if (window.jQuery) {
          try { window.jQuery(select).trigger("chosen:updated"); } catch {}
        }

        const target = postBackTarget(select);
        if (target) {
          if (window.__doPostBack) {
            window.__doPostBack(target, "");
          } else {
            select.dispatchEvent(new Event("change", { bubbles: true }));
          }
          return true;
        }

        select.dispatchEvent(new Event("change", { bubbles: true }));
        return false;
      };

      const dateInput =
        document.querySelector("#Body_txtdDAad") ||
        document.querySelector('input[id*="date"],input[name*="date"],input[class*="date"]') ||
        [...document.querySelectorAll('input[type="text"]')].find(x => x.offsetParent);

      const displayDate = document.querySelector("#Body_lbldate")?.textContent?.trim() || "";
      const dateMatches = !fullDate ||
        dateInput?.value?.trim() === fullDate ||
        displayDate === fullDate ||
        (!dateInput && !displayDate);

      const programSelect =
        document.querySelector("#Body_ddlGraduationType") ||
        document.querySelector('select[id*="GraduationType"]') ||
        document.querySelector('select[name*="GraduationType"]');

      const batchSelect =
        document.querySelector("#Body_ddlAcademicBatch") ||
        document.querySelector('select[id*="AcademicBatch"]') ||
        document.querySelector('select[name*="AcademicBatch"]');

      const courseSemesterSelect =
        document.querySelector("#Body_ddlcourseyearsem") ||
        document.querySelector('select[id*="ddlcourseyearsem"]') ||
        document.querySelector('select[name*="ddlcourseyearsem"]') ||
        document.querySelector('select[id*="courseyearsem"]') ||
        document.querySelector('select[name*="courseyearsem"]');

      if (
        !dateMatches ||
        !programSelect ||
        programSelect.value !== program ||
        !batchSelect ||
        batchSelect.value !== academicBatch ||
        !courseSemesterSelect
      ) {
        return { ready: false };
      }

      const options = getOptions(courseSemesterSelect);
      if (!options.length) return { ready: false };

      const match = options.find(o => o.value === courseSemester);
      if (!match) return { ready: true, selected: false, courseSemesters: options };

      if (courseSemesterSelect.value === courseSemester) {
        return { ready: true, selected: true, courseSemesters: options };
      }

      courseSemesterSelect.value = courseSemester;
      const posted = triggerPostBack(courseSemesterSelect);
      return { ready: true, selected: false, posted, courseSemesters: options };
    }, [{ fullDate, program, academicBatch, courseSemester }]);

    if (result?.value?.selected) {
      if (result.value.courseSemesters?.length) {
        saveCachedCourseSemesters(academicBatch, result.value.courseSemesters);
      }
      return { selected: true };
    }

    if (result?.value?.ready && !result.value.posted) {
      if (result.value.courseSemesters?.length) {
        saveCachedCourseSemesters(academicBatch, result.value.courseSemesters);
      }
      return { selected: false };
    }

    await wait(result?.value?.posted ? 800 : 300);
  }

  return { selected: false, timedOut: true };
}

async function selectSpecializationAfterCourseSemesterReload(tabId, fullDate, program, academicBatch, courseSemester, specialization) {
  const started = Date.now();
  const timeout = 15000;

  while (Date.now() - started < timeout) {
    const result = await runInTab(tabId, ({ fullDate, program, academicBatch, courseSemester, specialization }) => {
      const getOptions = (select) => {
        if (!select) return [];
        return [...select.options]
          .filter(o =>
            o.value &&
            o.value !== "0" &&
            o.value !== "--Select--" &&
            o.text.trim() !== "-- Select --" &&
            o.text.trim() !== "--Select--" &&
            o.text.trim() !== "Select an Option"
          )
          .map(o => ({ value: o.value, text: o.text.trim() }));
      };

      const postBackTarget = (element) => {
        const raw = (element.getAttribute("onchange") || "").replace(/\\/g, "");
        const match = raw.match(/__doPostBack\('([^']+)'/);
        return match?.[1] || "";
      };

      const triggerPostBack = (select) => {
        select.dispatchEvent(new Event("input", { bubbles: true }));
        if (window.jQuery) {
          try { window.jQuery(select).trigger("chosen:updated"); } catch {}
        }

        const target = postBackTarget(select);
        if (target) {
          if (window.__doPostBack) {
            window.__doPostBack(target, "");
          } else {
            select.dispatchEvent(new Event("change", { bubbles: true }));
          }
          return true;
        }

        select.dispatchEvent(new Event("change", { bubbles: true }));
        return false;
      };

      const q = s => document.querySelector(s);
      const dateInput = q("#Body_txtdDAad") || q('input[id*="date"],input[name*="date"],input[class*="date"]') || [...document.querySelectorAll('input[type="text"]')].find(x => x.offsetParent);
      const displayDate = q("#Body_lbldate")?.textContent?.trim() || "";
      const dateMatches = !fullDate || dateInput?.value?.trim() === fullDate || displayDate === fullDate || (!dateInput && !displayDate);
      const programSelect = q("#Body_ddlGraduationType") || q('select[id*="GraduationType"]') || q('select[name*="GraduationType"]');
      const batchSelect = q("#Body_ddlAcademicBatch") || q('select[id*="AcademicBatch"]') || q('select[name*="AcademicBatch"]');
      const courseSelect = q("#Body_ddlcourseyearsem") || q('select[id*="ddlcourseyearsem"]') || q('select[name*="ddlcourseyearsem"]') || q('select[id*="courseyearsem"]') || q('select[name*="courseyearsem"]');
      const specSelect = q("#Body_ddlBranch") || q('select[id*="ddlBranch"]') || q('select[name*="ddlBranch"]') || q('select[id*="Branch"]') || q('select[name*="Branch"]');

      if (!dateMatches || !programSelect || programSelect.value !== program || !batchSelect || batchSelect.value !== academicBatch || !courseSelect || courseSelect.value !== courseSemester || !specSelect) {
        return { ready: false };
      }

      const options = getOptions(specSelect);
      if (!options.length) return { ready: false };

      const match = options.find(o => o.value === specialization);
      if (!match) return { ready: true, selected: false, specializations: options };

      if (specSelect.value === specialization) {
        return { ready: true, selected: true, specializations: options };
      }

      specSelect.value = specialization;
      const posted = triggerPostBack(specSelect);
      return { ready: true, selected: false, posted, specializations: options };
    }, [{ fullDate, program, academicBatch, courseSemester, specialization }]);

    if (result?.value?.selected) {
      if (result.value.specializations?.length) saveCachedSpecializations(courseSemester, result.value.specializations);
      return { selected: true };
    }

    if (result?.value?.ready && !result.value.posted) {
      if (result.value.specializations?.length) saveCachedSpecializations(courseSemester, result.value.specializations);
      return { selected: false };
    }

    await wait(result?.value?.posted ? 800 : 300);
  }

  return { selected: false, timedOut: true };
}

async function selectCourseAfterSpecializationReload(tabId, fullDate, program, academicBatch, courseSemester, specialization, course) {
  const started = Date.now();
  const timeout = 15000;

  while (Date.now() - started < timeout) {
    const result = await runInTab(tabId, ({ fullDate, program, academicBatch, courseSemester, specialization, course }) => {
      const getOptions = (select) => {
        if (!select) return [];
        return [...select.options]
          .filter(o =>
            o.value &&
            o.value !== "0" &&
            o.value !== "--Select--" &&
            o.text.trim() !== "-- Select --" &&
            o.text.trim() !== "--Select--" &&
            o.text.trim() !== "Select an Option"
          )
          .map(o => ({ value: o.value, text: o.text.trim() }));
      };

      const postBackTarget = (element) => {
        const raw = (element.getAttribute("onchange") || "").replace(/\\/g, "");
        const match = raw.match(/__doPostBack\('([^']+)'/);
        return match?.[1] || "";
      };

      const triggerPostBack = (select) => {
        select.dispatchEvent(new Event("input", { bubbles: true }));
        if (window.jQuery) {
          try { window.jQuery(select).trigger("chosen:updated"); } catch {}
        }

        const target = postBackTarget(select);
        if (target) {
          if (window.__doPostBack) {
            window.__doPostBack(target, "");
          } else {
            select.dispatchEvent(new Event("change", { bubbles: true }));
          }
          return true;
        }

        select.dispatchEvent(new Event("change", { bubbles: true }));
        return false;
      };

      const q = s => document.querySelector(s);
      const dateInput = q("#Body_txtdDAad") || q('input[id*="date"],input[name*="date"],input[class*="date"]') || [...document.querySelectorAll('input[type="text"]')].find(x => x.offsetParent);
      const displayDate = q("#Body_lbldate")?.textContent?.trim() || "";
      const dateMatches = !fullDate || dateInput?.value?.trim() === fullDate || displayDate === fullDate || (!dateInput && !displayDate);
      const programSelect = q("#Body_ddlGraduationType") || q('select[id*="GraduationType"]') || q('select[name*="GraduationType"]');
      const batchSelect = q("#Body_ddlAcademicBatch") || q('select[id*="AcademicBatch"]') || q('select[name*="AcademicBatch"]');
      const courseSemesterSelect = q("#Body_ddlcourseyearsem") || q('select[id*="ddlcourseyearsem"]') || q('select[name*="ddlcourseyearsem"]') || q('select[id*="courseyearsem"]') || q('select[name*="courseyearsem"]');
      const specSelect = q("#Body_ddlBranch") || q('select[id*="ddlBranch"]') || q('select[name*="ddlBranch"]') || q('select[id*="Branch"]') || q('select[name*="Branch"]');
      const courseSelect = q("#Body_ddlsubject") || q('select[id*="ddlsubject"]') || q('select[name*="ddlsubject"]') || q('select[id*="subject"]') || q('select[name*="subject"]');

      if (!dateMatches || !programSelect || programSelect.value !== program || !batchSelect || batchSelect.value !== academicBatch || !courseSemesterSelect || courseSemesterSelect.value !== courseSemester || !specSelect || specSelect.value !== specialization || !courseSelect) {
        return { ready: false };
      }

      const options = getOptions(courseSelect);
      if (!options.length) return { ready: false };

      const match = options.find(o => o.value === course);
      if (!match) return { ready: true, selected: false, courses: options };

      if (courseSelect.value === course) {
        return { ready: true, selected: true, courses: options };
      }

      courseSelect.value = course;
      const posted = triggerPostBack(courseSelect);
      return { ready: true, selected: false, posted, courses: options };
    }, [{ fullDate, program, academicBatch, courseSemester, specialization, course }]);

    if (result?.value?.selected) {
      if (result.value.courses?.length) saveCachedCourses(courseSemester, specialization, result.value.courses);
      return { selected: true };
    }

    if (result?.value?.ready && !result.value.posted) {
      if (result.value.courses?.length) saveCachedCourses(courseSemester, specialization, result.value.courses);
      return { selected: false };
    }

    await wait(result?.value?.posted ? 800 : 300);
  }

  return { selected: false, timedOut: true };
}

async function loadPrograms() {
  const cached = getCachedPrograms();
  if (cached.length) fillPrograms(cached);
  loadDraftState();

  const result = await runInPage(() => {
    const select =
      document.querySelector("#Body_ddlGraduationType") ||
      document.querySelector('select[id*="GraduationType"]') ||
      document.querySelector('select[name*="GraduationType"]');

    if (!select) return [];

    return [...select.options]
      .filter(o =>
        o.value &&
        o.value !== "0" &&
        o.text.trim() !== "-- Select --" &&
        o.text.trim() !== "--Select--" &&
        o.text.trim() !== "Select an Option"
      )
      .map(o => ({ value: o.value, text: o.text.trim() }));
  });

  const fresh = result?.value;

  if (fresh?.length) {
    saveCachedPrograms(fresh);
    fillPrograms(fresh);
    loadDraftState();
  }

  await loadAcademicBatches();
}

async function loadAcademicBatches() {
  const selectedProgram = programSelect.value;
  const selectedBatch = academicBatchSelect.value;
  const selectedBatchText = getSelectedText(academicBatchSelect);

  if (selectedProgram) {
    fillAcademicBatchesForProgram(selectedProgram, selectedBatch, selectedBatchText);
  } else {
    fillAcademicBatchesForProgram("");
  }

  const result = await readSiteFilters();
  const siteProgram = result?.value?.programValue;
  const fresh = result?.value?.academicBatches;

  if (siteProgram && fresh?.length) {
    saveCachedAcademicBatches(siteProgram, fresh);

    if (programSelect.value === siteProgram) {
      const stillExists = fresh.some(o => o.value === selectedBatch);
      fillAcademicBatches(fresh, stillExists ? selectedBatch : "");
      if (selectedBatch && !stillExists) saveDraft();
    }
  }
}

refreshBtn.addEventListener("click", () => runWithBusy(refreshBtn, "Resetting...", async () => {
  const confirmed = await awaitContinueConfirmation(
    "This clears the current extension draft and removes the floating box from the website. Saved selections, cached options, recent dates, and year stay saved.",
    "Reset working state?"
  );
  if (!confirmed) return showMessage("Reset cancelled", "error");

  const cachedPrograms = getCachedPrograms();

  dateInput.value = "";
  fillPrograms(cachedPrograms);
  fillAcademicBatchesForProgram("");
  fillCourseSemestersForAcademicBatch("");
  fillSpecializationsForCourseSemester("");
  fillCoursesForSpecialization("", "");

  write(KEYS.draft, {
    date: "",
    program: "",
    programText: "",
    academicBatch: "",
    academicBatchText: "",
    courseSemester: "",
    courseSemesterText: "",
    specializationValue: "",
    specializationText: "",
    courseValue: "",
    courseText: "",
    attendanceType: "theory"
  });

  yearInput.value = getYear();

  const previous = await storageGet(WEBSITE_PANEL_KEY, {});
  await storageSet(WEBSITE_PANEL_KEY, { ...previous, enabled: false });
  await storageSet(WEBSITE_PANEL_JOB_KEY, null);
  await refreshWebsitePanelOnActiveTab();

  location.reload();
}));

saveDefaultBtn.addEventListener("click", () => {
  const programValue = programSelect.value;
  const academicBatchValue = academicBatchSelect.value;

  if (!programValue) return showMessage("Select a program first", "error");
  if (!academicBatchValue) return showMessage("Select an academic batch first", "error");

  openSaveModal({
    programValue,
    programText: getSelectedText(programSelect),
    academicBatchValue,
    academicBatchText: getSelectedText(academicBatchSelect),
    courseSemesterValue: courseSemesterSelect.value,
    courseSemesterText: getSelectedText(courseSemesterSelect),
    specializationValue: specializationSelect.value,
    specializationText: getSelectedText(specializationSelect),
    courseValue: courseSelect.value,
    courseText: getSelectedText(courseSelect)
  });
});

const handleSetFilters = async () => {
  const raw = dateInput.value.trim();
  const year = yearInput.value.trim() || DEFAULT_YEAR;
  const program = programSelect.value;
  const academicBatch = academicBatchSelect.value;
  const courseSemester = courseSemesterSelect.value;
  const specialization = specializationSelect.value;
  const course = courseSelect.value;
  const attendanceType = getSelectedAttendanceType();
  const hasDate = raw !== "";

  if (academicBatch && !program) return showMessage("Select a program first", "error");
  if (courseSemester && !academicBatch) return showMessage("Select an academic batch first", "error");
  if (specialization && !courseSemester) return showMessage("Select course year / semester first", "error");
  if (course && !specialization) return showMessage("Select specialization first", "error");

  let fullDate = "";
  let expectedDateOnPage = "";

  if (hasDate) {
    if (!/^\d{2}\/\d{2}$/.test(raw)) return showMessage("Enter date as dd/mm", "error");
    if (!/^\d{4}$/.test(year)) return showMessage("Enter a valid year", "error");

    const [dd, mm] = raw.split("/");
    if (!isValidDate(dd, mm, year)) return showMessage("Invalid calendar date", "error");

    setYear(year);
    fullDate = `${dd}/${mm}/${year}`;
    expectedDateOnPage = fullDate;
  } else {
    const proceed = await awaitContinueConfirmation(
      "No date entered. Continue without setting date?",
      "Continue without date?"
    );
    if (!proceed) return showMessage("Cancelled", "error");
  }

  saveDraft();

  const tab = await getActiveTab();
  if (!tab?.id || !tab.url) return showMessage("Open the attendance site first", "error");

  const attendanceSet = await ensurePageAttendanceType(tab.id, attendanceType);
  if (!attendanceSet) return showMessage("Unable to set Theory/Lab on the attendance page", "error");

  if (hasDate) {
    const comparison = await compareWithPageDefaultDate(tab.id, fullDate);
    if (comparison !== null) {
      const wouldUsePrevious = comparison === -1;
      const modeSet = await ensurePageDateMode(tab.id, wouldUsePrevious);
      if (!modeSet) return showMessage("Could not set current/previous date on the attendance page", "error");
    }

    const dateResult = await ensureSiteDateField(tab.id, fullDate);
    if (!dateResult.found && !dateResult.matchesDisplay) {
      return showMessage(
        dateResult.timedOut
          ? "Date field did not appear on the attendance page"
          : "Date field not found on the attendance page",
        "error"
      );
    }

    await saveRecentDate(raw);

    if (!program && expectedDateOnPage && dateResult.posted) {
      const dateReady = await waitForPageDate(tab.id, expectedDateOnPage);
      if (!dateReady) return showMessage("Date did not finish applying on the attendance page", "error");
    }
  }

  if (program) {
    const programResult = await selectProgramAfterDateReload(tab.id, expectedDateOnPage, program);

    if (!programResult.selected) {
      if (programResult.timedOut) await loadPrograms();
      else fillPrograms(getCachedPrograms());

      programSelect.value = "";
      fillAcademicBatchesForProgram("");
      fillCourseSemestersForAcademicBatch("");
      fillSpecializationsForCourseSemester("");
      fillCoursesForSpecialization("", "");
      saveDraft();
      return showMessage("Program changed on site. Re-select it once.", "error");
    }

    if (academicBatch) {
      const batchResult = await selectAcademicBatchAfterProgramReload(
        tab.id,
        expectedDateOnPage,
        program,
        academicBatch
      );

      if (!batchResult.selected) {
        if (batchResult.timedOut) await loadAcademicBatches();
        fillAcademicBatchesForProgram(program);
        academicBatchSelect.value = "";
        fillCourseSemestersForAcademicBatch("");
        fillSpecializationsForCourseSemester("");
        fillCoursesForSpecialization("", "");
        saveDraft();
        return showMessage("Academic batch changed on site. Re-select it once.", "error");
      }

      if (courseSemester) {
        const courseResult = await selectCourseSemesterAfterAcademicBatchReload(
          tab.id,
          expectedDateOnPage,
          program,
          academicBatch,
          courseSemester
        );

        if (!courseResult.selected) {
          fillCourseSemestersForAcademicBatch(academicBatch);
          fillSpecializationsForCourseSemester("");
          fillCoursesForSpecialization("", "");
          courseSemesterSelect.value = "";
          saveDraft();
          return showMessage("Course year / semester changed on site. Re-select it once.", "error");
        }

        if (specialization) {
          const specResult = await selectSpecializationAfterCourseSemesterReload(
            tab.id,
            expectedDateOnPage,
            program,
            academicBatch,
            courseSemester,
            specialization
          );

          if (!specResult.selected) {
            fillSpecializationsForCourseSemester(courseSemester);
            specializationSelect.value = "";
            fillCoursesForSpecialization("", "");
            saveDraft();
            return showMessage("Specialization changed on site. Re-select it once.", "error");
          }

          if (course) {
            const courseFilterResult = await selectCourseAfterSpecializationReload(
              tab.id,
              expectedDateOnPage,
              program,
              academicBatch,
              courseSemester,
              specialization,
              course
            );

            if (!courseFilterResult.selected) {
              fillCoursesForSpecialization(courseSemester, specialization);
              courseSelect.value = "";
              saveDraft();
              return showMessage("Course changed on site. Re-select it once.", "error");
            }
          }
        }
      }
    }
  }

  if (!program) {
    await loadPrograms();
  }

  loadDraftState();

  showMessage("Filters applied", "success");
};

setDateBtn.addEventListener("click", () => runWithBusy(setDateBtn, "Applying...", handleSetFilters));

loadPersistentState();
loadPrograms();
mergeWebsiteDateHistory()
  .catch(() => {})
  .finally(() => {
    syncWebsiteDateHistory();
    renderDateHistory();
  });
renderPresets();
