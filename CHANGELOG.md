# Changelog

## 1.4.0 - 2026-11-05

- Create and save categories independently of presets, including empty groups.
- Select categories from a dropdown directly above the optional Class type section; create new ones inline if needed.
- Preserve empty categories in backups and after deleting the last class.
- Dismiss Preset removed and its Undo action after five seconds.

## 1.3.0 - 2026-11-05

- Add optional user-defined preset categories with collapsible groups and remembered expansion state.
- Choose an existing category or type a new one while creating/editing a class; uncategorized classes remain available.
- Include categories in preset backups and search, while keeping class reorder within each category.

## 1.2.3 - 2026-11-05

- Place attendance status and errors directly below the Attendance card.
- Keep filter, date/settings, preset backup/editor, and capture feedback beneath their originating sections.
- Retain the two-second success timeout.

## 1.2.2 - 2026-11-05

- Replace white active selections with filled indigo Date, blue Theory, and violet Lab controls.
- Add color-tinted saved class and edit buttons with matching Theory/Lab badges.
- Keep compact layout, restrained glass, readable contrast, and existing behavior.

## 1.2.1 - 2026-11-05

- Open attendance in the current browser tab by default; Ctrl-click opens a new background tab.

## 1.2.0 - 2026-11-05

- Restore copied attendance in the same editable session as well as other sessions, with existing class/date/identity and roster checks intact.
- Export portable preset backups and import them without overwriting existing classes; skip exact duplicates and validate files before writing.
- Backups contain class presets only, excluding student attendance, dates, account identity, and runtime settings.

## 1.1.9 - 2026-11-05

- Show an explicitly green Ready badge on the attendance page.
- Rename the project root to Jain ERP Assist and update the unpacked-extension path.

## 1.1.8 - 2026-11-05

- Visual-only refresh with restrained glass surfaces, opaque form controls, dark readable text, and subtle shadows.
- Distinct purple Copy, blue Apply, neutral saved classes, and dark Save this class buttons.
- Preserve compact sizing, section order, and all existing behavior.

## 1.1.7 - 2026-11-05

- Slightly reduce working-area fonts, button heights, and section spacing while retaining the layout and button colors.

## 1.1.6 - 2026-11-05

- Place Attendance Copy/Apply directly below branding, followed by attendance settings and saved classes.

## 1.1.5 - 2026-11-05

- Replace the attendance settings caption with a compact Open attendance shortcut to the Regular Class Attendance page.

## 1.1.4 - 2026-11-05

- Rename the visible extension branding to Jain ERP Assist, with an independent-tool description.
- Keep existing presets and copied attendance compatible.

## 1.1.3 - 2026-11-05

- Restore the complete copied attendance pattern before each checkbox postback, including checked students accidentally unticked in the target session.
- Verify the full roster after refresh; Save remains manual.
- Add regression coverage for five copied absences plus extra unsaved target absences.

## 1.1.2 - 2026-11-05

- Distinguish purple Copy / Copy again buttons from blue Apply buttons.

## 1.1.1 - 2026-11-05

- Give Copy attendance / Copy again the raised blue button style so available actions look clearly clickable.

## 1.1.0 - 2026-11-05

- Copy attendance from the loaded student list and apply it to another session of the same class/date.
- Primary USN matching with registration-number cross-checks and full roster/context validation.
- Restore present and absent states through native checkbox postbacks; verify results and clean up temporary page hooks.
- Compact Attendance controls with counts, Copy again, Apply, Clear, and Stop. No automatic Save or page monitoring.
- Locally remembered copy survives page/panel/browser restarts independently of presets.
- Synthetic full/partial postback, mismatch, panel closure, Stop, and retry checks.

## 1.0.0 ? 2026-11-05

Completed filter-flow baseline before attendance copying:

- Compact native side panel with saved class buttons, editing, reordering, optional Theory/Lab overrides, and live dropdown validation.
- Previous Date DD/MM entry, remembered editable year, date reset, and Current Date/Theory defaults on fresh openings.
- Attendance Type left entirely to the website; temporary page access only during explicit capture/application.
- Website dropdown messages, brief success feedback, NK Developers credit, and visible version beside branding.
- Existing implementation tests and preserved old extension reference.

Attendance copying is planned separately; no attendance-marking implementation is included.
