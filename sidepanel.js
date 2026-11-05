"use strict";
(async () => {
  // A newly opened panel starts with predictable controls; active jobs keep their own settings.
  try { await chrome.runtime.sendMessage({ type: "PANEL_OPEN" }); }
  catch (error) { console.error(error); }
  const panel = ClassFlowUI.mount(document.getElementById("app"), {
    send: message => chrome.runtime.sendMessage(message)
  });
  chrome.tabs.onActivated.addListener(() => panel.refresh());
  chrome.tabs.onUpdated.addListener((_tabId, change) => { if (change.status === "complete") panel.refresh(); });
})();
