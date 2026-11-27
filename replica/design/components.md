# Sing365 components

Tokens: `tokens.json` / `tokens.css` (Tailwind v4 `@theme inline`, utilities like `bg-surface text-text-muted border-border-input rounded-md shadow-card`).
Base: shadcn/ui on Radix primitives (accessible behaviour), restyled with these tokens only. Icons: Lucide (ISC). Fonts: Inter, JetBrains Mono (OFL).
Contrast: 26 pairs, 0 failing AA (light and dark), checked with `contrast.py`.

No raw hex or pixel values in components. A missing value goes into the tokens first.

Every interactive component: visible `focus-visible` ring (2px `focus`, 2px offset), full keyboard use, 44px minimum touch target in the add-in pane, `prefers-reduced-motion` turns motion to 0.

## 1. Panel primitives

```
Button
  variants  primary (bg accent, text on-accent), secondary (bg surface-raised, border), ghost, danger
  sizes     sm 32px, md 36px, lg 44px
  states    default, hover (accent-hover), active, focus-visible, disabled (50% opacity, no pointer), loading (spinner, label kept for screen readers, aria-busy)
  tokens    radius md, type sm/600, padding-x space 3/4
  a11y      real <button>; icon-only buttons need aria-label and a tooltip
  used on   all

Input / Textarea / Select / Combobox
  states    default, hover, focus-visible, invalid (border danger + message), disabled, read-only (self-service locked fields)
  tokens    border-input, radius md, height 36px, type sm
  a11y      <label for>, error via aria-describedby, required marked in text not colour only
  used on   S05 properties, S06, S09, S10, S11, S12, S13

Placeholder picker  (combobox of directory fields)
  groups    Person (name, title, department), Contact (phones, email), Office (address, company), Custom attributes
  shows     field key, sample value of the preview user, "empty for this user" badge
  a11y      type-ahead, arrow keys, Enter inserts {{field}} token chip
  used on   S05, S09

Data table
  features  sort, row select, bulk actions bar, column visibility, drag-reorder rows (S04 priority), pagination 50
  states    loading (skeleton rows), empty (illustration slot + primary action), filled, error (retry)
  a11y      <table> semantics, sortable headers are buttons with aria-sort, drag has keyboard alternative (move up/down)
  used on   S04, S11, S14, S17, S19

Condition builder
  rows      [who: sender | recipient | exception] [field] [operator: is / is not / contains / in group / in department / domain is] [value]
  logic     all of / any of, per block
  states    empty ("applies to everyone"), valid, invalid row, conflict warning (another rule with higher priority fully covers this one)
  summary   plain-language sentence under the builder, e.g. "Sales department, external recipients, replies only"
  used on   S06, S09, S10

Scheduler
  modes     always, date range, repeating (weekly / monthly), with IANA time zone select (default Europe/Istanbul)
  states    upcoming, live, ended (computed badge)
  used on   S06, S10

Stepper
  states    done, current, upcoming, error
  used on   S02, S13

Status badge
  variants  neutral, accent, success, warning, danger; always icon + text
  used on   S03, S04 (draft/published), S10, S11 (sync), S13

Stat tile, line/bar chart
  states    loading, no data (explains why: "no events yet"), filled
  used on   S03, S15, S16

Toast, Confirm dialog, Sheet (side panel)
  confirm   destructive actions name the object ("Delete 'Sales EU'?"), danger button, Esc cancels
  used on   all

Copy block  (for PowerShell, DNS/SPF records, manifest URL)
  mono font, copy button with "Copied" toast, wraps long lines
  used on   S13
```

## 2. App shell

```
Sidebar   248px, collapsible to 64px; groups: Signatures, Campaigns, People, Analytics, Settings
Header    56px; tenant name, sync status dot, help, account menu
Content   max 1200px, padding space 8; designer (S05) is full-bleed
Mobile    sidebar becomes a sheet under 1024px; designer shows read-only preview under 768px
```

## 3. Signature designer (S05)

```
Layout       three panels: element palette (left, 240px) | canvas (centre) | properties (right, 320px)
Canvas       renders the exact HTML from packages/render inside an iframe; zoom 100/150%; toggles: preview user, new vs reply, light/dark, desktop/mobile width
Elements     text, field, image/logo, user photo, divider, spacer, columns (2-3), social icons, button-link, banner slot, disclaimer slot
Element states  hover outline, selected (2px accent outline + handles), dragging (ghost), drop target line, hidden-when-empty indicator
Properties   per element: content, font stack (signature.font_stacks only), size (11-20), colour (brand kit swatches first), spacing, link, alt text (required for images), "hide when empty"
Keyboard     tab through elements, arrows move selection, Alt+Up/Down reorder, Delete removes, Ctrl+Z / Ctrl+Shift+Z
Save model   autosave draft; Publish bumps version and shows a diff count of affected users
Validation   blocks publish when: image missing alt, image over 2 MB, width over 600px, unknown placeholder
```

## 4. Outlook add-in pane (S20)

```
Width     320px min, fluid; Fluent-like density but Sing365 tokens
Content   current signature preview, "Change signature" list (assigned ones only), editable fields form when allowed
States    signing in, inserted (success badge), no signature assigned (explains who to ask), offline (uses cached version, warning badge), error (retry)
Note      event-based insert has no UI; the pane is only for choice and self-service
```

## 5. Signature output rules (packages/render)

The product's real output is HTML inside other people's email clients, so these rules matter more than the panel's look:

```
Structure   <table role="presentation"> layout only, inline styles only, no <style> blocks relied on, no flexbox/grid, no SVG, no web fonts
Width       max 600px; images carry width and height attributes; 2x source images
Fonts       signature.font_stacks (Arial, Verdana, Segoe UI, Georgia stacks)
Sizes       11-20px; name 16px, body 13px default
Colours     brand kit colours; text never lighter than #666 on white (5.74:1); links underlined or clearly coloured
Dark mode   avoid pure black text on transparent PNG logos (add 2px light padding or a logo variant); test Outlook and Apple Mail dark
Empty data  a row whose only field is empty is removed, not left blank
Plain text  every signature also renders a text/plain version (relay and fallbacks)
Accessibility  alt on every image, real text for name/phone (never text inside an image), tel: and mailto: links
```

## Next

The primitives get built at the start of `/replica-build` (there is no app scaffold yet): a `/design` route in `apps/web` showing every component above in every state, screenshotted as the design-system check.
