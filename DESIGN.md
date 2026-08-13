# LibraCore Design System

> Category: Enterprise ERP
> Professional B2B ERP for African school-book distributors. Thematic, multi-tenant, offline-first.

## Visual Theme & Atmosphere

Professional, warm-technical, modern African enterprise. Calm structure with data density — bento-grid layouts, generous padding, clear hierarchy. Designed for professional booksellers managing school inventory under pressure (rentrée scolaire). No ornament. Content-first, chrome-second.

7 theme modes: light, dark, POS (retail-flat), high-contrast (accessibility), sepia (warm editorial), corporate (red-brand), and system (follows OS).

## Color Palette & Roles

All tokens use Oklch color space. Colors carry meaning — they communicate state, hierarchy, and action.

### Surface & Background
- **Background** (`--background`): light `oklch(0.98 0.005 260)`, dark `oklch(0.13 0.015 260)`
- **Card** (`--card`): light `oklch(1 0 0)`, dark `oklch(0.17 0.015 260)`
- **Foreground** (`--foreground`): light `oklch(0.10 0.02 260)`, dark `oklch(0.95 0.005 260)`
- **Muted** (`--muted`): light `oklch(0.93 0.01 260)`, dark `oklch(0.22 0.015 260)`
- **Border** (`--border`): light `oklch(0.88 0.01 260)`, dark `oklch(0.27 0.015 260)`
- **Overlay** (`--overlay`): light `oklch(0 0 0 / 0.5)`, dark `oklch(0 0 0 / 0.6)`

### Semantic Colors
- **Primary** (`--primary`): Cobalt blue — action, interactivity, brand. Light `oklch(0.55 0.18 260)`, dark `oklch(0.68 0.18 250)`
- **Secondary** (`--secondary`): Warm charcoal — complementary actions
- **Destructive** (`--destructive`): Red — irreversible actions
- **Success** (`--success`): Green — positive states
- **Warning** (`--warning`): Amber — caution states
- **Info** (`--info`): Blue — informational states

### Module Colors (19 modules, stable across themes)
Each module has a recognizable hue that stays constant: POS (`oklch(0.55 0.18 250)`), Stock (`oklch(0.70 0.20 85)`), Catalog (`oklch(0.65 0.18 160)`), Cash (`oklch(0.70 0.20 85)`), Customers (`oklch(0.65 0.15 200)`), Sales (`oklch(0.60 0.22 10)`), Procurement (`oklch(0.50 0.20 260)`), Suppliers (`oklch(0.60 0.15 180)`), Inventory (`oklch(0.65 0.22 50)`), Returns (`oklch(0.60 0.20 350)`), Transfers (`oklch(0.55 0.20 290)`), Analytics (`oklch(0.60 0.15 220)`), Bourse (`oklch(0.70 0.20 85)`), Partner (`oklch(0.55 0.20 300)`), Alerts (`oklch(0.55 0.22 25)`), Loyalty (`oklch(0.75 0.18 95)`), RH (`oklch(0.60 0.20 350)`), Governance (`oklch(0.50 0.20 300)`), Finance (`oklch(0.60 0.18 150)`).

## Design Tokens

Extended CSS custom property system beyond semantic colors:

- **Spacing** (`--space-{1,2,3,4,5,6,8,12,16,20}`): 4px base scale (4–80px)
- **Radius** (`--radius-sm`: 0.5rem, `--radius-md`: 0.75rem, `--radius-lg`: 1rem); each theme overrides per its geometry
- **Focus-ring** (`--focus-ring`): per-theme focus ring via `color-mix()`
- **Type scale** (`--text-{xs,sm,base,lg,xl,2xl,3xl,4xl}`): 12px–48px
- **Container** (`--container-max`: 1280px, `--container-gutter{,-tablet,-phone}`)

New tokens mirror the same pattern as semantic colors — add to all 6 themes, use `var(--name)` in components.

