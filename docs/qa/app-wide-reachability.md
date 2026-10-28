# App-wide reachability acceptance checklist

Baseline: `codex/app-wide-reachability`, approved October 27, 2026. Covers all
64 page-route patterns classified in `docs/plans/app-wide-page-reachability.md`.
Automated results belong in that plan; this checklist records device evidence.
No row is physically accepted merely because its component/router tests pass.

## Check every applicable row

Use the current phone appearance. Open a long populated page, scroll to its
last row/action, and release. It must stay above visible navigation/home
indicator and remain tappable. Also check short/empty content: no large blank
scroll range or duplicate space beneath the native header.

On forms/searches, show and hide the keyboard, switch fields, then return from
a nested selector or emoji sheet. Headers/search must remain accessible, list
results must reset to the first match on a new query, and the last action must
stay reachable. Repeat relevant pages with longer names and larger text. Native
short sheets must still drag normally; Back/Cancel/dismiss must preserve the
originating draft. Use disposable test content and avoid destructive actions
against the live Mac trial household.

`Pending` below means no post-change device result has been reported.

| Page/content family | Frame and variants to exercise | iPhone | Android |
| --- | --- | --- | --- |
| Plan root | All seven days, populated/empty slots, last meal | Pending | Unrun |
| Recipes root | Grid/list, short/long/empty/search, pull refresh | Pending | Unrun |
| Shopping root | Long To buy/Purchased, final Clear list action, search/filter sheets, swipes/checkoff | Pending | Unrun |
| Catalog root | Food/Household, long/empty/grouped/search | Pending | Unrun |
| Profile root | Final hub action | Pending | Unrun |
| My account | Stack header plus visible bottom tabs | Pending | Unrun |
| My households | Many memberships, empty/error/refresh | Pending | Unrun |
| Create household | Name/time zone, keyboard and create action | Pending | Unrun |
| Household details | Long member/invitation content, final action | Pending | Unrun |
| Edit household | Name/time zone and save | Pending | Unrun |
| Member details | Last owner/member action, larger text | Pending | Unrun |
| Invitations | Long list/create/result/error, final copy/share action | Pending | Unrun |
| Archived recipes | Long/empty list, last restore row | Pending | Unrun |
| Manage catalog | Last navigation card and explanatory text | Pending | Unrun |
| Catalog item details | Food/Household, long values, final edit/archive area | Pending | Unrun |
| Catalog Add/Edit item | Ordinary tab-stack form, fields and final action | Pending | Unrun |
| Shopping Create Catalog item | Ordinary tab-stack form, return to picker | Pending | Unrun |
| Shopping Edit Catalog item | Full-screen modal without tabs, correct home-indicator clearance | Pending | Unrun |
| Manage choices | Category, Store, Shopping Unit; Catalog and Recipes tab-stack origins | Pending | Unrun |
| Create/Edit choices | All three kinds; Catalog and Recipes tab-stack origins | Pending | Unrun |
| Shopping choice manager/create/edit | All three kinds; full-screen modal, no phantom tab-bar gap | Pending | Unrun |
| Category Create | Food/Household preselection and controls, long name, emoji, bottom Create | Pending | Unrun |
| Category Edit | Inline Name, fixed Type, Emoji, item count, header Save; keep deletion confirmation | Pending | Unrun |
| Recipe details | Long ingredient/direction content, final action | Pending | Unrun |
| New/Edit recipe | Long ingredient/direction lists, optional fields, keyboard, header Save | Pending | Unrun |
| Plan Create recipe/Food | Reused tab-stack editors and Catalog return | Pending | Unrun |
| Review Shopping needs | Long source lists, last need, fixed Add action | Pending | Unrun |
| Recipe Food picker | Long results; search stays visible; Create pinned; Back preserves search/draft | Pending | Unrun |
| Ingredient details | New/default/overridden/no unit; fractions/To taste, note and Save under keyboard | Pending | Unrun |
| Shared choice picker | Recipe Unit plus Catalog Category/Store/Unit/measurement; long search and custom/create/manage actions | Pending | Unrun |
| Shopping picker | Previously accepted header/results/footer; keyboard open/close, add several items | Pending | Unrun |
| Shopping details | Amount/unit/store, keyboard, final save/remove action | Pending | Unrun |
| Plan Add/Edit meal | Recipe search, fixed save/remove controls under keyboard | Pending | Unrun |
| Plan Day picker | Last available date and native dismissal | Pending | Unrun |
| Shopping amount sheet | Input, Reset and Add/Done above keyboard | Pending | Unrun |
| Recipe Cover/Emoji | Long names/larger text, last choice/entry action | Pending | Unrun |
| Category emoji | Clear/Cancel/Done, keyboard show/hide, return draft intact | Pending | Unrun |
| Time-zone picker | Onboarding and household-edit origins, last search result and Done | Pending | Unrun |
| Sign-in/up | Standalone frame, email/code keyboard and final action; no tab padding | Pending | Unrun |
| Onboarding | Welcome, profile completion, create/join/select household | Pending | Unrun |
| Startup/API error | Standalone loading/retry/sign-out, no tab-bar assumptions | Pending | Unrun |

Web smoke check: build/export plus representative tab-root, tab-stack, modal,
choice/custom-entry, and keyboard/mouse Back/Cancel interactions. Record actual
browser testing separately from a successful export. Dedicated light/dark
visual review remains a major-deployment gate. Do not infer Android or the
second iPhone's acceptance from a single iPhone report.

Emoji follow-up, October 27: visually check Category list/picker/edit preview,
Catalog item category badge, Recipes grid/row/detail/editor covers, Plan recipe
covers, and the Recipe emoji entry preview. Tops and bottoms must be fully
visible at each icon size, including a flag or joined-family emoji; repeat with
larger phone text to ensure fixed icon containers remain intact. These physical
checks are pending. Current focused automation: 6 suites / 126 tests plus
TypeScript/lint; the earlier full 400-test runs precede this follow-up.
