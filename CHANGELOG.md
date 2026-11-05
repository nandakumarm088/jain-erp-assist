# Changelog

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
