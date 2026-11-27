# Build log

| ID | date | status | missing | harder than expected |
| --- | --- | --- | --- | --- |
| shell | 2026-11-27 | done | real session/tenant (uses seed tenant) | Tailwind v4 `@theme inline` needs prefixed raw vars to avoid self-reference |
| packages/rules | 2026-11-27 | done | | deciding "no recipients yet": internal rules wait, external rules match |
| packages/render | 2026-11-27 | done | images need hosted HTTPS URLs (R2 in backend) | |
| S03 dashboard | 2026-11-27 | partial | real counts, sync errors, onboarding links | |
| S04 signatures list | 2026-11-27 | partial | create, duplicate, folders, reorder | |
| S05 preview | 2026-11-27 | partial | the drag-and-drop editor itself; rule trace text is English (engine strings) | |
| S11 users | 2026-11-27 | partial | search, paging, attribute editing | |
| S20 add-in | 2026-11-27 | partial | NAA token auth; tried only in a simulated Office runtime, not real Outlook | classic Outlook on Windows runs a JS-only runtime, so the script is served with the API origin baked in |
| /design | 2026-11-27 | done | dialog, table, condition builder, scheduler primitives (built with their screens) | |

Vertical slice status: compose in (simulated) Outlook -> API -> rule engine -> renderer -> signature inserted. Works on seed data.
