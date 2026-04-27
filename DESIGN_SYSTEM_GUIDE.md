# EDGEFOLIO - Design System & Component Guide
**Visual Reference & Best Practices**  
**Version:** 1.0 | **Date:** April 2026

---

## 🎨 Color System

### Primary Brand Colors
```
Sky Blue - Primary Brand Color
├── #f0f9ff (50)   - Lightest
├── #0ea5e9 (500)  - Main - USE THIS
├── #0284c7 (600)  - Darker
└── #0c3d66 (900)  - Darkest

Usage: Buttons, Links, Accents, Active States
```

### Semantic Colors
```
Success: #10b981
├── Background: #065f46
├── Text: #ecfdf5
└── Border: #d1fae5

Warning: #f59e0b
├── Background: #78350f
├── Text: #fef3c7
└── Border: #fde68a

Danger: #ef4444
├── Background: #7f1d1d
├── Text: #fee2e2
└── Border: #fecaca

Info: #3b82f6
├── Background: #1e3a8a
├── Text: #dbeafe
└── Border: #bfdbfe
```

### Dark Mode (Default)
```
Background:    #0f172a (slate-900)  - Darkest
Surface:       #1e293b (slate-800)  - Main
Surface-Light: #334155 (slate-700)  - Lighter
Text:          #f1f5f9 (slate-100)  - Light
Text-Secondary:#cbd5e1 (slate-300)  - Dimmer
Border:        #334155 (slate-700)  - Borders
```

---

## 📝 Typography

### Font Stack
```javascript
// Sans-serif (UI text)
-apple-system, BlinkMacSystemFont, "Segoe UI", 
"Roboto", "Oxygen", "Ubuntu", "Cantarell", sans-serif

// Display Font
"Inter", sans-serif (Google Fonts)

// Monospace (Code)
"JetBrains Mono", monospace
```

### Size Scale
```
Heading 1: 2.5rem (40px) - Bold (700)
Heading 2: 2.0rem (32px) - Bold (700)
Heading 3: 1.5rem (24px) - Semibold (600)
Heading 4: 1.25rem (20px) - Semibold (600)

Body Large:  1.125rem (18px) - Regular (400)
Body Medium: 1rem (16px) - Regular (400) [DEFAULT]
Body Small:  0.875rem (14px) - Regular (400)

Label:       0.875rem (14px) - Semibold (600)
Caption:     0.75rem (12px) - Regular (400)
```

### Usage Guidelines
```
Page Title:        H1 (2.5rem bold)
Section Title:     H2 (2rem bold)
Card Title:        H3 (1.5rem semibold)
Subsection:        H4 (1.25rem semibold)
Body Text:         Medium (1rem regular)
Small Text:        Small (0.875rem regular)
Labels:            Medium Label (0.875rem semibold)
```

---

## 📐 Spacing System (8px Grid)

```
0    = 0px
1    = 4px    (1/4 unit)
2    = 8px    (1 unit)    [DEFAULT GAP]
3    = 12px   (1.5 units)
4    = 16px   (2 units)   [DEFAULT PADDING]
6    = 24px   (3 units)
8    = 32px   (4 units)
12   = 48px   (6 units)
16   = 64px   (8 units)
```

### Common Usage
```
Page Padding:       24px (gap-6)
Card Padding:       16px (gap-4)
Button Padding:     12-16px
Input Height:       40-48px
Component Gap:      8px (gap-2)
Section Gap:        32px (gap-8)
```

---

## 🔘 Button Styles

### Button Variants

#### Primary (CTA - Call To Action)
```
State      Background              Text Color
Normal     #0ea5e9 (Sky-500)      White
Hover      #0284c7 (Sky-600)      White
Active     #0369a1 (Sky-700)      White
Disabled   #0ea5e9 @ 50% opacity  White

Usage: Main actions, form submission
```

#### Secondary
```
State      Background              Text Color
Normal     #334155 (Slate-700)     #f1f5f9
Hover      #475569 (Slate-600)     #f1f5f9
Active     #1e293b (Slate-800)     #f1f5f9
Disabled   #334155 @ 50% opacity   #f1f5f9

Usage: Alternative actions, less important
```

#### Tertiary (Ghost)
```
State      Background    Border                Text Color
Normal     Transparent   #475569 (Slate-600)  #38bdf8 (Sky-300)
Hover      #334155       #334155              #f1f5f9
Active     #475569       #334155              #f1f5f9
Disabled   Transparent   #334155 @ 50%        #94a3b8 @ 50%

Usage: Text-only actions, links
```

