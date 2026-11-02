# EdgeFolio app — "2026" UI refresh (app 1.0.26)

Goal: the phone app (APK/mobile, Capacitor 7 + React 18 + Tailwind 3) should look and feel like a
current premium app, not a plain admin panel. **No behaviour/API changes** — visual layer only.
Every page must still compile (`npm run build` = tsc + vite) and all existing logic stays intact.

## Design language

- **Canvas:** near-black `#07080d` with a fixed "aurora" behind everything: 2–3 large blurred radial
  glows (violet `#7c3aed`, indigo `#4f46e5`, cyan `#06b6d4`) at ~15–25 % opacity, top-left/top-right,
  plus a very faint noise-free vignette. Pure CSS (`body::before` / a fixed `<div class="aurora">`).
- **Brand gradient:** `linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #22d3ee 100%)`
  (indigo → violet → cyan). Used for primary buttons, the hero card, active nav pill, logo mark.
- **Glass surfaces:** cards = `rgba(255,255,255,0.045)` fill, `1px rgba(255,255,255,0.08)` border,
  `backdrop-blur(16px)`, radius **22–28 px**, subtle inner top highlight
  (`inset 0 1px 0 rgba(255,255,255,0.06)`).
- **Type:** *Plus Jakarta Sans Variable* bundled offline via `@fontsource-variable/plus-jakarta-sans`
  (the app must work offline — no Google Fonts CDN). Headings bold/extra-bold with tight tracking
  (`-0.02em`); numbers `tabular-nums`. Small labels uppercase `tracking-[0.12em] text-[10.5px]`.
- **Colour roles:** text `#f4f5fb` / muted `#9aa0b8` / faint `#5d6380`; success `#34d399`,
  warning `#fbbf24`, danger `#fb7185`, info `#60a5fa`.
- **Motion:** page content fades/slides up 8 px over 260 ms (`.animate-enter`, stagger children with
  `animation-delay` utility classes); buttons `active:scale-[0.97]` with 150 ms transition; status dot
  pulse ring when "working". Respect `prefers-reduced-motion` (disable animations).
- **Navigation:** floating **pill tab bar** — fixed, 12 px from the sides and bottom (+ safe-area),
  glass, radius 999, height 64; active tab shows a gradient pill behind icon + label; inactive icons
  muted. Applies to both EmployeeShell and AdminShell (admin has up to 6 tabs → icon + short label at
  10 px, still fits 360 px wide).

## Implementation steps

1. **Install font:** in `APK/mobile` run
   `NODE_TLS_REJECT_UNAUTHORIZED=0 npm install @fontsource-variable/plus-jakarta-sans --strict-ssl=false`
   (this project uses npm + package-lock.json). Import it in `src/main.tsx`.
2. **`tailwind.config.js`:** remap tokens so every existing class modernises automatically:
   - `brand` → indigo/violet scale: 50 `#eef2ff`, 300 `#a5b4fc`, 400 `#818cf8`, 500 `#6366f1`,
     600 `#5b4ff0`, 700 `#4f46e5`, 900 `#1e1b4b`.
   - `surface.bg` `#07080d`, `surface.DEFAULT` `rgba(255,255,255,0.045)`,
     `surface.light` `rgba(255,255,255,0.09)`, add `surface.raised` `#11131c` (opaque, for
     drawers/sheets/select dropdowns where glass behind text would be unreadable).
   - success/warning/danger/info as above. `fontFamily.sans` = `['"Plus Jakarta Sans Variable"', 'system-ui', 'sans-serif']`.
   - `borderRadius`: add `'4xl': '28px'`. `boxShadow.glow`: `0 10px 40px -10px rgba(99,102,241,0.55)`.
   - `backgroundImage.brand`: the brand gradient; keyframes/animation `enter`, `pulse-ring`.
3. **`src/index.css`:** body bg + aurora; `@layer components` with reusable classes:
   `.glass` (card), `.glass-strong`, `.btn-primary` (brand gradient, white bold text, rounded-2xl,
   shadow-glow, active scale), `.btn-ghost` (glass button), `.input` (glass input, focus ring
   `ring-2 ring-brand-500/60`), `.label-caps`, `.chip`, `.text-gradient` (gradient text via
   bg-clip), `.animate-enter` + `.delay-1..5`. Native `<select>`/`<option>` and `input[type=month|date]`
   get `color-scheme: dark` so pickers are dark. Reduced-motion media query.
4. **Shells:** `EmployeeShell.tsx`, `AdminShell.tsx` → floating pill nav (step above); main
   `paddingBottom: calc(96px + env(safe-area-inset-bottom))`. AdminShell header: glass bar with
   avatar circle (gradient, initial), name + role chip, the two icon buttons as round glass buttons.
   Keep the existing `paddingTop: '52px'` status-bar inset and all logic/handlers unchanged.
5. **Hand-redesign the first-impression screens** (keep every handler, state and text meaning):
   - `ServerSetupPage.tsx`, `LoginPage.tsx`, `CreateCompanyPage.tsx`, `ForgotPasswordPage.tsx`,
     `ChangePasswordPage.tsx`: centred hero — 72 px gradient logo tile with glow ("E"), big bold
     title (one word gradient), muted subtitle; form in a glass card; `.input`/`.btn-primary`;
     Google button = white pill with a coloured "G" mark (inline SVG, 4-colour Google G) +
     "Continue with Google"; secondary links small and muted.
   - `employee/HomePage.tsx`: header (avatar ring as today, greeting + name, live clock in a glass
     chip); connection status as a small chip, not a full-width bar; **hero card** = brand gradient
     with soft decorative circles, status pill with pulse dot, huge check-in time / hours, white
     pill CTA; stats = 3 glass tiles with a small coloured icon each; announcement + holiday as
     glass rows with a tinted icon bubble.
   - `admin/CompanyPage.tsx`: company code in a gradient-bordered glass card with very large
     gradient mono code; licence/owner rows as glass rows; actions as `.btn-primary` / `.btn-ghost`
     with icon bubbles; export card glass.
   - `AttendancePage.tsx`: glass cards, big gradient circular "Mark" button feel where the main
     action is.
6. **Sweep the rest** (all other pages in `src/pages/**` and `src/components/AttendanceCalendarDrawer.tsx`):
   replace `rounded-xl border border-surface-light bg-surface` style cards with `glass` (or
   `rounded-3xl` equivalents), primary buttons → `btn-primary`, inputs → `input`, page wrappers get
   `animate-enter`. Replace hard-coded old colours (`sky-*`, `#0ea5e9`, `#38bdf8`, `#0f172a`,
   `#1e293b`) with brand/surface tokens (`text-brand-300`, etc.). Drawers/bottom sheets/modals use
   `bg-surface-raised` (opaque) + `rounded-t-4xl`. Don't restructure logic.
7. **Native chrome:** `android/app/src/main/res/values/styles.xml` (and colors if present): status
   bar + navigation bar colour `#07080d`, light-content icons; splash/window background `#07080d`.
   `index.html`: `<meta name="theme-color" content="#07080d">`.
8. **Version:** bump app to 1.0.26 / versionCode 36 (`android/app/build.gradle` + `package.json`
   version + anywhere the UI shows the version string — grep `1.0.25`).
9. **Verify:** `npm run build` passes with zero TS errors. Do not run the Android build/install.

## Out of scope
Backend, API shapes, routing, auth/offline logic, EDGE desktop UI.
