# AI agent working agreement

This file records Felipe's standing preferences for AI-assisted work in the
Meal Planner repository. Update it whenever a new preference is agreed.

For product scope and the long-term roadmap, read
`docs/CONSUMER_APP_PLAN.md`. It is tracked in this repository. Update it when
a material product or technical decision changes.

## Planning and approval

- For every medium or large feature, create a concise plan document before
  implementation. The plan must state the goal, affected areas, proposed
  changes, important design decisions, validation, and any open questions.
- Present that plan for Felipe's review and wait for explicit approval before
  making code, schema, configuration, or other implementation changes for the
  feature. Revise the plan first if its scope or design materially changes.
- A small, self-contained, low-risk change may be made without a formal plan;
  explain the change and validation clearly.

## Working style

- Work incrementally. Explain decisions, tradeoffs, and implementation details
  in depth so Felipe understands every change. Agents may write the code unless
  Felipe explicitly asks to write it himself. When a focused hands-on exercise
  would materially help Felipe learn, recommend it before deferring that piece.
- Preserve unrelated work and use read-only inspection before changing an
  unfamiliar repository or potentially shared file.
- Use feature branches and focused commits for repository work. Show a
  reviewable diff before committing when requested.
- Before starting a separate or unrelated feature, confirm the current branch
  fits that feature; create or switch to a clearly named feature branch when
  it does not. Do not implement or commit work directly on `main` unless
  Felipe explicitly agrees to that exception.
- Run validation proportionate to the change and report what was checked.
- Before implementing with a technology or library, consult its current official
  documentation and verify guidance against the version installed or resolved in
  the project. Proactively recommend appropriate dependency upgrades for
  security or useful capabilities, but do not make those upgrades without
  including them in an approved plan or receiving explicit approval.
- Never commit secrets, tokens, `.env` files, or personal data.
