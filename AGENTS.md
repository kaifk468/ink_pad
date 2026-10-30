# Coding Rules

## Project Context Maintenance

- Before starting any task, read `AGENTS.md` and `project-context.md`.
- Significant tasks include feature additions, bug fixes, behavior changes, and architectural changes. After each, verify the outcome against the code, update the concise Current Status in `project-context.md`, and append a dated history entry there. Preserve existing history.
- Record only implemented behavior and actual checks run with their results. Note known issues, device-only verification still needed, and concrete next steps. Do not infer success from intent or a passing build alone.
- Keep this lightweight: read context before work; write updates after significant work. Trivial formatting-only edits do not require a history entry.

- Keep changes focused and follow the existing React, TypeScript, Canvas, and test patterns.
- Inspect the existing implementation and relevant docs before changing behavior; prefer the smallest compatible change.
- Preserve stored canvas coordinates and saved diagram compatibility; do not rebase or migrate drawing data without explicit need.
- Preserve S Pen input, touch navigation, pointer cancellation/capture, workspace bounds, connectors, selection, minimap, and snapshot undo/redo unless the task explicitly changes them.
- Keep drawing gestures separate from viewport gestures. Two-finger touch is pinch zoom; three-finger touch pans; S Pen draws or edits according to the active tool.
- Reuse existing canvas item and history models. Do not add derived render artifacts as independent canvas items.
- Add or update regression tests for behavior changes. Run `npm test` and `npm run build`; report actual results and any device-only checks that remain.
- Automated tests do not substitute for S Pen/tablet verification; distinguish verified code behavior from unverified device behavior in reports.
- Do not change application behavior, dimensions, or persisted data as part of documentation-only tasks.
