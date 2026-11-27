# InkPad UI round 1 (2026-11-27), branch ui-polish

Round 1 ran without push access, so its commits only existed as a patch in the claude.ai project. Round 2 re-applied them in one commit on top of desktop-20x c2f2f68 ("UI round 1 (restored from the round-1 patch …)"). The full report is the claude.ai project doc `claude/inkpad-ui-round-1-2026-11-27.md`.

Summary: design brief and desktop tokens; the hamburger dropdown became a left menu sheet with search (Diagram, Page, Preferences, Help; Clear canvas alone at the bottom, never run by Enter); hand-written "Start your diagram" empty page with key chips and a template button; welcoming empty Library; toast above the dock; accent focus rings. Tablet unchanged. Checks then: npm test 1633/1633, build ok, headless walk, Opus review fixed.