#### Danger
```
State      Background              Text Color
Normal     #ef4444 (Red-500)       White
Hover      #dc2626 (Red-600)       White
Active     #b91c1c (Red-700)       White
Disabled   #ef4444 @ 50% opacity   White

Usage: Destructive actions (delete, cancel)
```

### Button Sizes
```
XS: 28px height,  4px vertical × 12px horizontal padding, 12px text
SM: 32px height,  6px vertical × 14px horizontal padding, 14px text
MD: 40px height,  8px vertical × 16px horizontal padding, 14px text [DEFAULT]
LG: 48px height, 12px vertical × 24px horizontal padding, 16px text
XL: 56px height, 16px vertical × 32px horizontal padding, 18px text
```

---

## 📊 Component Specs

### Card Component
```
Background:     #1e293b (Slate-800)
Border:         1px solid #334155 (Slate-700)
Border Radius:  12px
Padding:        24px (default)
Shadow:         0 4px 6px -1px rgba(0,0,0,0.1)
Hover Shadow:   0 10px 15px -3px rgba(0,0,0,0.1)

Header:
- Background: #0f172a (Slate-900)
- Border-Bottom: 1px solid #334155
- Padding: 16px 24px

Footer:
- Background: #0f172a (Slate-900)
- Border-Top: 1px solid #334155
- Padding: 16px 24px
```

### Input Component
```
Height (MD):        40px (DEFAULT)
Height (SM):        32px
Height (LG):        48px

Padding:            8px 12px
Font:               14px (body-sm)
Border:             1px solid #334155 (Slate-700)
Border Radius:      8px
Background:         #0f172a (Slate-900)

Focus State:
- Border: Sky-500 (#0ea5e9)
- Ring: 2px ring-offset
- Box Shadow: 0 0 0 3px rgba(14, 165, 233, 0.1)

Error State:
- Border: #ef4444 (Red-500)
- Ring: 2px ring-red-500
- Text: #fecaca (Red-200)

Placeholder:        #94a3b8 (Slate-400)
Text:               #f1f5f9 (Slate-100)
```

### Table Component
```
Header Row:
- Background: #0f172a (Slate-900)
- Text: #f1f5f9 (Slate-100)
- Font Weight: 600
- Border-Bottom: 1px solid #334155

Data Rows:
- Background (even): #1e293b (Slate-800)
- Background (odd):  #0f172a (Slate-900)
- Hover: #334155 (Slate-700)
- Border-Bottom: 1px solid #334155

Cell Padding:       12px 24px
Text Color:         #f1f5f9 (Slate-100)
```

### Badge Component
```
Padding:        6px 12px
Font Size:      12px
Font Weight:    600
Border Radius:  9999px (full)

Default:   bg-slate-700 text-slate-100
Success:   bg-green-900 text-green-100
Warning:   bg-yellow-900 text-yellow-100
Danger:    bg-red-900 text-red-100
Info:      bg-blue-900 text-blue-100
```

---

## 🎭 Shadow System

```
Shadow XS:   0 1px 2px 0 rgba(0, 0, 0, 0.05)
Shadow SM:   0 1px 3px 0 rgba(0, 0, 0, 0.1)
Shadow MD:   0 4px 6px -1px rgba(0, 0, 0, 0.1)        [COMMON]
Shadow LG:   0 10px 15px -3px rgba(0, 0, 0, 0.1)      [CARDS/MODALS]
Shadow XL:   0 20px 25px -5px rgba(0, 0, 0, 0.1)
Shadow 2XL:  0 25px 50px -12px rgba(0, 0, 0, 0.25)    [DROPDOWNS]
```

---

## ✨ Border Radius

```
None:   0px
SM:     2px      (Subtle)
MD:     6px      (Default)
LG:     8px      (Cards, Inputs)      [COMMON]
XL:     12px     (Large Containers)
2XL:    16px     (Modals)
FULL:   9999px   (Badges, Avatars)
```

---

## ⏱️ Animation Timings

```
Fast:   150ms cubic-bezier(0.4, 0, 0.2, 1)  (Micro-interactions)
Base:   250ms cubic-bezier(0.4, 0, 0.2, 1)  (Default Transitions)  [COMMON]
Slow:   350ms cubic-bezier(0.4, 0, 0.2, 1)  (Page Transitions)
```

### Common Animations
```
Hover Transitions:     150ms (fast)
Button State Change:   150ms (fast)
Modal Appearance:      250ms (base)
Page Transitions:      350ms (slow)
Opacity Fade:          250ms (base)
Color Changes:         150ms (fast)
```

---

## 🎪 Responsive Breakpoints

