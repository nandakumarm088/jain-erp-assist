/* Runs in the page's MAIN world, so ASP.NET and Chosen receive real change events. */
(() => {
  "use strict";
  if (window.__classFlowAdapter?.version === 3) return;
  const pageId = crypto.randomUUID();
  let revision = 0;
  let requestBusy = false;
  let active = false;
  let managerRef = null;
  let manualCancelled = false;
  let lastSnapshot = null;
  const ids = {
    program: "Body_ddlGraduationType",
    batch: "Body_ddlAcademicBatch", semester: "Body_ddlcourseyearsem",
    specialization: "Body_ddlBranch", course: "Body_ddlsubject",
    section: "Body_ChklstSection", session: "Body_ddlperiod"
  };
  const radioIds = { current: "Body_rdCurrentDate", previous: "Body_rdNextDate", theory: "Body_rdTheory", lab: "Body_rdLab" };
  const byId = id => document.getElementById(id) || document.querySelector(`[id$="_${id.replace(/^Body_/, "")}"]`);
  const clean = text => String(text || "").replace(/\s+/g, " ").trim();
  const placeholder = o => !o.value || o.value === "0" || /^(?:-+\s*)?select(?:\s+an?\s+option)?(?:\s*-+)?$/i.test(o.label);
  const hasPostback = element => /__doPostBack|WebForm_DoPostBackWithOptions/i.test(`${element?.getAttribute("onchange")} ${element?.getAttribute("onclick")}`);
  const dateInput = () => byId("Body_txtdDAad");
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
  const nativeSelector = Object.values(ids).concat(Object.values(radioIds), ["Body_txtdDAad"]).map(id => `#${id}`).join(",");
  const manual = event => {
    const target = event.target;
    if (event.isTrusted && target instanceof Element && (target.matches(nativeSelector)
      || target.closest("label")?.control?.matches(nativeSelector)
      || target.closest(".chzn-container,.chosen-container,.multiselect-native-select,#Body_ChklstSection"))) manualCancelled = true;
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
    const element = byId(ids[key]);
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
    const fields = Object.fromEntries(Object.keys(ids).map(key => [key, fieldState(key)]));
    const dateMode = byId(radioIds.previous)?.checked ? "previous" : byId(radioIds.current)?.checked ? "current" : "";
    const classType = byId(radioIds.lab)?.checked ? "lab" : byId(radioIds.theory)?.checked ? "theory" : "";
    const account = clean(byId("Body_lbllecturer")?.textContent || byId("Body_lblFaculty")?.textContent || byId("Body_lblLecturer")?.textContent ||
      [...document.querySelectorAll("span.label, span.badge")].find(element => /@/.test(element.textContent))?.textContent || "current-lecturer");
    const alerts = [...document.querySelectorAll('.alert, [role="alert"], #Body_lblmsg, #Body_lblMessage')]
      .map(element => clean(element.textContent)).filter(text => /already.*(?:attendance|entered)|attendance.*already/i.test(text));
    lastSnapshot = { attendancePage: /JVPL_Regular_Class_Attendance\.aspx$/i.test(location.pathname) && fields.program.found,
      origin: location.origin, account, pageId, revision,
      busy,
      dateMode, classType, date: clean(input?.value || byId("Body_lbldate")?.textContent), hasDateInput: !!input,
      radios: Object.fromEntries(Object.entries(radioIds).map(([key, id]) => [key, !!byId(id)])),
      fields, alreadyRecorded: alerts[0] || "", readAt: Date.now() };
    return lastSnapshot;
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
      if (element.id === ids.section && window.jQuery.fn?.multiselect) {
        try { window.jQuery(element).multiselect("refresh"); } catch { /* not initialized */ }
      }
      } catch { /* A stale jQuery plugin must not block the native change. */ }
    }
    return { posted };
  }
  function act(action) {
    if (manualCancelled) throw new Error("Manual filter input stopped this run.");
    if (!active) throw new Error("Start filter application first.");
    if (!read().attendancePage) throw new Error("Open Regular Class Attendance first.");
    if (action.field === "dateMode" || action.field === "classType") {
      const allowed = action.field === "dateMode" ? ["current", "previous"] : ["theory", "lab"];
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
    if (!Object.hasOwn(ids, action.field) || !Array.isArray(action.values)) throw new Error("Unsupported field.");
    const element = byId(ids[action.field]);
    const live = fieldState(action.field);
    if (!element || element.disabled || action.values.some(value => !live.options.some(option => option.value === value && !option.disabled))) {
      throw new Error("The website changed before the selection could be applied. Try again.");
    }
    if (element.tagName === "SELECT") {
      if (!element.multiple && action.values.length !== 1) throw new Error("Choose exactly one option.");
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
  window.__classFlowAdapter = { version: 3, read, act, start, stop };
})();
