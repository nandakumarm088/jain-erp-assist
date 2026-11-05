"use strict";
importScripts("core.js", "attendance-core.js");
const Attendance = ClassFlowAttendance;
const Core = ClassFlowCore;
const SITE = "https://jained.jgianveshana.com";
const PAGE = `${SITE}/UI/Academics/Class%20Attendance/JVPL_Regular_Class_Attendance.aspx`;
const queues = new Map();
const cacheSeen = new Map();
const observations = new Map();
const snapshots = new Map();
const timers = new Map();
const jobKey = tabId => `classflow.job.${tabId}`;
const observationKey = tabId => `classflow.observation.${tabId}`;
const settingsKey = tabId => `classflow.settings.${tabId}`;
// Discard historical attendance-type captures once, including cache keys containing them.
const storageReady = (async () => {
  const data = await chrome.storage.local.get(null);
  if (data["classflow.freeAttendanceType"]) return;
  const strip = value => Array.isArray(value) ? value.map(strip) : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== "attendanceType").map(([key, item]) => [key, strip(item)])) : value;
  const updates = {};
  for (const key of ["classflow.presets", "classflow.context"]) if (key in data) updates[key] = strip(data[key]);
  await chrome.storage.session.set(strip(await chrome.storage.session.get(null)));
  await chrome.storage.local.set({ ...updates, "classflow.cache": {}, "classflow.freeAttendanceType": true });
})();
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
const isPage = url => {
  try { const parsed = new URL(url); return parsed.origin === SITE && /\/JVPL_Regular_Class_Attendance\.aspx$/i.test(parsed.pathname); }
  catch { return false; }
};
function serial(key, task) {
  const next = (queues.get(key) || Promise.resolve()).catch(() => {}).then(task);
  queues.set(key, next);
  return next.finally(() => { if (queues.get(key) === next) queues.delete(key); });
}
async function readLocal() {
  const data = await chrome.storage.local.get(["classflow.presets", "classflow.cache", "classflow.context", "classflow.collapsedCategories"]);
  return { collapsedCategories: (data["classflow.collapsedCategories"] || []).filter(key => typeof key === "string"), presets: (data["classflow.presets"] || []).map(Core.cleanPreset), cache: data["classflow.cache"] || {}, context: data["classflow.context"] || null };
}
async function pageCall(tabId, method, argument, active = false) {
  const execute = () => chrome.scripting.executeScript({ target: { tabId }, world: "MAIN",
    func: (method, argument, active) => {
      if (method === "stop") { window.__classFlowAdapter?.stop?.(); return { ok: true }; }
      const adapter = window.__classFlowAdapter;
      if (adapter?.version !== 4) return { adapterMissing: true };
      if (active) adapter.start();
      try { return adapter[method](argument); }
      finally { if (!active) adapter.stop(); }
    }, args: [method, argument ?? null, active] });
  let results = await execute();
  if (results[0]?.result?.adapterMissing) {
    await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", files: ["attendance-core.js", "adapter.js"] });
    results = await execute();
  }
  return results[0]?.result;
}
async function collectCache(snapshot) {
  if (!snapshot.attendancePage || snapshot.busy) return;
  const entries = [];
  const fields = Core.FIELDS;
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index];
    const live = snapshot.fields[field.key];
    if (!live.options.length || !fields.slice(0, index).every(parent => snapshot.fields[parent.key].selected.length)) continue;
    const key = Core.cacheKey(snapshot, field.key);
    const signature = JSON.stringify(live.options);
    if (cacheSeen.get(key) === signature) continue;
    entries.push([key, { options: live.options, observedAt: Date.now() }]);
  }
  if (!entries.length) return;
  await serial("cache", async () => {
    const { cache } = await readLocal();
    for (const [key, entry] of entries) cache[key] = entry;
    // Bound storage growth; retain the 300 most recently observed contexts.
    const retained = Object.fromEntries(Object.entries(cache).sort((a, b) => b[1].observedAt - a[1].observedAt).slice(0, 300));
    await chrome.storage.local.set({ "classflow.cache": retained });
    await chrome.storage.local.set({ "classflow.context": { origin: snapshot.origin, account: snapshot.account,
      dateMode: snapshot.dateMode, classType: snapshot.classType, date: snapshot.date } });
    for (const [key, entry] of entries) cacheSeen.set(key, JSON.stringify(entry.options));
  });
}
async function putJob(tabId, job) {
  await chrome.storage.session.set({ [jobKey(tabId)]: job });
  return job;
}
async function finish(tabId, job) {
  clearTimeout(timers.get(tabId));
  timers.delete(tabId);
  await chrome.alarms.clear(`classflow.run.${tabId}`);
  try { await pageCall(tabId, "stop"); } catch { /* A removed document has no remaining hooks. */ }
  if (job.kind === "attendance") { const { copy, ...summary } = job; job = summary; }
  return putJob(tabId, job);
}
async function fail(tabId, job, message, field = "") {
  return finish(tabId, { ...job, status: "error", message, field, pending: null, updatedAt: Date.now() });
}
function snapshotSignature(snapshot) {
  return JSON.stringify([snapshot.pageId, snapshot.revision, snapshot.dateMode, snapshot.classType, snapshot.date, snapshot.fields, snapshot.students, snapshot.rosterError]);
}
async function advance(tabId, snapshot, stable) {
  let job = (await chrome.storage.session.get(jobKey(tabId)))[jobKey(tabId)] || null;
  if (job?.status !== "running") return job;
  const now = Date.now();
  if (now - job.startedAt > 300000) return fail(tabId, job, "This run expired. Reapply the preset to start again.");
  if (!stable || snapshot.busy) return job;
  if (job.pending) {
    const pending = job.pending;
    const refreshed = snapshot.pageId !== pending.pageId || snapshot.revision > pending.revision;
    if (pending.posted && !refreshed) {
      if (now - pending.at > 20000) return fail(tabId, job, "The website did not finish refreshing. Refresh the attendance page and try again.", pending.field);
      return job;
    }
    if (!pending.posted && now - pending.at < 80) return job;
    job = { ...job, pending: null };
    await putJob(tabId, job);
  }
  if (job.kind === "attendance") {
    const next = Attendance.plan(job.copy, snapshot, job.target);
    if (next.type === "error") return fail(tabId, job, next.message);
    if (next.type === "done") return finish(tabId, { ...job, status:"done", progress:next.total, total:next.total,
      pending:null, updatedAt:now, message:"Attendance applied. Review the list and Save on the website." });
    const attempts={...job.attempts,[next.usn]:(job.attempts[next.usn]||0)+1};
    if (attempts[next.usn]>4) return fail(tabId,job,`Attendance for ${next.usn} did not stay selected. Stopped; review the page.`);
    const pending={at:now,field:next.usn,pageId:snapshot.pageId,revision:snapshot.revision,posted:true};
    job={...job,attempts,pending,progress:next.total-next.remaining,total:next.total,updatedAt:now,message:`Applying attendance: ${next.total-next.remaining} of ${next.total} matched.`};
    await putJob(tabId,job);
    try {
      const result=await pageCall(tabId,"attendanceAct",{copy:job.copy,target:job.target},true);
      if(result) await putJob(tabId,{...job,pending:{...pending,posted:result.posted}});
    } catch(error) {
      if (!/frame|document|context|navigation|removed|closed|access contents/i.test(error.message)) return fail(tabId,job,error.message);
    }
    return (await chrome.storage.session.get(jobKey(tabId)))[jobKey(tabId)];
  }
  const next = Core.plan(job.preset, snapshot, job.settings || Core.runtimeFromSnapshot(snapshot));
  if (next.type === "error") return fail(tabId, { ...job, websiteMessage: Boolean(next.websiteMessage) }, next.message, next.field);
  if (next.type === "done") {
    return finish(tabId, { ...job, status: "done", progress: 11, field: "", pending: null,
      message: !job.preset.fields.session?.length ? "Class filters applied. Choose Session No on the website when needed."
        : snapshot.alreadyRecorded ? "Filters applied. Attendance is already recorded for this session." : "Your class is ready. You can take attendance on the website.", updatedAt: now });
  }
  if (next.type === "wait") {
    const since = job.waitingFor === next.field ? job.waitingSince : now;
    if (now - since > 25000) return fail(tabId, job, `${next.label} is still unavailable on the website. Check the page and update the preset if needed.`, next.field);
    return putJob(tabId, { ...job, waitingFor: next.field, waitingSince: since, progress: next.index || 0,
      field: next.field, message: `Waiting for ${next.label.toLowerCase()}…`, updatedAt: now });
  }
  const attempts = { ...job.attempts, [next.field]: (job.attempts[next.field] || 0) + 1 };
  // Multi-section CheckBoxLists may require one postback per toggle.
  const limit = next.field === "section" ? 20 : 4;
  if (attempts[next.field] > limit) return fail(tabId, job, `${next.label} did not stay selected after the refresh. Review this field on the website.`, next.field);
  const posts = ["dateMode", "classType"].includes(next.field) ? true
    : next.field === "date" ? true : snapshot.fields[next.field]?.posts;
  // Persist BEFORE dispatch: the current document can disappear during the action.
  const pending = { at: now, field: next.field, pageId: snapshot.pageId, revision: snapshot.revision, posted: posts };
  job = { ...job, attempts, pending, waitingFor: "", waitingSince: null, field: next.field,
    progress: next.index, message: `Selecting ${next.label.toLowerCase()}…`, updatedAt: now };
  await putJob(tabId, job);
  try {
    const result = await pageCall(tabId, "act", next, true);
    if (result) await putJob(tabId, { ...job, pending: { ...pending, posted: result.posted } });
  } catch (error) {
    if (/Manual filter input/.test(error.message)) return finish(tabId, { ...job, status: "stopped", pending: null, message: "Stopped because you are making changes on the website." });
    // Navigating destroys executeScript's response. A subsequent pageId proves completion.
    if (!/frame|document|context|navigation|removed|closed|access contents/i.test(error.message)) {
      return fail(tabId, job, error.message, next.field);
    }
  }
  return (await chrome.storage.session.get(jobKey(tabId)))[jobKey(tabId)];
}
async function getState(tabId) {
  // UI refreshes inspect extension storage and tab metadata only, never the DOM.
  let snapshot = snapshots.get(tabId)?.snapshot || null;
  let connection = "Open Regular Class Attendance to connect.";
  let connected = false;
  try { connected = tabId != null && isPage((await chrome.tabs.get(tabId)).url); } catch { /* Tab closed. */ }
  if (connected) connection = "Attendance page ready";
  else snapshot = null;
  const job = (await chrome.storage.session.get(jobKey(tabId)))[jobKey(tabId)] || null;
  const data = await readLocal();
  const storedSettings = (await chrome.storage.session.get(settingsKey(tabId)))[settingsKey(tabId)];
  const preference = (await chrome.storage.local.get("classflow.previousYear"))["classflow.previousYear"];
  const previousYear = preference || new Date().getFullYear();
  const clipboard = (await chrome.storage.local.get("classflow.attendanceCopy"))["classflow.attendanceCopy"];
  const attendanceCopy = clipboard ? { copiedAt:clipboard.copiedAt, sessionLabel:clipboard.sessionLabel, date:clipboard.scope.date,
    courseLabel:clipboard.courseLabel, present:clipboard.students.filter(student=>student.present).length, absent:clipboard.students.filter(student=>!student.present).length } : null;
  return { ...data, attendanceCopy, previousYear, tabId, settings: storedSettings || Core.runtimeFromSnapshot(snapshot || data.context), snapshot, connected, stable: true, connection, job, pageUrl: PAGE };
}
function schedule(tabId, delay = 140) {
  clearTimeout(timers.get(tabId));
  timers.set(tabId, setTimeout(() => tick(tabId), delay));
}
async function tick(tabId) {
  await serial(`tab:${tabId}`, async () => {
    let job = (await chrome.storage.session.get(jobKey(tabId)))[jobKey(tabId)];
    if (job?.status !== "running") return;
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!isPage(tab.url)) { await fail(tabId, job, "The attendance page was closed or changed. Reopen it and apply again."); return; }
      if (Date.now() - job.startedAt > 300000) { await fail(tabId, job, "This run expired. Apply the preset again."); return; }
      if (tab.status === "loading") { schedule(tabId, 220); return; }
      const snapshot = await pageCall(tabId, job.kind === "attendance" ? "attendanceRead" : "read", null, true);
      if (snapshot?.manualCancelled) {
        await finish(tabId, { ...job, status: "stopped", pending: null, message: "Stopped because you are making changes on the website." });
        return;
      }
      if (!snapshot?.attendancePage) { await fail(tabId, job, "Attendance controls are unavailable. Check that you are signed in."); return; }
      snapshots.set(tabId, { snapshot });
      const signature = snapshotSignature(snapshot);
      const previous = observations.get(tabId);
      const since = previous?.signature === signature ? previous.since : Date.now();
      const stable = !snapshot.busy && Date.now() - since >= 70;
      observations.set(tabId, { signature, since });
      if (stable && job.kind !== "attendance") void collectCache(snapshot).catch(() => {});
      job = await advance(tabId, snapshot, stable);
      if (job?.status === "running") schedule(tabId);
    } catch (error) {
      if (/frame|document|context|navigation|removed|access contents/i.test(error.message)) schedule(tabId, 220);
      else await fail(tabId, job, error.message);
    } finally {
      chrome.runtime.sendMessage({ type: "classflow:view-changed", tabId }).catch(() => {});
    }
  }).catch(() => {});
}
async function resolveTab(message, sender) {
  if (sender.url?.startsWith(chrome.runtime.getURL(""))) {
    if (Number.isInteger(message.tabId)) return message.tabId;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.id;
  }
  if (sender.tab) {
    if (!isPage(sender.url)) throw new Error("Unsupported page.");
    return sender.tab.id;
  }
  throw new Error("Unsupported sender.");
}
async function dispatch(message, sender) {
  await storageReady;
  const tabId = await resolveTab(message, sender);
  if (message.type === "OPEN_PAGE") {
    if (message.newTab === true) await chrome.tabs.create({ url: PAGE, active: false });
    else {
      if (!Number.isInteger(tabId)) throw new Error("Select a browser tab before opening attendance.");
      await chrome.tabs.update(tabId, { url: PAGE });
    }
    return { ok: true };
  }
  if (message.type === "EXPORT_PRESETS") {
    const { presets } = await readLocal();
    return { backup: Core.createPresetBackup(presets) };
  }
  if (message.type === "IMPORT_PRESETS") {
    return serial("presets", async () => {
      // Validate every entry before writing anything; existing presets are never replaced.
      const imported = Core.parsePresetBackup(message.text);
      const { presets } = await readLocal();
      const seen = new Set(presets.map(Core.presetFingerprint));
      let added = 0, skipped = 0;
      for (const preset of imported) {
        const fingerprint = Core.presetFingerprint(preset);
        if (seen.has(fingerprint)) { skipped++; continue; }
        seen.add(fingerprint);
        presets.push(Core.cleanPreset({ ...preset, id: crypto.randomUUID(), updatedAt: Date.now() }));
        added++;
      }
      if (added) await chrome.storage.local.set({ "classflow.presets": presets });
      return { added, skipped };
    });
  }
  if (message.type === "SAVE_PRESET") {
    return serial("presets", async () => {
      const error = Core.validatePreset(message.preset);
      if (error) throw new Error(error);
      const { presets } = await readLocal();
      const preset = Core.cleanPreset({ ...message.preset, name: message.preset.name.trim(), id: message.preset.id || crypto.randomUUID(), updatedAt: Date.now() });
      const existing = presets.findIndex(item => item.id === preset.id);
      if (existing < 0) presets.push(preset); else presets[existing] = preset;
      await chrome.storage.local.set({ "classflow.presets": presets });
      return { ok: true, preset };
    });
  }
  if (message.type === "SET_CATEGORY_COLLAPSED") {
    return serial("categories", async () => {
      if (typeof message.key !== "string" || message.key.length > 59 || (message.key !== "uncategorized" && !message.key.startsWith("category:")) || typeof message.collapsed !== "boolean") throw new Error("Invalid category selection.");
      const { collapsedCategories } = await readLocal();
      const collapsed = new Set(collapsedCategories);
      if (message.collapsed) collapsed.add(message.key); else collapsed.delete(message.key);
      await chrome.storage.local.set({ "classflow.collapsedCategories": [...collapsed] });
      return { ok: true };
    });
  }
  if (message.type === "REORDER_PRESETS") {
    return serial("presets", async () => {
      if (!Array.isArray(message.ids) || message.ids.some(id => typeof id !== "string") || new Set(message.ids).size !== message.ids.length) throw new Error("Invalid saved class order.");
      const { presets } = await readLocal();
      const ranked = new Map(message.ids.map((id, index) => [id, index]));
      presets.sort((a, b) => (ranked.get(a.id) ?? Infinity) - (ranked.get(b.id) ?? Infinity));
      await chrome.storage.local.set({ "classflow.presets": presets });
      return { ok: true };
    });
  }
  if (message.type === "DELETE_PRESET") {
    return serial("presets", async () => {
      const { presets } = await readLocal();
      await chrome.storage.local.set({ "classflow.presets": presets.filter(preset => preset.id !== message.id) });
      return { ok: true };
    });
  }
  return serial(`tab:${tabId}`, async () => {
    if (message.type === "PANEL_OPEN") {
      const previous = (await chrome.storage.session.get(settingsKey(tabId)))[settingsKey(tabId)];
      await chrome.storage.session.set({ [settingsKey(tabId)]: {
        dateMode: "current", classType: "theory", previousDate: previous?.previousDate || ""
      } });
    }
    else if (message.type === "SET_SETTINGS") {
      if (message.yearOverride !== undefined && !/^[1-9]\d{3}$/.test(String(message.yearOverride))) throw new Error("Enter a four-digit year (1000?9999).");
      const validation = Core.validateSettings(message.settings, true);
      if (validation) throw new Error(validation);
      if (message.yearOverride !== undefined) await chrome.storage.local.set({ "classflow.previousYear": Number(message.yearOverride) });
      await chrome.storage.session.set({ [settingsKey(tabId)]: { dateMode: message.settings.dateMode, classType: message.settings.classType,
        previousDate: message.settings.previousDate || "" } });
    }
    else if (message.type === "STOP") {
      const job = (await chrome.storage.session.get(jobKey(tabId)))[jobKey(tabId)];
      if (job?.status === "running") await finish(tabId, { ...job, status: "stopped", message: "Stopped. Selections already made remain on the website.", pending: null });
    } else if (["COPY_ATTENDANCE","APPLY_ATTENDANCE","CLEAR_ATTENDANCE"].includes(message.type)) {
      const active=(await chrome.storage.session.get(jobKey(tabId)))[jobKey(tabId)];
      if(active?.status==="running") throw new Error("Wait for the current operation to finish or stop it first.");
      if(message.type==="CLEAR_ATTENDANCE") await chrome.storage.local.remove("classflow.attendanceCopy");
      else {
        if(!isPage((await chrome.tabs.get(tabId)).url)) throw new Error("Open the attendance page first.");
        const current=await pageCall(tabId,"attendanceRead");
        if(message.type==="COPY_ATTENDANCE") {
          const copy=Attendance.capture(current);
          copy.courseLabel=current.fields.course.selected.map(option=>option.label).join(", ");
          await chrome.storage.local.set({"classflow.attendanceCopy":copy});
        } else {
          const copy=(await chrome.storage.local.get("classflow.attendanceCopy"))["classflow.attendanceCopy"];
          const next=Attendance.plan(copy,current);
          if(next.type==="error") throw new Error(next.message);
          await putJob(tabId,{id:crypto.randomUUID(),kind:"attendance",preset:{name:"Apply attendance"},copy,target:next.scope,status:"running",startedAt:Date.now(),updatedAt:Date.now(),progress:0,total:next.total,attempts:{},pending:null,message:"Checking the student list..."});
          await chrome.alarms.create(`classflow.run.${tabId}`,{delayInMinutes:1,periodInMinutes:1});
          schedule(tabId,0);
        }
      }
    } else if (message.type === "CAPTURE") {
      const job = (await chrome.storage.session.get(jobKey(tabId)))[jobKey(tabId)];
      if (job?.status === "running") throw new Error("Wait for the current filter application to finish.");
      if (!isPage((await chrome.tabs.get(tabId)).url)) throw new Error("Open Regular Class Attendance first.");
      const snapshot = await pageCall(tabId, "read");
      if (!snapshot?.attendancePage || snapshot.busy) throw new Error("Wait for the attendance page to finish loading, then capture again.");
      snapshots.set(tabId, { snapshot });
      await collectCache(snapshot);
    } else if (message.type === "APPLY") {
      const tab = await chrome.tabs.get(tabId);
      if (!isPage(tab.url)) throw new Error("Open the attendance page first.");
      const active = (await chrome.storage.session.get(jobKey(tabId)))[jobKey(tabId)];
      if (active?.status === "running") throw new Error("A preset is already being applied. Stop it first.");
      const { presets } = await readLocal();
      const preset = presets.find(item => item.id === message.id);
      const validation = Core.validatePreset(preset);
      if (validation) throw new Error(validation);
      const current = await pageCall(tabId, "read");
      if (!current?.attendancePage || current.busy) throw new Error("Wait for the attendance page to finish refreshing, then apply your class.");
      const selectedSettings = (await chrome.storage.session.get(settingsKey(tabId)))[settingsKey(tabId)] || Core.runtimeFromSnapshot(snapshots.get(tabId)?.snapshot || (await readLocal()).context);
      const settings = Core.settingsForPreset(preset, selectedSettings);
      const settingsError = Core.validateSettings(settings);
      if (settingsError) throw new Error(settingsError);
      await putJob(tabId, { id: crypto.randomUUID(), preset, settings, status: "running", startedAt: Date.now(), updatedAt: Date.now(),
        progress: 0, message: "Checking the live website…", attempts: {}, pending: null });
      await chrome.alarms.create(`classflow.run.${tabId}`, { delayInMinutes: 1, periodInMinutes: 1 });
      schedule(tabId, 0);
    } else if (message.type !== "STATE") throw new Error("Unknown action.");
    const state = await getState(tabId);
    return state;
  });
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type === "classflow:view-changed") return false;
  if (!message?.type || sender.id !== chrome.runtime.id) return false;
  dispatch(message, sender).then(reply).catch(error => reply({ error: error.message }));
  return true;
});
chrome.tabs.onRemoved.addListener(tabId => {
  observations.delete(tabId);
  snapshots.delete(tabId);
  clearTimeout(timers.get(tabId));
  timers.delete(tabId);
  chrome.alarms.clear(`classflow.run.${tabId}`);
  chrome.storage.session.remove([jobKey(tabId), observationKey(tabId), settingsKey(tabId)]);
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === "loading") snapshots.delete(tabId);
  if (change.status === "complete") chrome.storage.session.get(jobKey(tabId)).then(data => {
    if (data[jobKey(tabId)]?.status === "running") schedule(tabId, 0);
  });
});
chrome.alarms.onAlarm.addListener(async alarm => {
  if (!alarm.name.startsWith("classflow.run.")) return;
  const tabId = Number(alarm.name.slice("classflow.run.".length));
  const job = (await chrome.storage.session.get(jobKey(tabId)))[jobKey(tabId)];
  if (job?.status === "running") schedule(tabId, 0);
  else await chrome.alarms.clear(alarm.name);
});
storageReady.then(() => chrome.storage.session.get(null)).then(data => {
  for (const [key, job] of Object.entries(data)) {
    if (key.startsWith("classflow.job.") && job?.status === "running") schedule(Number(key.slice("classflow.job.".length)), 0);
  }
});
chrome.runtime.onInstalled.addListener(async () => {
  const { presets } = await readLocal();
  await chrome.storage.local.set({ "classflow.presets": presets });
});
