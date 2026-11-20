# Jain ERP Assist

An independent tool by NK Developers; not an official Jain extension.

A Manifest V3 extension for Jain ERP **Regular and Remedial Class Attendance** pages. Save class filters once and apply them with one click; copy attendance between sessions or mark students from a pasted USN list.

## Load the new version

1. In the dedicated Chrome profile, open `chrome://extensions`.
2. If Attendance Date Setter is still installed from this root folder, remove that old entry. Its old files are preserved in `old/`.
3. Enable Developer mode, choose **Load unpacked**, and select `E:\Personal_Projects\Jain ERP Assist` (the root, not `old/`). If Jain ERP Assist is already loaded, just click Reload.
4. Refresh the attendance page: <https://jained.jgianveshana.com/UI/Academics/Class%20Attendance/JVPL_Regular_Class_Attendance.aspx>.

The extension is called **Jain ERP Assist · Attendance presets**. Click its toolbar button to open Chrome's native side panel alongside the website. There is no floating panel or popup covering the page. Chrome 116 or newer is required. No build command is required.

Use the root folder for iterative development and Chrome testing. Do not create another ZIP unless the user explicitly requests one.

## First class

1. On the website, select Current/Previous Date, Theory/Lab, Attendance Type, and the class dropdowns **through Section**. Session No is optional.
2. Click the extension button to open the side panel, then choose **Save this class**. Give the preset a short name, check its class dropdowns, and choose **Filters only**, **Theory**, or **Lab** before saving. The summary explains whether the preset will override the class type in Attendance settings.
3. Choose the date and Theory/Lab in **Attendance settings** below the Attendance Copy/Apply section. Saved class buttons sit directly below, each with a pencil button to edit its dropdowns.
4. Click the saved class's **name** to apply it immediately. Jain ERP Assist applies the current runtime settings first, then the saved dropdowns, waiting for each website refresh. There is no separate Apply button to find inside a card.
5. When Jain ERP Assist says the filters are applied, continue taking attendance on the website.

You can also choose **New preset** to build a class using remembered options. Options are learned only during an explicit **Save this class** capture or an active preset run. If an option has never been observed, select it on the website and capture the class again. A captured but incomplete class opens in the editor and cannot be saved until all required fields are supplied.

**Saved fields:** Program, Academic Batch, Course Year/Semester, Specialization, Course, and Section are required. **Session No is optional.** Leave it at **Choose on website (not saved)** to apply the other six dropdowns and choose the session yourself afterward. When a session is included, it is validated and selected last. Values and readable labels are kept together. Section supports multiple choices.

The panel uses a restrained glass theme: compact readable text, opaque white form controls, subtle frosted surfaces, and distinct purple Copy / blue Apply actions. Saved class buttons use blue/violet tinted surfaces with dark text; selected options use solid indigo, blue, or violet for clear state feedback. Its content has no fixed or minimum width and adapts to narrow layouts. Drag Chrome's side-panel divider to resize it; Chrome enforces the outer panel's minimum width, which extensions cannot override through the sidePanel API.

**Current/Previous Date, the calendar date, and Attendance Type are never saved in a preset.** Theory/Lab is optional: the save editor offers **Filters only** (the default), **Theory**, or **Lab**, and states exactly what will be saved before the Save button. A saved Theory/Lab choice takes priority over Attendance settings; Filters only uses the class type selected there. Editing a preset lets you change or remove that override. This does not override the date or attendance type.

Attendance settings are separate, per-tab settings for the current browser session and are copied into a job when a class button is clicked. Settings start from the last capture/remembered context, or Current Date / Theory if nothing has been captured. Opening the panel does not read the page. Changing settings does not change the website until you apply a class. **Attendance Type is entirely controlled by the website and the user:** Jain ERP Assist does not read, capture, cache, save, select, or validate it. Any automatic changes caused by the website switching Theory/Lab remain the website's behavior. Historical attendance-type captures are removed on reload; saved class presets are retained, while remembered dropdown options are rebuilt on the next capture/run.

