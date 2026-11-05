/* Shared, deterministic rules. Cached options are never used by the runner. */
(function (root) {
  "use strict";
  const FIELDS = [
    { key: "program", label: "Program" },
    { key: "batch", label: "Academic batch" },
    { key: "semester", label: "Course year / semester" },
    { key: "specialization", label: "Specialization" },
    { key: "course", label: "Course" },
    { key: "section", label: "Section", multiple: true },
    { key: "session", label: "Session no.", optional: true }
  ];
  const normalize = text => String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
  const isPlaceholder = option => !option.value || option.value === "0" ||
    /^(?:-+\s*)?select(?:\s+an?\s+option)?(?:\s*-+)?$/i.test(option.label.trim());
  const validISODate = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  };
  const toSiteDate = value => validISODate(value) ? value.split("-").reverse().join("/") : "";
  const toISODate = value => {
    const result = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value || "");
    const iso = result ? `${result[3]}-${result[2]}-${result[1]}` : "";
    return validISODate(iso) ? iso : "";
  };
  function validatePreset(preset) {
    if (!preset?.name?.trim()) return "Give this class a name.";
    if (preset.name.length > 80) return "Use a class name of 80 characters or fewer.";
    if (preset.classTypeOverride != null && !["theory", "lab"].includes(preset.classTypeOverride)) return "Choose Filters only, Theory, or Lab.";
    for (const field of FIELDS) {
      const choices = preset.fields?.[field.key];
      if (field.optional && (choices == null || (Array.isArray(choices) && !choices.length))) continue;
      if (!Array.isArray(choices) || !choices.length) return `Choose ${field.label.toLowerCase()}.`;
      if (!field.multiple && choices.length !== 1) return `Choose one ${field.label.toLowerCase()}.`;
      if (choices.some(choice => !choice || typeof choice.value !== "string" || typeof choice.label !== "string" || isPlaceholder(choice))) return `Choose a valid ${field.label.toLowerCase()}.`;
      if (new Set(choices.map(choice => choice.value)).size !== choices.length) return `Remove duplicate ${field.label.toLowerCase()} selections.`;
    }
    return "";
  }
  function cleanPreset(preset) {
    return { id: preset.id, name: preset.name, schemaVersion: 3,
      classTypeOverride: ["theory", "lab"].includes(preset.classTypeOverride) ? preset.classTypeOverride : null,
      fields: Object.fromEntries(FIELDS.map(field => [field.key, (preset.fields?.[field.key] || []).map(({ value, label }) => ({ value, label }))])),
      scope: preset.scope ? { origin: preset.scope.origin, account: preset.scope.account } : undefined,
      updatedAt: preset.updatedAt };
  }
  function runtimeFromSnapshot(snapshot) {
    return { dateMode: snapshot?.dateMode || "current", classType: snapshot?.classType || "theory",
      previousDate: snapshot?.dateMode === "previous" ? toISODate(snapshot.date) : "" };
  }
  function validateSettings(settings, incomplete = false) {
    if (!["current", "previous"].includes(settings?.dateMode)) return "Choose Current Date or Previous Date.";
    if (!["theory", "lab"].includes(settings.classType)) return "Choose Theory or Lab.";
    if (!incomplete && settings.dateMode === "previous" && !validISODate(settings.previousDate)) return "Choose a valid previous date before applying a class.";
    return "";
  }
  function resolveChoices(desired, options) {
    const resolved = [];
    for (const choice of desired) {
      const byValue = options.find(option => option.value === choice.value);
      if (byValue && normalize(byValue.label) !== normalize(choice.label)) {
        return { error: `“${choice.label}” now has a different label on the website. Review this selection.` };
      }
      const byLabel = options.filter(option => normalize(option.label) === normalize(choice.label));
      const match = byValue || (byLabel.length === 1 ? byLabel[0] : null);
      if (!match) return { error: `“${choice.label}” is no longer available. Choose its replacement before applying.` };
      resolved.push(match.value);
    }
    return { values: resolved };
  }
  const sameValues = (a, b) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
  const settingsForPreset = (preset, settings) => ({ dateMode: settings.dateMode, previousDate: settings.previousDate || "", classType: preset.classTypeOverride || settings.classType });
  function plan(preset, snapshot, settings = runtimeFromSnapshot(snapshot)) {
    settings = settingsForPreset(preset, settings);
    if (!snapshot?.attendancePage) return { type: "wait", field: "page", label: "Attendance page" };
    if (snapshot.busy) return { type: "wait", field: "page", label: "Website refresh" };
    const radios = [["dateMode", settings.dateMode, "Date mode"], ["classType", settings.classType, "Theory / Lab"]];
    for (let i = 0; i < radios.length; i++) {
      const [key, value, label] = radios[i];
      if (snapshot[key] !== value) return { type: snapshot.radios?.[value] ? "act" : "wait", field: key, value, label, index: i };
    }
    if (settings.dateMode === "previous" && snapshot.date !== toSiteDate(settings.previousDate)) {
      return { type: snapshot.hasDateInput ? "act" : "wait", field: "date", value: toSiteDate(settings.previousDate), label: "Previous date", index: 2 };
    }
    for (let i = 0; i < FIELDS.length; i++) {
      const field = FIELDS[i];
      if (field.optional && !preset.fields[field.key]?.length) continue;
      const live = snapshot.fields[field.key];
      if (live?.siteMessage) return { type: "error", field: field.key, label: field.label, message: `${field.label}: ${live.siteMessage}`, websiteMessage: true, index: i + 4 };
      if (!live?.options?.length) return { type: "wait", field: field.key, label: field.label, index: i + 4 };
      const match = resolveChoices(preset.fields[field.key], live.options);
      if (match.error) return { type: "error", field: field.key, label: field.label, message: `Saved ${field.label.toLowerCase()}: ${match.error} Edit this class to update it.`, index: i + 4 };
      if (!sameValues(match.values, live.selected.map(option => option.value))) {
        return { type: live.disabled ? "wait" : "act", field: field.key, values: match.values, label: field.label, index: i + 4 };
      }
    }
    return { type: "done", index: 11, label: "Class ready" };
  }
  // Full parent context, including mode and lecturer, prevents cross-class cache collisions.
  function cacheKey(snapshot, fieldKey, draft = null, settings = runtimeFromSnapshot(snapshot)) {
    const index = FIELDS.findIndex(field => field.key === fieldKey);
    const fields = draft?.fields || snapshot.fields;
    const context = FIELDS.slice(0, index).map(field => {
      const values = draft ? (fields[field.key] || []) : (fields[field.key]?.selected || []);
      return values.map(option => option.value).sort();
    });
    return JSON.stringify([snapshot.origin, snapshot.account, settings.dateMode,
      settings.classType, settings.dateMode === "previous" ? toSiteDate(settings.previousDate) : "current", fieldKey, context]);
  }
  const api = { FIELDS, normalize, isPlaceholder, validISODate, toSiteDate, toISODate, validatePreset, cleanPreset, runtimeFromSnapshot, validateSettings, settingsForPreset, resolveChoices, sameValues, plan, cacheKey };
  root.ClassFlowCore = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
