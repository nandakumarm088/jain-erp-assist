# Jain ERP Assist — AI Handoff and Change Log

This document records the project state from the original extension through the current implementation. Read this before modifying the extension.

## Project

- Name: Jain ERP Assist
- Version in `manifest.json`: `1.5.6`
- Type: Chrome Manifest V3 unpacked extension
- Host: `https://jained.jgianveshana.com/*`
- No package manager, build system, or external runtime dependencies are included.
- The extension is an independent helper and is not an official Jain extension.

## Exact Jain ERP pages

Regular attendance:

`https://jained.jgianveshana.com/UI/Academics/Class%20Attendance/JVPL_Regular_Class_Attendance.aspx`

Remedial attendance:

`https://jained.jgianveshana.com/UI/Academics/Class%20Attendance/JVPL_Remedial_Class_Attendance.aspx`

The background service worker uses these URLs when opening the two attendance pages. Filter presets are restricted to these known attendance pages. Student-table attendance operations can also work on other pages on the same Jain ERP origin when the compatible student table is present.

## Original files and responsibilities

- `manifest.json` — Manifest V3 metadata, permissions, service worker, side panel, and Jain host permission.
- `background.js` — Service worker, tab/page routing, storage, preset CRUD, import/export, alarms, operation queues, refresh-aware jobs, and messages between the panel and page adapter.
- `sidepanel.html` — Side panel shell and script order.
- `sidepanel.js` — Pins the panel to the tab that opened it and forwards messages.
- `ui.js` — Side panel rendering, saved-class editor, Attendance card, paste-USN controls, progress messages, and event handling.
- `ui.css` — Side panel layout, cards, buttons, editor, progress states, page navigation, and pasted-USN panel styling.
- `core.js` — Preset validation, field definitions, date handling, page-aware filter planning, cache keys, and preset backups.
- `attendance-core.js` — Attendance scope validation, roster validation, copy/apply planning, pasted-USN parsing, and temporary attendance-pattern creation.
- `adapter.js` — Runs in the Jain page’s MAIN world so native ASP.NET, Chosen, Bootstrap multiselect, and checkbox events work correctly.
- `attendance-core.js` and `adapter.js` are injected dynamically by `background.js` when needed.
- `INSTALL.txt` — Original Chrome installation instructions and safety notes.

## Original regular attendance features

The original extension supported saved regular attendance filter presets with these fields:

- Program — `Body_ddlGraduationType`
- Academic batch — `Body_ddlAcademicBatch`
- Course year / semester — `Body_ddlcourseyearsem`
- Specialization — `Body_ddlBranch`
- Course — `Body_ddlsubject`
- Section — `Body_ChklstSection`, a multi-select/check-list field
- Session No. — `Body_ddlperiod`, optional in regular presets

It also supported:

- Current Date and Previous Date settings.
- Regular Theory/Lab settings.
- Optional fixed Theory/Lab override on a preset.
- Saved class names, categories, category collapse state, reorder, edit, delete, search, undo delete.
- Preset backup export/import.
- Cached live options for editor use only; the runner always validates against live website options.
- Filter application through native website controls and ASP.NET postbacks.
- Manual-operation cancellation when the user interacts directly with the website.
- Stop, timeout, retry, and website-refresh detection.

The extension never clicks the website’s Save button automatically. The user must review and save attendance manually on the website.

## Chronological implementation history

1. The original extension provided regular-attendance saved presets, date selection, Theory/Lab selection, filter application, attendance copy/apply, categories, ordering, import/export, and operation cancellation/retry behavior.
2. Presets were extended with `pageType`, allowing the same preset system to support both Regular and Remedial attendance without mixing fields between pages.
3. The Remedial attendance page was added with Attendance Type, Specialization, Course, and Section fields. Its Previous Date flow was ordered as date radio, Attendance Type, date input, then the remaining filters.
4. The Remedial Section control was made refresh-aware: open it, clear the auto-selected value, wait for the real page refresh, reopen it, select the saved Section, and wait for Period No to populate.
5. Attendance copy/apply was generalized for regular, remedial, and compatible student-table pages. Date and session/period differences no longer block a valid roster match.
6. Copy labels were made page-aware so users can tell whether the stored list came from Regular attendance, Remedial attendance, or a generic student table.
7. A collapsed Paste Student USNs panel was added to the Attendance card. It supports exact USN matching, unmatched-USN protection, Mark listed Absent, Mark listed Present, and a local Clear button.
8. Pasted USN changes were optimized to use the same refresh-aware attendance plan/action path as Apply to this session rather than a slower separate operation.
9. Navigation was moved above the Attendance card and changed to compact, colored buttons labeled Regular attendance and Remedial attendance.
10. Category groups can be reordered by drag and drop or Alt+Up/Down; Uncategorized remains last.
11. Copied attendance summaries include the selected Section label.