Existing presets retain their dropdowns and remain Filters only until you explicitly choose Theory or Lab. Older legacy mode/date/attendance-type fields are not restored. Changing a parent dropdown clears its dependent saved selections. Deleting a preset offers Undo.

## Behavior

- Order: date mode → Theory/Lab → previous date if needed → attendance type → program → batch → year/semester → specialization → course → section → session.
- Cached lists are for the editor only. The runner reads actual live options before each selection. A missing option stops the run with its field name.
- Values and labels are both stored. If a value changes, only a unique, identical normalized label may resolve it. Reused values with different labels and ambiguous labels stop the run.
- Full parent selections, mode, date policy, origin, and lecturer context form the cache key. At most 300 contexts are retained; the latest observed list replaces the older copy.
- Jobs belong to a particular browser tab. They survive side-panel closure, full reloads, partial ASP.NET postbacks, and service worker restarts within the current browser session. They expire after five minutes. Closing the tab clears its job and runtime settings; restarting Chrome does not restart a job.
- **Stop** prevents the next change. A request already sent to the website may still finish. The website's already selected filters remain in place.
- Using the website's own filter controls stops an active preset. Mouse and keyboard events pass straight through; Jain ERP Assist never cancels or delays the website's input handlers.
- There are **no registered content scripts**, page-load injections, persistent filter listeners, or MutationObservers. Opening the panel, editing presets, changing runtime settings, and manually using the website do not execute page scripts. The panel checks only tab metadata and extension storage while idle.
- **Save this class** performs a one-shot read and removes its helper immediately; it attaches no page callbacks. Only an active preset run attaches temporary ASP.NET postback callbacks and manual-input listeners. Success, Stop, manual takeover, errors, and timeouts remove those callbacks and delete the page helper. Refresh the ERP page once after upgrading to unload scripts injected by earlier versions.
- The extension service worker owns active jobs and resumes them after reloads. A watchdog alarm exists only while a run is active and is cleared at termination. Closing the panel does not stop an authorized run. No timers or observers are left running on the website afterward.
- Jain ERP Assist changes allowlisted filter controls and, during attendance Apply, student checkbox states. It never clicks the website's Save, Edit, Cancel, Reset, Next Section, or Next Period buttons, and only reads or edits student checkbox states during explicit attendance Copy/Apply operations.
- Presets and dropdown options are stored in this Chrome profile using extension storage. There are no external fonts, analytics, or services.

## Project structure

| File | Role |
| --- | --- |
| `core.js` | Validation, dependency order, live-option matching, cache context keys |
| `adapter.js` | On-demand reader/actor with explicit start/stop and callback removal |
| `background.js` | Active-only per-tab runner, one-shot capture, storage, reload recovery and cleanup |
| `ui.js`, `ui.css` | Side-panel runtime controls, preset library/editor, and progress UI |
| `sidepanel.html`, `sidepanel.js` | Native Chrome side panel opened by the toolbar button |
| `old/` | Unchanged previous implementation, for reference |
| `chrome-profile/` | Browser data; excluded from Git and distributable ZIP |

The adapter uses the native controls observed on the current site (`Body_ddlGraduationType`, `Body_ddlAcademicBatch`, `Body_ddlcourseyearsem`, `Body_ddlBranch`, `Body_ddlsubject`, `Body_ChklstSection`, `Body_ddlperiod`). It supports both a native multi-select and an ASP.NET CheckBoxList for Section, as well as Chosen controls backed by native selects.

## Validation

```powershell
npm.cmd ci --ignore-scripts
npm.cmd test
npm.cmd run test:browser
```

The browser test uses a **separate headless Chromium profile**, intercepts the ERP URL with `tests/fixture.html`, and never contacts the real ERP or uses `chrome-profile/`. Set `CLASSFLOW_TEST_CHROMIUM` to an installed Chromium executable, or install Playwright Chromium with `npx.cmd playwright install chromium` first. The runner also recognizes the Chromium cache present in this development environment.