```
Mobile:     < 640px      (SM)
Tablet:     ≥ 640px      (MD)
Desktop:    ≥ 768px      (LG)
Large:      ≥ 1024px     (XL)
Extra Large:≥ 1280px     (2XL)
```

### Layout Guidelines
```
Mobile:     1 column, full-width cards
Tablet:     2 columns, optimized spacing
Desktop:    3-4 columns, organized grid
Large:      4+ columns, expanded views
```

---

## 🌙 Dark Mode (Always Active)

```javascript
// CSS Variables approach
:root {
  --color-bg-primary:    #0f172a;
  --color-bg-secondary:  #1e293b;
  --color-text-primary:  #f1f5f9;
  --color-text-secondary:#cbd5e1;
  --color-accent:        #0ea5e9;
  --color-border:        #334155;
}

// Usage in components
background-color: var(--color-bg-secondary);
color: var(--color-text-primary);
border-color: var(--color-border);
```

---

## ♿ Accessibility Guidelines

### WCAG AA Compliance

#### Color Contrast
```
Text on Background:     Minimum 4.5:1 ratio
Large Text:             Minimum 3:1 ratio
UI Components:          Minimum 3:1 ratio

Examples:
✅ #f1f5f9 (text) on #0f172a (bg)   = 14:1 (Excellent)
✅ #0ea5e9 (accent) on #1e293b (bg) = 6.8:1 (Good)
```

#### Interactive Elements
```
Button Size:            Minimum 44px × 44px
Link Padding:           Minimum 8px
Focus Indicator:        Always visible (ring)
Focus Color:            Contrasting, visible
```

#### Forms
```
Labels Required:        Every input has label
Error Messages:         Clear, associated with field
Placeholder:            Not substitute for label
Required Fields:        Marked with asterisk (*)
Help Text:              Below field, smaller text
```

#### Keyboard Navigation
```
Tab Order:              Logical left-to-right, top-to-bottom
Focus Visible:          Always shown (no outline: none)
Skip Links:             For keyboard users
Escape Key:             Closes modals/dropdowns
Enter Key:              Submits forms, triggers buttons
```

---

## 🎯 Component Checklist

When building new components, ensure:
- [ ] Uses design system tokens (colors, spacing, shadows)
- [ ] Responsive design (mobile-first)
- [ ] Dark mode compatible
- [ ] Accessible (WCAG AA)
- [ ] Has loading state
- [ ] Has error state
- [ ] Has hover/active states
- [ ] Has disabled state
- [ ] Consistent with existing components
- [ ] Documentation provided
- [ ] No hardcoded colors/sizes
- [ ] Uses CSS variables/Tailwind

---

## 📚 Quick Reference

### Common Utility Classes
```javascript
// Spacing
px-4, py-2              // Padding
mx-auto, my-4           // Margin
gap-4, gap-6            // Gap between items

// Typography
text-sm, text-base      // Font size
font-semibold, font-bold // Font weight
text-slate-100          // Text color

// Display
flex, grid              // Display type
items-center, justify-between // Alignment
w-full, h-screen        // Width/Height

// Effects
shadow-md, shadow-lg    // Shadows
rounded-lg, rounded-xl  // Border radius
transition-all          // Transitions
hover:bg-slate-700      // Hover state

// Responsive
md:grid-cols-2          // Multi-column on tablet
lg:flex-row             // Flex direction on desktop
```

---

## 🚀 Best Practices

### Color Usage
```
✅ Use primary (sky-500) for important CTAs
✅ Use semantic colors for status/feedback
✅ Maintain 4.5:1 contrast ratio minimum
❌ Don't use more than 3 accent colors
❌ Don't rely on color alone for meaning
```

### Spacing
```
✅ Use 8px grid consistently
✅ Use design tokens for all spacing
✅ Maintain breathing room around elements
❌ Don't mix different spacing systems
❌ Don't hardcode pixel values
```

### Typography
```
✅ Use semantic HTML (h1, h2, p, label)
✅ Limit font sizes to 3-4 different sizes
✅ Use adequate line-height (1.5+)
❌ Don't use more than 2 font families
❌ Don't make text smaller than 12px
```

### Animations
```
✅ Use transitions for state changes
✅ Keep animations under 300ms for UI
✅ Respect prefers-reduced-motion
❌ Don't overuse animations
❌ Don't use animations for loading (use Spinner)
```

---

**Design System Version:** 1.0  
**Last Updated:** April 2026  
**Status:** ✅ Complete & Ready for Development

---

Use this guide to maintain consistency across all components and pages throughout EDGEFOLIO development.