## Preset storage and compatibility updates

Presets now have a page discriminator:

```json
{
  "pageType": "regular" | "remedial"
}
```

Older presets without `pageType` are treated as `regular`.

The preset schema was advanced internally to schema version `5`. Portable preset backups now use format version `2`; version `1` backups remain importable and are treated as regular presets.

Backup entries include:

- `name`
- `category`
- `pageType`
- `classTypeOverride` for regular presets
- page-specific saved fields

Preset application blocks a preset on the wrong attendance page before changing website controls.

## Remedial attendance presets

Remedial presets use the same saved-class library and editor as regular presets. They are linked internally by `pageType`, not by the user’s class name.

Remedial preset fields:

- Attendance Type — `Body_dwdlAttendanceType`
- Specialization — `Body_ddlBranchRemidial`
- Course — `Body_ddlsubject`
- Section — `Body_lstBxSection`, Bootstrap multiselect

Period No is deliberately not saved in a remedial filter preset. The user selects Period No manually after filters are applied.

Remedial page controls:

- Current Date — `Body_rdCurrentDate`
- Previous Date — `Body_rdNextDate`
- Date input — normally `Body_txtdDAad`; the adapter also supports inputs whose ID contains `txtxFromDate`.

Remedial filter order:

1. Select the date radio.
2. Select Attendance Type.
3. Apply the entered previous date when Previous Date is selected.
4. Apply Specialization, Course, and Section.
5. Leave Period No for manual selection.

## Remedial Section refresh flow

The remedial site auto-selects Section but does not always populate Period No. The preset runner therefore uses a stateful sequence inside the same preset button:

1. Open the visible Bootstrap multiselect dropdown.
2. Uncheck the currently selected Section through the visible checkbox.
3. Suppress the intermediate postback and submit one final native Section change.
4. Wait for actual ASP.NET page revision/document refresh, not a fixed sleep.
5. Open the dropdown again.
6. Select the Section values saved in the preset.
7. Submit the second native Section change.
8. Wait for the refresh that populates Period No.

The job tracks `sectionPhase` values such as `cleared` and `selected`. Failure messages distinguish clearing Section from selecting the preset Section.

## Attendance copy and apply

The Attendance card supports:

- Copy attendance
- Copy again
- Apply to this session
- Clear copied attendance

Copies are labeled in the UI as:

- Regular attendance copied
- Remedial attendance copied
- Student-table attendance copied for generic compatible tables

Copied attendance stores student USN, Registration No, and Present/Absent state. Student identity is validated by both USN and Registration No.

Regular copy scope includes:

- Program
- Batch
- Semester
- Specialization
- Course
- Section
- Session No.

Remedial copy scope includes:

- Attendance Type
- Specialization
- Course
- Section
- Period No.

Important compatibility rules:

- Period No may differ when applying remedial copied attendance.
- Regular Session No may differ when applying regular copied attendance.
- Copied attendance may be applied on a different date; date is no longer a blocking comparison.
- Page type, page path for generic tables, origin, logged-in account, class context, and student roster must still match.
- Different or unsafe student rosters stop the operation before changes are applied.
- Already-recorded attendance is protected.

The existing apply runner changes one differing checkbox at a time. It restores the remaining checkbox pattern in memory, clicks one native checkbox, waits for the site refresh, then rereads the table.

## Pasted Student USN feature

The Attendance card contains a collapsed `Paste Student USNs` panel. It is opened by clicking the panel header.

Inside the panel:

- Student USNs multiline text box.
- Compact Clear button aligned to the right of the `Student USNs` label.
- Mark listed Absent button.
- Mark listed Present button.