Checks cover named preset buttons at the top, native side-panel registration, seven-field-only preset storage, legacy migration, independent runtime settings, missing live options despite a cached copy, changed values, parent resets, multiple sections, previous-date validation, exact selection order, reloads with the panel closed, partial ASP.NET postbacks, Stop, and preset edit/delete/undo. The suite verifies the helper and every ASP.NET callback are removed on success, Stop, errors and manual takeover. It instruments script execution to assert **zero page scripts run while idle, opening the panel, or manually selecting website filters**. Explicit capture is checked to leave no helper behind. Additional checks use the native controls and escaped postback handlers extracted from the supplied HTML (`tests/site-controls.html`). Browser screenshots go in `artifacts/`.

### Current verification limit

The adapter has now been checked against the user's supplied page HTML, including the actual hidden selects, lecturer ID, multiselect, and delayed inline postback handlers. **The filter flow and live attendance checkbox postbacks have been verified. Saving copied attendance remains deliberately untested.** The supplied HTML contains the initial empty dependent dropdowns, so tests simulate the server responses for those lists; they are not a captured copy of all available site options.

The existing website message that attendance is already recorded is treated as an applied-filter outcome, not as a failed preset. The fixture tests that outcome; no live attendance was submitted.

## Chrome references

- [Script execution worlds](https://developer.chrome.com/docs/extensions/reference/api/scripting)
- [Extension storage](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Chrome side panels](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)

Previous Date has a single DD/MM field and a separate Year field. Type four digits (e.g. 0211) and the slash is inserted automatically. Invalid calendar dates are blocked before applying. The year defaults to the computer's local year without a network request. Editing Year remembers that preference across browser restarts; it remains editable and is never part of a preset. Enter a valid day/month before applying a class.

Saved buttons show a small Lab/Theory badge only when that preset fixes its class type. Drag a saved class above or below another to remember its order (or focus its button and press Alt+Up/Down). Selecting Previous Date focuses DD/MM immediately. If a saved option changes or disappears, the error identifies the affected field and offers the preset editor.

Each fresh side-panel opening starts on Current Date and Theory. This only resets the panel controls; it does not change the website or an already-running application. Previous date entry and the remembered year are retained for reuse. A preset with a fixed Theory/Lab type still takes priority when applied.

## Versions

The current release is **v1.5.6**. The original filter flow baseline was v1.0.0. The panel displays the installed manifest version beside Jain ERP Assist. Keep manifest.json, package.json, and package-lock.json versions in sync. Use patch versions for fixes, minor versions for new compatible features, and major versions for breaking changes. Record releases in CHANGELOG.md and tag release commits in Git.

Attendance copying is available in **v1.1.0**, using **Student USN as the primary ID** and **Registration No as the secondary check**.

## Copy attendance to another session

1. Mark the first session on the website, then click **Copy attendance** in the panel **before saving**. The summary shows the source section, session/period, date, and present/absent counts.
2. Use the website's **Save**, then select the other session and wait for its student list.
3. Click **Apply to this session**. The extension matches the full roster by USN, cross-checks registration numbers, and restores both checked and unchecked states. It waits through each required checkbox postback and verifies all states afterward.
4. Review the list, make any needed changes, and click the website's **Save** yourself.

The copy is kept locally across reloads, panel closure, and browser restarts until replaced with **Copy again** or removed with **Clear**. It is separate from presets. Clear does not change selections on the website.

Apply requires the same lecturer, date, program, batch, semester, specialization, course, Theory/Lab mode, and sections, with the same or a different session. Missing/extra students, duplicate/missing IDs, registration mismatches, paginated lists, disabled checkboxes, or already-recorded target attendance block application. **Stop** or manual changes stop further work; any selections already applied remain for review. No Save, Edit, Cancel, or master checkbox is clicked by the extension. No page monitoring runs while idle.

Run `node tests/attendance-browser.cjs` for the local synthetic full/partial-postback attendance checks. `npm.cmd test` includes identity and context unit tests. Tests do not contact the real ERP or submit live attendance.

### Live checkbox verification - 2026-11-05

Tested the authenticated page at Previous Date **02/10/2026**, Theory, BCAN Honours, 2024-2027 batch, fifth semester, Cyber Security, Penetration Testing, section 5BCACSL, sessions 1 and 2 (75 students). Manual clicks issued both a row-selection and a checkbox postback. The extension suppressed the extra row postback and submitted the complete checked/unchecked pattern in one checkbox postback. The server returned the expected states; rechecks also survived a subsequent independent postback.

The actual v1.1.3 Copy/Apply flow copied two absences from session 1 to session 2 and restored an extra accidental untick to present: 73 checked, 2 unchecked after the server response. All 75 starting checks, session 1, the original copied attendance, and normal Chrome were restored afterward. A request guard blocked Save operations throughout; no Save request was issued. This verifies checkbox registration through postbacks, **not final attendance persistence after Save**.

The project root is `E:\Personal_Projects\Jain ERP Assist`. A compatibility junction at the former `ERP_Filter_Extension` path points to this folder so existing Chrome unpacked-extension registrations, extension IDs, stored presets, and the dedicated profile path remain valid. Open the new folder in your IDE; the compatibility link contains no separate project copy.

## Remedial attendance and pasted USNs

The saved preset library also supports the **Remedial Class Attendance** page. Remedial presets save Attendance Type, Specialization, Course, and Section; Period No remains a manual choice. Presets are tagged Regular or Remedial and only apply on their matching page.

Expand **Paste Student USNs** in the Attendance card to mark listed students Present or Absent. Matching uses USN and checks Registration No; unlisted students keep their current state. Review the resulting attendance and click Save on the website yourself.

## Preset backups

Use **Export** below Saved classes to download `jain-erp-assist-presets.json`. Use **Import** there to add presets from that backup. Existing classes are retained; exact duplicates are skipped. All entries are validated before any changes are written. Backups include names, saved filters, optional session choices, and optional Theory/Lab overrides, but no lecturer identity, copied student attendance, dates, or runtime settings. Imported options are still checked against the live website when applied.

Copied attendance can also be applied back to the **same editable session** to restore accidental changes. Already-recorded/disabled attendance and different classes, dates, users, or rosters remain protected. Save is always manual.

**Open attendance** navigates the current browser tab. Hold **Ctrl** while clicking to open the attendance page in a new background tab instead.

Feedback appears beneath its originating section: attendance Copy/Apply under Attendance, filter/preset/backup messages under Saved classes, and date/settings or editor messages under their respective controls. Successful application notices disappear after two seconds; errors remain visible.

## Saved class categories

In the preset editor, **Category** is optional: choose a saved name from the dropdown directly above Class type. Use **+ Category** under Saved classes or the plus button beside the dropdown to create a category first. Presets with the same category appear in a collapsible group under Saved classes; uncategorized presets appear together below those groups. Expansion/collapse is remembered between panel/browser openings. With no categories, the original flat class list is retained. Search includes category names and temporarily expands matching groups. Drag category groups to change their order, or focus a category heading and press Alt+Up/Down. Uncategorized stays last. Drag or Alt+Up/Down reorders classes within their category; edit Category to move a class into another group or clear it to remove grouping. Export/Import preserves category assignments; older presets/backups remain uncategorized.

Categories are saved independently and can exist without classes. Empty categories remain after the last preset is removed and are included in Export/Import. **Preset removed** and Undo disappear after five seconds.

Use the pencil beside a category to rename it. Use the trash icon to delete it; its saved classes move to Uncategorized and remain available. Category headers use a compact divider, and the arrow expands or collapses each group.
