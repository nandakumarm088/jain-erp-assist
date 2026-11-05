"use strict";
(async () => {
  // Pin this panel instance to its opening tab, independent of later focus changes.
  let tabId;
  try {
    const linkedId = new URLSearchParams(location.search).get("tabId");
    let openingTabId;
    if (linkedId !== null) {
      if (!/^\d+$/.test(linkedId)) throw new Error("Invalid linked tab. Reopen the extension.");
      openingTabId = Number(linkedId);
    } else {
      const window = await chrome.windows.getCurrent();
      const [tab] = await chrome.tabs.query({ active: true, windowId: window.id });
      openingTabId = tab?.id;
    }
    const initial = await chrome.runtime.sendMessage({ type: "PANEL_OPEN", tabId: openingTabId });
    if (initial?.error) throw new Error(initial.error);
    if (!Number.isInteger(initial?.tabId)) throw new Error("The opening tab is unavailable. Reopen the extension on the attendance tab.");
    tabId = initial.tabId;
  } catch (error) {
    document.getElementById("app").textContent = error.message;
    console.error(error);
    return;
  }
  const panel = ClassFlowUI.mount(document.getElementById("app"), {
    send: message => chrome.runtime.sendMessage({ ...message, tabId })
  });
  chrome.tabs.onUpdated.addListener((updatedTabId, change) => {
    if (updatedTabId === tabId && change.status === "complete") panel.refresh();
  });
  chrome.tabs.onRemoved.addListener(removedTabId => {
    if (removedTabId === tabId) panel.disconnected("Attendance tab closed. Reopen the extension on another attendance tab.");
  });
})();