Behavior:

- Checked means Present.
- Unchecked means Absent.
- Only listed students change.
- Unlisted students retain their current state.
- Pasted USNs are extracted from alphanumeric tokens separated by spaces, commas, tabs, newlines, or other non-alphanumeric separators.
- Matching is exact after trimming and uppercase normalization.
- No header row is assumed or removed.
- Unmatched USNs are reported before any checkbox is changed.
- Duplicate pasted USNs are processed once.
- The pasted text is not stored as persistent attendance data.

The pasted-list operation creates a temporary full attendance pattern:

- Listed students receive the requested Present/Absent state.
- Unlisted students receive their current live state.

That temporary pattern is sent through the same `Attendance.plan` and `adapter.attendanceAct` path used by Copy attendance / Apply to this session. This is intentional: it gives pasted lists the same refresh-aware behavior and speed as copied attendance.

Each changed checkbox:

1. Is located by USN and Registration No.
2. Is clicked using its native website checkbox behavior.
3. Triggers the site’s ASP.NET postback.
4. Waits for page revision/document refresh.
5. Is verified before the next student is processed.

## Compatible generic student tables

The adapter recognizes a compatible table when:

- `Body_gdvStudents` exists.
- A header contains `Student USN`.
- A header contains `Registration No`.
- Student rows contain checkboxes whose IDs include `chckselect`.

The supplied remedial table uses this exact structure. Example identifiers from the remedial page:

- Table — `Body_gdvStudents`
- Student checkbox pattern — `Body_gdvStudents_chckselect_*`
- Registration No header — `Registration No`
- Student USN header — `Student USN`

Student-table copy/paste operations can run on any Jain ERP-origin page with this compatible table. Saved filter preset application remains restricted to the known Regular and Remedial attendance URLs.

## UI navigation and current appearance

Above the Attendance card are two compact light-blue buttons:

- Regular attendance
- Remedial attendance

The pasted-USN panel is collapsed by default. Its text is preserved while collapsed, and the Clear button clears only that text.

## Important background message types

Existing messages include:

- `PANEL_OPEN`
- `STATE`
- `OPEN_PAGE`
- `SET_SETTINGS`
- `CAPTURE`
- `APPLY`
- `STOP`
- `DISMISS_JOB`
- `SAVE_PRESET`
- `DELETE_PRESET`
- `REORDER_PRESETS`
- `CREATE_CATEGORY`
- `RENAME_CATEGORY`
- `DELETE_CATEGORY`
- `SET_CATEGORY_COLLAPSED`
- `EXPORT_PRESETS`
- `IMPORT_PRESETS`
- `COPY_ATTENDANCE`
- `APPLY_ATTENDANCE`
- `CLEAR_ATTENDANCE`
- `PASTE_STUDENTS`

Page operations are serialized per tab. Preset storage is serialized separately. Running operations use Chrome session storage and alarms so they can continue across service-worker suspension.

## Safety behavior

- Direct user interaction with website controls cancels an active filter or attendance operation.
- Student roster duplicates, missing USNs, missing Registration Nos, disabled rows, pagination, or changed rosters stop the operation.
- Unmatched pasted USNs stop before any changes.
- Wrong preset page type stops before website changes.
- Existing attendance copy data is not overwritten by pasted-USN operations.
- The extension does not automatically click the website Save button.

## Testing status and limitations

The project has had parser and fixture-based checks in prior development. The latest category-order and Section-label changes have not yet been live-verified on the ERP site. The user reports the main Remedial and pasted-USN behavior is verified, with additional live verification planned.

The final verification must be done in Chrome by:

1. Reloading the unpacked extension at `chrome://extensions`.
2. Opening the Regular attendance URL.
3. Opening the Remedial attendance URL.
4. Testing filter presets, date order, Section refresh, Period No selection, copy/apply, pasted USNs, unmatched USN reporting, and different date/period targets.
5. Testing any additional Jain ERP page that exposes the compatible `Body_gdvStudents` table.

When changing the adapter, preserve its MAIN-world behavior and increment the adapter version if the injected interface changes incompatibly. `background.js` currently expects adapter version `5`.
