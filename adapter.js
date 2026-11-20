/* Runs in the page's MAIN world, so ASP.NET and Chosen receive real change events. */
(() => {
  "use strict";
  if (window.__classFlowAdapter?.version === 5) return;
  const pageId = crypto.randomUUID();
  let revision = 0;
  let requestBusy = false;
  let active = false;
  let managerRef = null;
  let manualCancelled = false;
  let lastSnapshot = null;
  const regularIds = {
    program: "Body_ddlGraduationType",
    batch: "Body_ddlAcademicBatch", semester: "Body_ddlcourseyearsem",
    specialization: "Body_ddlBranch", course: "Body_ddlsubject",
    section: "Body_ChklstSection", session: "Body_ddlperiod"
  };
  const remedialIds = { attendanceType: "Body_dwdlAttendanceType", specialization: "Body_ddlBranchRemidial", course: "Body_ddlsubject", section: "Body_lstBxSection", period: "Body_ddlperiod" };
  const radioIds = { current: "Body_rdCurrentDate", previous: "Body_rdNextDate", theory: "Body_rdTheory", lab: "Body_rdLab" };
  const pageType = () => /JVPL_Remedial_Class_Attendance\.aspx$/i.test(location.pathname) ? "remedial" : /JVPL_Regular_Class_Attendance\.aspx$/i.test(location.pathname) ? "regular" : "table";
  const activeIds = () => pageType() === "remedial" ? remedialIds : regularIds;
  const byId = id => document.getElementById(id) || document.querySelector(`[id$="_${id.replace(/^Body_/, "")}"]`);
  const clean = text => String(text || "").replace(/\s+/g, " ").trim();
  const placeholder = o => !o.value || o.value === "0" || /^(?:-+\s*)?select(?:\s+an?\s+option)?(?:\s*-+)?$/i.test(o.label);
  const hasPostback = element => /__doPostBack|WebForm_DoPostBackWithOptions/i.test(`${element?.getAttribute("onchange")} ${element?.getAttribute("onclick")}`);
  const dateInput = () => byId("Body_txtdDAad") || (pageType() === "remedial" ? document.querySelector('input[type="text"][id*="txtxFromDate"]') : null);
  const getManager = () => window.Sys?.WebForms?.PageRequestManager?.getInstance?.();
  const beginRequest = () => { requestBusy = true; };
  const endRequest = () => { requestBusy = false; revision++; };
  function hookRequests() {
    if (managerRef) return managerRef;
    const manager = getManager();
    if (!manager) return null;
    if (!["add_beginRequest", "add_endRequest", "remove_beginRequest", "remove_endRequest"].every(key => typeof manager[key] === "function")) return manager;
    manager.add_beginRequest(beginRequest);
    manager.add_endRequest(endRequest);
    managerRef = manager;
    return manager;
  }
  const nativeSelector = Object.values({...regularIds, ...remedialIds}).concat(Object.values(radioIds), ["Body_txtdDAad"]).map(id => `#${id}`).join(",");
  const manual = event => {
    const target = event.target;
    if (event.isTrusted && target instanceof Element && (target.matches(nativeSelector) || (pageType() === "remedial" && target.matches('input[type="text"][id*="txtxFromDate"]'))
      || target.closest("label")?.control?.matches(nativeSelector)
      || target.closest(".chzn-container,.chosen-container,.multiselect-native-select,#Body_ChklstSection,[id$=\"_gdvStudents\"]"))) manualCancelled = true;
  };
  function start() {
    if (active) return;
    active = true;
    hookRequests();
    document.addEventListener("pointerdown", manual, { capture: true, passive: true });
    document.addEventListener("keydown", manual, { capture: true, passive: true });
  }
  function stop() {
    try {
      const manager = managerRef;
      managerRef = null;
      if (manager) {
        try { manager.remove_beginRequest(beginRequest); }
        finally { manager.remove_endRequest(endRequest); }
      }
    } finally {
      if (active) {
        document.removeEventListener("pointerdown", manual, true);
        document.removeEventListener("keydown", manual, true);
      }
      active = false;
      delete window.__classFlowAdapter;
      delete window.ClassFlowAttendance;
    }
  }
  function checkboxOptions(container) {
    return [...container.querySelectorAll('input[type="checkbox"]')].map(input => ({
      element: input, value: input.value,
      label: clean(document.querySelector(`label[for="${CSS.escape(input.id)}"]`)?.textContent || input.parentElement.textContent),
      selected: input.checked, disabled: input.disabled
    }));
  }
  function fieldState(key) {
    const element = byId(activeIds()[key]);
    if (!element) return { found: false, options: [], selected: [], disabled: false };
    const all = element.tagName === "SELECT" ? [...element.options].map(option => ({
      value: option.value, label: clean(option.textContent), selected: option.selected, disabled: option.disabled
    })) : checkboxOptions(element);
    const unavailable = option => /^(?:(?:there\s+(?:is|are)\s+)?no\s+(?:subjects?|classes|class|courses?|sessions?|sections?|options?|records?|data)\b|(?:subjects?|classes|courses?)\s+(?:are\s+)?not\s+available\b)/i.test(option.label);
    const options = all.filter(option => !placeholder(option) && !unavailable(option)).map(({ value, label, disabled }) => ({ value, label, disabled }));
    const siteMessage = !options.length ? all.find(unavailable)?.label || "" : "";
    return { found: true, options, siteMessage, selected: all.filter(option => option.selected && !placeholder(option) && !unavailable(option)).map(({ value, label }) => ({ value, label })),
      disabled: element.disabled || false, posts: hasPostback(element) || all.some(option => option.element && hasPostback(option.element)) };
  }
  function read() {
    if (manualCancelled) return { manualCancelled: true };
    const manager = active ? hookRequests() : getManager();
    const busy = document.readyState === "loading" || requestBusy || Boolean(manager?.get_isInAsyncPostBack?.());
    if (busy && lastSnapshot) return { ...lastSnapshot, busy: true, readAt: Date.now() };
    const input = dateInput();
    const ids = activeIds();
    const fields = Object.fromEntries(Object.keys(ids).map(key => [key, fieldState(key)]));
    const dateMode = byId(radioIds.previous)?.checked ? "previous" : byId(radioIds.current)?.checked ? "current" : "";
    const classType = pageType() === "regular" ? (byId(radioIds.lab)?.checked ? "lab" : byId(radioIds.theory)?.checked ? "theory" : "") : "";
    const account = clean(byId("Body_lbllecturer")?.textContent || byId("Body_lblFaculty")?.textContent || byId("Body_lblLecturer")?.textContent ||
      [...document.querySelectorAll("span.label, span.badge")].find(element => /@/.test(element.textContent))?.textContent || "current-lecturer");
    const alerts = [...document.querySelectorAll('.alert, [role="alert"], #Body_lblmsg, #Body_lblMessage')]
      .map(element => clean(element.textContent)).filter(text => /already.*(?:attendance|entered)|attendance.*already/i.test(text));
    const tablePage = Boolean(byId("Body_gdvStudents"));
    lastSnapshot = { attendancePage: /JVPL_(?:Regular|Remedial)_Class_Attendance\.aspx$/i.test(location.pathname) && (pageType() === "remedial" ? fields.attendanceType.found : fields.program.found),
      tablePage, pagePath: location.pathname, pageType: pageType(), origin: location.origin, account, pageId, revision,
      busy,
      dateMode, classType, date: clean(input?.value || byId("Body_lbldate")?.textContent), hasDateInput: !!input,
      radios: Object.fromEntries(Object.entries(radioIds).map(([key, id]) => [key, !!byId(id)])),
      fields, alreadyRecorded: alerts[0] || "", readAt: Date.now() };
    return lastSnapshot;
  }
  function studentRows() {
    const table = byId("Body_gdvStudents");
    if (!table) return { students:[], rosterError:"Select a session and load the student list first." };
    if (table.querySelector('a[href*="Page$"]')) return { students:[], rosterError:"The student list is paginated. Load the full list before copying attendance." };
    const headings = [...table.querySelectorAll("tr")].find(row=>row.querySelector("th"));
    const labels = headings ? [...headings.cells].map(cell=>clean(cell.textContent).toLowerCase()) : [];
    const usnIndex=labels.indexOf("student usn"), registrationIndex=labels.indexOf("registration no");
    if (usnIndex<0 || registrationIndex<0) return {students:[],rosterError:"Could not identify Student USN and Registration No columns."};
    const students=[];
    for (const row of table.querySelectorAll("tr")) {
      if (row.querySelector("th")) continue;
      const checkbox=row.querySelector('input[type="checkbox"][id*="chckselect"]');
      if (!checkbox) {
        if (row.cells[usnIndex]?.textContent.trim()) return {students:[],rosterError:"A student row has no readable attendance checkbox."};
        continue;
      }
      students.push({usn:clean(row.cells[usnIndex]?.textContent),registration:clean(row.cells[registrationIndex]?.textContent),present:checkbox.checked,disabled:checkbox.disabled,element:checkbox});
    }
    return {students,rosterError:""};
  }
  function attendanceRead() {
    const snapshot=read();
    if (snapshot.manualCancelled || snapshot.busy) return snapshot;
    const {students,rosterError}=studentRows();
    return {...snapshot,rosterError,students:students.map(({element,...student})=>student)};
  }
  function studentListRead() { return attendanceRead(); }
  function studentListAct({ usn, present }) {
    if (!active || manualCancelled) throw new Error("Student-list application stopped. Try again when the page is ready.");
    const current = attendanceRead();
    if (current.manualCancelled || current.busy) throw new Error("Wait for the student table to finish refreshing.");
    const rows = studentRows().students;
    const row = rows.find(student => student.usn.toUpperCase() === String(usn || "").trim().toUpperCase());
    if (!row) throw new Error(`Student USN ${usn} is no longer in the table.`);
    if (row.element.disabled) throw new Error(`Student ${row.usn} cannot be changed because its checkbox is disabled.`);
    if (row.present === Boolean(present)) return { posted:false };
    const posted = hasPostback(row.element);
    row.element.addEventListener("click", event => event.stopPropagation(), { once:true });
    row.element.click();
    return { posted };
  }
  function attendanceAct({copy,target}) {
    if (!active || manualCancelled) throw new Error("Attendance application stopped. Try again when the page is ready.");
    const next=window.ClassFlowAttendance.plan(copy,attendanceRead(),target);
    if (next.type==="error") throw new Error(next.message);
    if (next.type==="done") return {posted:false};
    const rows=studentRows().students;
    const row=rows.find(student=>student.usn.toUpperCase()===next.usn && student.registration.toUpperCase()===next.registration);
    if (!row || rows.some(student=>student.element.disabled)) throw new Error("The student row changed. Stopped; review the page.");
    const desired=new Map(copy.students.map(student=>[student.usn.trim().toUpperCase(),student]));
    // Restore the WHOLE pattern, including present students accidentally unticked here.
    // Leave one differing checkbox for a native click so ASP.NET submits the full form.
    // Do not fire a separate postback for every other checkbox.
    for (const student of rows) {
      if (student.element !== row.element) student.element.checked=desired.get(student.usn.toUpperCase()).present;
    }
    const posted=hasPostback(row.element);
    // Preserve the checkbox's own postback, without the row's Select$ postback.
    row.element.addEventListener("click",event=>event.stopPropagation(),{once:true});
    row.element.click();
    return {posted};
  }
  function change(element) {
    const posted = hasPostback(element);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    // Native postback first, exactly once. Cosmetic legacy plugins cannot block it.
    element.dispatchEvent(new Event("change", { bubbles: true }));
    if (!posted && window.jQuery) {
      try {
      // Both plugin names are used by different releases of Chosen.
      window.jQuery(element).trigger("chosen:updated").trigger("liszt:updated");
      if (element.id === activeIds().section && window.jQuery.fn?.multiselect) {
        try { window.jQuery(element).multiselect("refresh"); } catch { /* not initialized */ }
      }
      } catch { /* A stale jQuery plugin must not block the native change. */ }
    }
    return { posted };
  }
  function setMultiple(element, values) {
    const desired = new Set(values);
    const inlineChange = element.getAttribute("onchange");
    const wrapper = element.closest(".multiselect-native-select");
    try {
      // bootstrap-multiselect owns the visible checkboxes. Drive those inputs
      // with the page callback temporarily disabled, then post the final set.
      if (wrapper) {
        const toggle = wrapper.querySelector("button.multiselect.dropdown-toggle");
        if (toggle && toggle.getAttribute("aria-expanded") !== "true") toggle.click();
        element.removeAttribute("onchange");
      }
      for (const option of element.options) {
        const checkbox = wrapper?.querySelector(`input[type="checkbox"][value="${CSS.escape(option.value)}"]`);
        const selected = desired.has(option.value);
        if (checkbox && checkbox.checked !== selected) checkbox.click();
        else option.selected = selected;
      }
    } finally {
      if (inlineChange !== null) element.setAttribute("onchange", inlineChange);
    }
    return change(element);
  }
  function act(action) {
    if (manualCancelled) throw new Error("Manual filter input stopped this run.");
    if (!active) throw new Error("Start filter application first.");
    if (!read().attendancePage) throw new Error("Open a Jain ERP attendance page first.");
    if (action.field === "dateMode" || action.field === "classType") {
      const allowed = action.field === "dateMode" ? ["current", "previous"] : ["theory", "lab"];
      if (action.field === "classType" && pageType() === "remedial") throw new Error("Remedial attendance does not use Theory or Lab.");
      if (!allowed.includes(action.value)) throw new Error("Unsupported radio selection.");
      const radio = byId(radioIds[action.value]);
      if (!radio || radio.disabled) throw new Error("This radio option is unavailable.");
      const posted = hasPostback(radio);
      if (!radio.checked) radio.click();
      return { posted };
    }
    if (action.field === "date") {
      const element = dateInput();
      if (!element || !/^\d{2}\/\d{2}\/\d{4}$/.test(action.value)) throw new Error("Previous date field is unavailable.");
      element.value = action.value;
      return change(element);
    }
    const ids = activeIds();
    if (["sectionClear", "sectionSelect"].includes(action.field)) {
      if (pageType() !== "remedial") throw new Error("Section refresh is available on the remedial attendance page only.");
      const values = action.field === "sectionClear" ? [] : action.values;
      if (!Array.isArray(values) || (action.field === "sectionSelect" && !values.length)) throw new Error("The remedial Section selection could not be updated.");
      const element = byId(remedialIds.section);
      const live = fieldState("section");
      if (!element || element.disabled || values.some(value => !live.options.some(option => option.value === value && !option.disabled))) throw new Error("The remedial Section options changed before Period No could be populated.");
      return setMultiple(element, values);
    }
    if (!Object.hasOwn(ids, action.field) || !Array.isArray(action.values)) throw new Error("Unsupported field.");
    const element = byId(ids[action.field]);
    const live = fieldState(action.field);
    if (!element || element.disabled || action.values.some(value => !live.options.some(option => option.value === value && !option.disabled))) {
      throw new Error("The website changed before the selection could be applied. Try again.");
    }
    if (element.tagName === "SELECT") {
      if (!element.multiple && action.values.length !== 1) throw new Error("Choose exactly one option.");
      if (pageType() === "remedial" && action.field === "section") return setMultiple(element, action.values);
      for (const option of element.options) option.selected = action.values.includes(option.value);
      return change(element);
    }
    // ASP.NET CheckBoxList can post back for every individual checkbox.
    // Toggle one per round trip; the runner verifies the entire set afterward.
    const item = checkboxOptions(element).find(option => option.selected !== action.values.includes(option.value));
    if (!item) return { posted: false };
    const posted = hasPostback(item.element);
    item.element.click();
    return { posted };
  }
  window.__classFlowAdapter = { version: 5, read, act, attendanceRead, attendanceAct, studentListRead, studentListAct, start, stop };
})();