## Typography Rules
- **Display / headings:** `'Inter', system-ui, -apple-system, sans-serif`, weight 600
- **Body:** `'Inter', system-ui, -apple-system, sans-serif`, weight 400
- **Mono:** `'JetBrains Mono', ui-monospace, monospace`
- Scale: 12 · 14 · 16 · 18 · 20 · 24 · 30 · 36 · 48
- Line-height: 1.5 body, 1.2 headings
- No letter-spacing on headings; standard tracking for body

## Component Stylings
- **Buttons:** 12px rounded, cva-driven (8 variants: default, destructive, outline, secondary, ghost, link, pos, primary). Primary = semibold, shadow-sm. POS variant = bold, tracking-wide, h-14, rounded-xl.
- **Cards:** bg-card, text-card-foreground, 1px border border-border, rounded-xl, shadow-[var(--shadow-card)]
- **Inputs:** 1px border border-input, rounded-xl, ring on focus-visible
- **Bento items:** Module-colored top border + icon, hover lift via translateY(-2px)
- **Badges:** Rounded-full, px-2.5 py-0.5, font-medium
- **Dialogs:** Fixed overlay with `var(--overlay)`, centered card, shadow-[var(--shadow-modal)]
- **Modals:** Centered, full-width, max-width breakpoint, backdrop-blur-sm optional, closable via overlay click

## Layout Principles
- Dashboard: sidebar (280px) + main content. Sidebar collapses on mobile.
- Bento-grid: 2-column desktop, 1-column mobile. Each module card = icon + title + description + link.
- Table: full-width, divided rows, sticky header, responsive scroll.
- Admin: KPI cards row + data tables (TopProducts, RecentSales, StockAlerts).
- POS: fixed bottom bar, keypad, ticket panel. Full-viewport height.

## Depth & Elevation
- **Flat (0):** default surface, cards rely on bg-card vs bg-background contrast
- **Shadow-card:** subtle `oklch(0 0 0 / 0.06)` — cards, dropdowns
- **Shadow-dropdown:** `0 4px 16px oklch(0 0 0 / 0.08)` — menus, popovers
- **Shadow-modal:** `0 20px 60px oklch(0 0 0 / 0.15)` — dialogs, side panels

## Motion
- **Duration-instant:** 100ms — micro-interactions, hover
- **Duration-fast:** 200ms — button transitions, focus
- **Duration-normal:** 300ms — panel open/close, page transitions
- **Duration-slow:** 500ms — entrance animations, loading
- **Ease:** custom cubic-bezier curves for out/in/in-out

## Accessibility
- AA contrast minimum on all text/background pairs
- Focus-visible ring on all interactive elements
- High-contrast theme for low-vision users (solid black/white, no shadows, 2px borders)
- Sepia theme for reading comfort (warm paper, serif font)
- Prefers-reduced-motion disables non-essential motion
- Touch targets ≥ 44px for all interactive elements

## Responsive Behavior
- **Desktop ≥ 1024px:** sidebar visible, bento 2-col, tables scroll within card
- **Tablet 768–1023px:** sidebar collapses to icons, bento 2-col
- **Phone < 768px:** bottom nav, bento 1-col, full-width tables

## Do's and Don'ts
- ✅ Use semantic tokens (`bg-card`, `text-foreground`, `border-border`) — never raw colors
- ✅ Use module colors for module-specific UI only (icon, badge, top border)
- ✅ Test every component in all 7 themes before merging
- ✅ Prefer Oklch color space for new tokens
- ❌ No hardcoded hex, indigo, slate, white, or black outside CSS variables
- ❌ No Tailwind arbitrary colors (`bg-[#...]`, `text-[#...]`)
- ❌ No component-specific color variables — use the shared semantic tokens

## Agent Prompt Guide
- Read `docs/design/03-theme-architecture-reference.md` for the full 9-phase architecture
- Read `apps/nextjs/src/styles/globals.css` for the complete token definitions
- Read `DESIGN.md` (this file) for design intent
- When creating new components, use `cva()` with Tailwind semantic classes
- Never add new color tokens without adding them to all 6 themes in globals.css
- Copy the `:root` block structure from existing components — button.tsx is the canonical reference
- When in doubt, subtract. Fewer boxes, less chrome, more space.
- Use module colors sparingly — the module icon + border is enough; text stays `text-foreground` or `text-muted-foreground`
