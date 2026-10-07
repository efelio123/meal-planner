# AI agent working agreement

This file records Felipe's standing preferences for AI-assisted work in the
Meal Planner repository. Update it whenever a new preference is agreed.

For product scope and the long-term roadmap, read
`docs/CONSUMER_APP_PLAN.md`. It is tracked in this repository. Update it when
a material product or technical decision changes.

## Planning and approval

- For every medium or large feature, create a concise plan document under
  `docs/plans/` before implementation. The plan must state the goal, affected
  areas, proposed changes, important design decisions, validation, and any
  open questions.
- Present that plan for Felipe's review and wait for explicit approval before
  making code, schema, configuration, or other implementation changes for the
  feature. Revise the plan first if its scope or design materially changes.
- A small, self-contained, low-risk change may be made without a formal plan;
  explain the change and validation clearly.

## Agent roles and handoff

- By default, the Codex chat agent works with Felipe on product/design decisions,
  writes and revises plans in `docs/plans/`, and reviews implementation results.
  It may update the roadmap or this working agreement when decisions change.
- The VS Code coding agent implements approved plans, including application
  code, tests, migrations, dependencies, and configuration. The Codex chat
  agent must not take over a larger planned implementation unless Felipe
  explicitly asks it to. Approval of a plan does not by itself change this
  division of work.
- After the VS Code agent delivers the larger implementation, either agent may
  handle a small, self-contained, low-risk bug fix in that slice. The Codex
  chat agent may make such a fix when Felipe asks for it, while preserving
  unrelated work and running proportionate validation. Scope-changing or
  substantial follow-ups return to planning and the VS Code agent by default.
- After approval, the planning agent provides a copyable handoff prompt that
  points to the plan and applicable design references, identifies the current
  branch and uncommitted work to preserve, and states validation and review
  expectations. The coding agent reports what changed and what remains
  unverified. Make clear which agent owns each follow-up.
- For other small changes that do not need a formal plan, use the VS Code
  coding agent by default. Avoid simultaneous edits by both agents in the
  shared worktree.

## Working style

- Work incrementally. Explain decisions, tradeoffs, and implementation details
  in depth so Felipe understands every change. The VS Code coding agent may
  write the code unless Felipe explicitly asks to write it himself. When a
  focused hands-on exercise would materially help Felipe learn, recommend it
  before deferring that piece.
- Preserve unrelated work and use read-only inspection before changing an
  unfamiliar repository or potentially shared file.
- Use feature branches and focused commits for repository work. Show a
  reviewable diff before committing when requested.
- Before starting a separate or unrelated feature, confirm the current branch
  fits that feature; create or switch to a clearly named feature branch when
  it does not. Do not implement or commit work directly on `main` unless
  Felipe explicitly agrees to that exception.
- Write the slice's code and tests before running them. Do not run tests during
  implementation; once the slice is mostly built and the intended edits are
  complete, run one coordinated, proportionate test pass and debug failures
  together. Report what passed and what remains unverified.
- For app UI reviews, compare related screens as well as each reference image.
  Similar actions should have consistent styling and interaction states unless
  a difference is intentional and documented.
- For routine feature and bug-fix UI checks, test the current appearance only;
  do not switch between light and dark mode each time. Run a dedicated light-
  and dark-mode visual pass before major deployments.
- In that final test pass, run the full disposable-PostgreSQL suite for major
  features or substantial schema/data changes, not for every small follow-up.
  For a focused change, run relevant targeted tests; include a database test
  when database behavior changes. Report skipped tests as unrun, not passing,
  and preserve the last full-suite result as historical validation rather than
  claiming it covers later edits.
- Before implementing with a technology or library, consult its current official
  documentation and verify guidance against the version installed or resolved in
  the project.
- Proactively evaluate dependency upgrades and new libraries when they offer
  meaningful security, compatibility, maintainability, or long-term product
  benefits, especially early in the project. Do not treat keeping dependencies
  unchanged as a goal, but do not add or upgrade packages merely to use the
  newest release or for a marginal benefit. Explain the benefit, alternatives,
  platform/SDK compatibility, migration costs, and validation in the plan.
  Implement dependency changes only through an approved plan or explicit
  approval.
- During this early phase, target a total cloud and CI cost of $0/month and
  research free options first. Never create paid resources, switch to a paid
  plan, add a payment method for a service, or accept any charge without
  Felipe's explicit approval. If a free quota is exhausted, let the service or
  workflow pause until reset rather than incur a charge.
- Never commit secrets, tokens, `.env` files, or personal data.

## Mobile source organization

- Keep `apps/mobile/src/app/` limited to Expo Router route screens and navigation
  layouts. Never place tests, non-route components, hooks, or utilities there.
- Put feature-specific supporting components, hooks, utilities, and tests under
  `apps/mobile/src/features/<feature>/`. Keep app-wide reusable UI in
  `src/components/`, shared hooks in `src/hooks/`, shared infrastructure in
  `src/lib/`, and theme/constants in their existing shared locations.
- Do not add a generic `shared/` directory. Create supporting folders only
  when needed; avoid empty scaffolding and unnecessary wrappers.
- Before moving feature code, identify the intended moves, update imports and
  tests, and preserve behavior. Do not reorganize unrelated authentication or
  onboarding code.
