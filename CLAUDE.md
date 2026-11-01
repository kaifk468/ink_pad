# InkPad: Claude Code instructions

@AGENTS.md

Read the **Current Status** section of `project-context.md` before starting work (not the whole file; it is long). Append a dated entry after significant work, as AGENTS.md says.

## Model routing

The main session runs **Sonnet 5.5** (`.claude/settings.json`). Settings do not switch models by themselves; routing happens through the subagents in `.claude/agents/` and through the user's `/model` choice.

| Work | Who | Model / effort |
|---|---|---|
| Feature work, refactors, tests, debugging, reviews, normal design decisions | main session | Sonnet 5.5, medium; high for hard debugging |
| Repository exploration, finding files and call sites | `codebase-explorer` | Haiku 5.5, low |
| README, project-context.md entries, handoff summaries | `documentation-agent` | Haiku 5.5, low |
| Isolated large implementation | `engineering-agent` | Sonnet 5.5, medium |
| Isolated hard investigation | `debugging-agent` | Sonnet 5.5, high |
| Costly-if-wrong decisions (document format, data integrity, concurrency, security, major trade-offs, high-impact review) | `architecture-reviewer` | Opus 5.5, high |

Escalation: Haiku, then Sonnet, then Opus only when needed.
- A Haiku task that needs reasoning or implementation goes to Sonnet. Do not retry the same failed approach with a weaker model.
- Escalate to `architecture-reviewer` only for genuine risk or complexity, or after two different Sonnet approaches failed. Difficult-looking is not enough. For critical architecture the reviewer can be called directly.
- After Opus analysis, implement with Sonnet.
- Do not delegate when the main session can do it in a call or two. Pass subagents only the task and the file paths, not the conversation.

## Token discipline

- Read only relevant files; do not rescan the repo or reread unchanged files. Reuse what the session already established.
- Prefer targeted greps and tail/grep of logs over dumping output. Run focused tests while developing.
- Keep replies and docs short; no long write-ups for small changes.
- Keep this file and the agent files stable so prompt caching stays effective.
- Never skip tests, edge cases or the full `npm test` and `npm run build` before reporting to save tokens. Correctness comes first.
