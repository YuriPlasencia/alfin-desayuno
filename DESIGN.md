---
name: Al Fin Desayuno
description: La pizarra de turnos del equipo para llegar al desayuno con todo resuelto.
colors:
  aluminum-frame: "#e8edf5"
  aluminum-frame-deep: "#dce3ee"
  aluminum-edge: "#c3ccda"
  enamel-board: "#ffffff"
  enamel-well: "#f3f6fa"
  ink: "#0f172a"
  ink-soft: "#334155"
  ink-muted: "#5b6b82"
  rule: "#e2e8f0"
  rule-strong: "#cbd5e1"
  marker-blue: "#1d3fbf"
  marker-blue-deep: "#16309a"
  marker-blue-wash: "#e9eefc"
  marker-blue-line: "#b9c7f2"
  marker-red: "#d33a2c"
  marker-red-deep: "#b42d21"
  marker-red-wash: "#fdeceb"
  marker-green: "#15803d"
  marker-green-deep: "#116632"
  marker-green-wash: "#e5f4ea"
  amber: "#b45309"
  amber-wash: "#fdf2e1"
  yolk: "#f2b21b"
  rail-navy: "#12205a"
  rail-navy-raised: "#1a2b70"
  rail-ink: "#c9d3f5"
typography:
  display:
    fontFamily: "Figtree Variable, Figtree, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "clamp(26px, 3vw, 34px)"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  numeral:
    fontFamily: "Figtree Variable, Figtree, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 850
    lineHeight: 1
    letterSpacing: "-0.04em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Figtree Variable, Figtree, system-ui, sans-serif"
    fontSize: "21px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Figtree Variable, Figtree, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 750
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Figtree Variable, Figtree, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "Figtree Variable, Figtree, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Figtree Variable, Figtree, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 650
    lineHeight: 1.3
  column-head:
    fontFamily: "Figtree Variable, Figtree, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "0.07em"
rounded:
  board: "18px"
  card: "14px"
  tile: "12px"
  control: "10px"
  control-sm: "9px"
  check: "6px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "20px"
  xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.marker-blue}"
    textColor: "{colors.enamel-board}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "42px"
  button-primary-hover:
    backgroundColor: "{colors.marker-blue-deep}"
  button-success:
    backgroundColor: "{colors.marker-green}"
    textColor: "{colors.enamel-board}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "42px"
  button-success-hover:
    backgroundColor: "{colors.marker-green-deep}"
  button-soft:
    backgroundColor: "{colors.marker-blue-wash}"
    textColor: "{colors.marker-blue-deep}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "42px"
  button-outline:
    backgroundColor: "{colors.enamel-board}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "42px"
  button-ghost:
    textColor: "{colors.marker-blue}"
    rounded: "{rounded.control}"
    padding: "0 8px"
    height: "42px"
  button-danger:
    backgroundColor: "{colors.marker-red-wash}"
    textColor: "{colors.marker-red-deep}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "42px"
  input:
    backgroundColor: "{colors.enamel-board}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "9px 12px"
    height: "42px"
  magnet:
    backgroundColor: "{colors.enamel-board}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 10px 0 5px"
    height: "28px"
  magnet-me:
    backgroundColor: "{colors.marker-blue-wash}"
    textColor: "{colors.marker-blue-deep}"
    rounded: "{rounded.pill}"
  chip:
    backgroundColor: "{colors.enamel-board}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.pill}"
    padding: "0 12px 0 8px"
    height: "34px"
  chip-selected:
    backgroundColor: "{colors.marker-blue-wash}"
    textColor: "{colors.marker-blue-deep}"
  badge-late:
    backgroundColor: "{colors.marker-red-wash}"
    textColor: "{colors.marker-red-deep}"
    rounded: "{rounded.pill}"
    padding: "3px 9px"
  badge-soon:
    backgroundColor: "{colors.amber-wash}"
    textColor: "{colors.amber}"
    rounded: "{rounded.pill}"
    padding: "3px 9px"
  badge-done:
    backgroundColor: "{colors.marker-green-wash}"
    textColor: "{colors.marker-green-deep}"
    rounded: "{rounded.pill}"
    padding: "3px 9px"
  card:
    backgroundColor: "{colors.enamel-board}"
    rounded: "{rounded.card}"
    padding: "20px"
  board:
    backgroundColor: "{colors.enamel-board}"
    rounded: "{rounded.board}"
    padding: "26px 28px 24px"
  kanban-column:
    backgroundColor: "{colors.aluminum-frame-deep}"
    rounded: "{rounded.card}"
    padding: "12px"
  nav-rail-item-active:
    backgroundColor: "{colors.enamel-board}"
    textColor: "{colors.marker-blue}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  nav-rail-item:
    textColor: "{colors.rail-ink}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
---

# Design System: Al Fin Desayuno

## Overview

**Creative North Star: "La pizarra de turnos"**

The app is the office shift whiteboard. White enamel sits inside a blue-grey aluminum frame. Four markers write on it: blue for action and navigation, red for urgency and column headers, green for done, and ink black for everything else. People are round or pill-shaped color magnets with a short, real drop shadow. Activities move across columns (Pendiente, En curso, Hecho). Checking off a step draws a marker check stroke, and a finished activity jumps to Hecho.

Density is calm and operational, built mobile first for a thumb. The board is the hero object: a framed white panel with a marker tray under it, holding the event title, the countdown, team progress, the dashed "tu imán" zone with your own markable steps, and the three-column mini board. Around it, plain white cards on aluminum hold the supporting lists. There is one sans (Figtree) and no gradients, glass or blur anywhere in the build. Depth comes from physical objects (the frame, magnets) rather than floating UI.

The world rejects the generic dashboard of white KPI cards with a progress ring over cream and terracotta.

**Key Characteristics:**
- Aluminum frame (#e8edf5) as the page, white enamel as every writing surface.
- Four markers with fixed jobs: blue acts, red warns and heads columns, green finishes, ink reads.
- People are magnets: colored dot plus name in a pill, with a short hard-edged drop shadow.
- Column-based progress (Pendiente / En curso / Hecho) instead of rings or KPI tiles.
- Marker-stroke check animation as the signature feedback.
- A single sans, Figtree, at heavy display weights (750 to 850) with tabular numerals.

## Colors

A cool aluminum-and-enamel neutral field carrying four saturated marker colors, each with a deep (text and hover), a wash (tinted background), and, for blue, a line value.

### Primary
- **Marker Blue** (`marker-blue`): action and navigation. Primary buttons, the board title, active nav and segmented state, progress fills, focus rings (2.5px outline), the caret and form accents, column-header underlines (2px). **Marker Blue Deep** handles hover and text on the blue wash. **Marker Blue Wash** fills soft buttons, the "me" magnet, info strips and the empty "tu imán" zone. **Marker Blue Line** draws the dashed "tu imán" border and the outline of anything that belongs to the current person.

### Secondary
- **Marker Red** (`marker-red`): urgency and column headers. It draws the countdown box (2px border and numerals), the mobile nav count badge and danger text. **The shipped value is #d33a2c, not the contract's #E5483A.** This is a contrast adaptation: #d33a2c gives about 4.76:1 for white text on red and for red text on white, while #E5483A gives about 3.95:1 and fails 4.5:1. #E5483A survives only inside the brand mark and favicon artwork (the red magnet dot), where it is illustration, not text. **Marker Red Deep** carries red text on tinted grounds: the uppercase column labels on the grey trays (kept at 4.5:1 or better), late badges, alert strip, danger button, error toast, the expense label). **Marker Red Wash** fills blocked items and alert strips.

### Tertiary
- **Marker Green** (`marker-green`): done. It covers the check stroke and checked box, the success button, the win toast, income figures and the live dot. **Marker Green Deep** handles hover, the "Hecho" column header on its grey tray, and text on the green wash.
- **Yolk** (`yolk`): the breakfast warmth note, kept small. It appears in the "Desayuno" subtitle on the rail, the sidebar countdown meter, the "nuevo" tag (ink text on yolk), the coordinator star and the win-toast icon.
- **Amber** (`amber`) on **Amber Wash**: "soon" due-date badges, the offline bar and free-capacity counts. It is a status color, not a marker.

### Neutral
- **Aluminum Frame** (`aluminum-frame`): the page background, the frame around the board.
- **Aluminum Frame Deep** (`aluminum-frame-deep`): kanban column trays, progress tracks, segmented control trays and empty magnet dots.
- **Aluminum Edge** (`aluminum-edge`): the board's outer frame ring, the marker tray, and dashed empty-state borders.
- **Enamel Board** (`enamel-board`): every writing surface, including the board, cards, inputs, magnets, topbar and bottom nav.
- **Enamel Well** (`enamel-well`): recessed areas inside white surfaces, such as mini-board columns, table headers and footers, and hover on list rows.
- **Ink** (`ink`), **Ink Soft** (`ink-soft`), **Ink Muted** (`ink-muted`): primary text, secondary text, and metadata.
- **Rule** (`rule`) and **Rule Strong** (`rule-strong`): 1px dividers and card borders, plus control borders and unchecked boxes.
- **Rail Navy** (`rail-navy`), **Rail Navy Raised** (`rail-navy-raised`), **Rail Ink** (`rail-ink`): the desktop navigation rail, its hover and countdown card, and its resting text.

People and areas carry their own data colors (a fixed set of ten mid-saturation hues assigned per member or area). These appear only as magnet dots, area dots and avatars, never as UI chrome.

### Named Rules
**The Four Markers Rule.** Blue acts, red warns or heads a column, green means done, ink reads. A marker never takes another marker's job. Blue is never a status, and green is never a call to action other than "complete".

**The Contrast-Adapted Red Rule.** Interface red is #d33a2c and its deep #b42d21. The brighter #E5483A belongs to the brand mark artwork only and never appears as text, border or fill in the UI.

**The Belongs-To-Me Rule.** Anything that belongs to the current person (their magnet, task cards, roster row, member card) shifts to the blue wash or is outlined in Marker Blue Line. Nothing else uses that treatment.

## Typography

**Display Font:** Figtree Variable (with Figtree, system-ui, -apple-system, Segoe UI, Roboto, sans-serif)
**Body Font:** Figtree Variable (same stack)

**Character:** A single friendly geometric sans throughout. Hierarchy comes from weight (400 to 850) and size, not from a second family. Headings use tight negative tracking. Numerals that count something are always tabular.

### Hierarchy
- **Display** (800, clamp(26px, 3vw, 34px), -0.03em): the board title ("Desayuno · 21 nov"), set in Marker Blue.
- **Numeral** (850, 40px, -0.04em, tabular): the countdown, 32px under 640px. Related figures use 800 at 22 to 28px (team percent, budget and ledger figures, sidebar days at 40px).
- **Headline** (800, 21px): modal titles and the splash title.
- **Title** (750, 16 to 17px): card heads (17px), task, agreement and member titles (16px).
- **Body** (400, 15px, line-height 1.5): base text. List and step text run at 14 to 14.5px, and step labels at 14px/1.35.
- **Label** (650, 13.5 to 14.5px): buttons, chips, magnet names (13px), nav items (14.5px rail, 11px bottom nav). Field labels use 700 at 13px.
- **Column Head** (800, 12.5px, 0.07em, uppercase): the board column labels only, in Marker Red (Marker Green for Hecho) over a 2px Marker Blue rule. The same uppercase small-caps treatment appears only on the countdown unit ("días") and the yolk "nuevo" tag.

### Named Rules
**The One Sans Rule.** Figtree is the only family. Add emphasis with weight (650, 750, 800), never with a second face.

**The Tabular Count Rule.** Every number that counts days, steps, money or people uses tabular numerals.

## Layout

Celular primero. On desktop (above 960px), a 248px sticky Rail Navy column sits left of the main column. The main column has a sticky white 60px topbar and content capped at 1320px with 28px gutters (28px top, 96px bottom). At 960px and below the rail disappears. The topbar becomes the mobile brand plus your own magnet selector (56px). A fixed white bottom nav with five 52px-tall items carries navigation, and content padding drops to 16px 14px 104px.

The home board is inset 8px inside its frame (6px on mobile), padded 26px 28px 24px (20px 18px 18px on mobile), and leaves 22px below for the marker tray. Supporting content uses a two-column 1.15fr / 0.85fr split that collapses to one column at 1180px. The activities kanban runs as horizontally scrolling columns (min 248px). On mobile those become 84%-wide scroll-snapped columns. The home mini board stays three columns down to 390px, tightening to 6px gaps.

Spacing rhythm: 6 / 10 / 14 / 20 / 28px. 20px is the vertical stack gap between page blocks and the default card padding (16px under 640px). 14px is the grid gap for card grids and kanban columns. 10px separates items inside a column. Breakpoints are 1180px, 960px and 640px. Tap targets reach 44px on mobile for steps, 42px for controls.

## Elevation & Depth

This is a hybrid system. Most UI is flat white enamel on aluminum with a soft ambient lift. Physical objects get real, short shadows, and the board gets a literal frame. Shadows describe objects, not importance.

### Shadow Vocabulary
- **Magnet** (`box-shadow: 0 2px 3px -1px rgba(15,23,42,0.28), 0 1px 0 rgba(15,23,42,0.08)`): anything that behaves like a magnet stuck to the board. Covers people magnets, the actor selector, the active rail item, the active segmented button and selected chips.
- **Magnet dot** (`box-shadow: 0 1px 2px rgba(15,23,42,0.35)`): the colored dot inside a magnet and on avatars (avatars use `0 2px 3px -1px` at 0.35).
- **Card** (`box-shadow: 0 1px 2px rgba(15,23,42,0.05), 0 6px 16px -10px rgba(15,23,42,0.22)`): cards, task cards, agreements and member cards.
- **Small** (`box-shadow: 0 1px 2px rgba(15,23,42,0.06)`): count pills in column headers.
- **Overlay** (`box-shadow: 0 24px 48px -24px rgba(15,23,42,0.38)`): modals, toasts and the splash brand.
- **Board frame** (`box-shadow: 0 0 0 7px #d3dae6, 0 0 0 8px #c3ccda, 0 20px 36px -22px rgba(15,23,42,0.45)`): the home board only. It is a 7px aluminum frame plus a 1px edge plus a cast shadow, with a 7px Aluminum Edge marker tray hanging below.

### Named Rules
**The Real Magnet Rule.** The magnet shadow is short and tight (2 to 3px) because a magnet sits flush on enamel. Never blur it into a floating glow, and never give it to things that are not movable markers of state or identity.

**The One Frame Rule.** Only the home board wears the aluminum frame and tray. Other surfaces are plain cards.

## Shapes

The shapes are soft rectangles and full pills. The board uses 18px corners, as do modals. Cards and kanban trays use 14px. Mini-board columns, task cards and toasts use 12px. Controls (buttons, inputs, search, nav items) use 10px, and small buttons and segmented items 9px. Checkboxes and step boxes use 6px. Everything that represents a person or a count is a full pill or circle (999px or 50%): magnets, chips, badges, count pills, avatars, the live dot and swatches.

Borders are 1px Rule on cards and 1px Rule Strong on controls. Dashed borders mean a slot. The 2px dashed Marker Blue Line marks "tu imán", the 1.5px dashed Aluminum Edge marks empty states and empty kanban columns, and the dashed Rule Strong marks the step editor and "+N más".

## Components

### Buttons
Firm and tactile. They press down 1px on active.
- **Shape:** gently rounded (10px; 9px for the small 34px size).
- **Primary:** Marker Blue with white text, 42px tall, 16px horizontal padding, 650 weight. A tight colored under-shadow (`0 2px 4px -2px` blue at 0.6). Hover goes to Marker Blue Deep.
- **Success:** Marker Green, same geometry, for "mark done" actions. Hover goes to Marker Green Deep.
- **Soft:** Marker Blue Wash with Marker Blue Deep text. Hover #dce4fb.
- **Outline:** white with a 1px Rule Strong border and Ink Soft text. Hover turns border and text Marker Blue.
- **Ghost:** Marker Blue text with 8px padding. Hover is the blue wash. Inside the alert strip it turns Marker Red Deep.
- **Danger:** Marker Red Wash with Marker Red Deep text. Hover #f9d9d6.
- **Icon button:** 36px square, 9px radius, Ink Muted. Hover is Enamel Well with Ink.
- **Focus / Disabled:** global 2.5px Marker Blue outline at 2px offset. Disabled is 0.55 opacity.

### Magnets (signature)
People as physical magnets.
- **Style:** white pill, 28px tall (32px on the team wall), 1px Rule border, magnet shadow, 18px colored dot at left, name at 13px/650.
- **Me:** blue wash fill, Marker Blue Line border, Marker Blue Deep text.
- **Pins:** 12px colored dots, overlapping-free rows, used on mini-board cards to show who is assigned.
- **Actor selector:** a 38px magnet holding the "quién soy" select, in the topbar on every viewport.

### Step check (signature)
- **Box:** 22px, 6px radius, 2px Rule Strong border on white.
- **Done:** the box turns Marker Green on the green wash. A 3.2px round-capped green stroke draws in over 0.32s via stroke-dashoffset with the out-expo ease. The label turns Ink Muted with a 1.5px Rule Strong strike-through.
- **Row:** min 40px (44px on mobile), 8px radius, hover is 6% Marker Blue.

### The Board (signature)
- White enamel with 18px corners in the aluminum frame plus tray (see Elevation).
- Head: Display title in Marker Blue, subline in Ink Soft at 14.5px, and the **countdown** box at right with a 2px Marker Red border, 12px radius, 40px/850 red numerals and an uppercase unit.
- Team meter: 22px/800 percent, 12px-tall progress track.
- **Tu imán zone:** 16px padding (12px mobile), 2px dashed Marker Blue Line border, 14px radius. It holds your magnet, greeting and step checks.
- **Mini board:** three Enamel Well columns (12px radius). Each has a Column Head over a 2px blue rule, a white count pill, and white 8px-radius item cards. Blocked items use the red wash with a #f2b9b3 border.

### Kanban columns
- Aluminum Frame Deep trays (14px radius, 12px padding). The blocked column uses #f8dedb. They share the Column Head style with the mini board. Task cards inside are white, 12px radius, 15px 16px padding, card shadow. My task cards add a 1px Marker Blue Line ring.

### Chips
- **Style:** white pill, 34px, 1px Rule Strong border, 13.5px/600 Ink Soft, with a 14px colored dot.
- **Selected:** blue wash, Marker Blue Line border, Marker Blue Deep text, magnet shadow. Hover border is Marker Blue.

### Badges
- 999px pills, 3px 9px padding, 12px/700. Tones: late (red wash and deep), soon (amber wash and amber), done (green wash and deep), info (blue wash and deep), neutral (well and Ink Soft).

### Cards / Containers
- **Corner Style:** 14px.
- **Background:** Enamel Board. Done tasks and fulfilled agreements dim to #fbfcfd with Ink Muted titles.
- **Shadow Strategy:** the Card shadow (see Elevation). Info cards drop the shadow and sit on Enamel Well.
- **Border:** 1px Rule.
- **Internal Padding:** 20px (16px under 640px). Card heads are 17px titles with a 14px gap below.

### Strips
- **News ("desde tu última visita"):** blue wash with Marker Blue Deep text, 14px radius, 12px 14px 12px 16px padding, 14.5px.
- **Alert:** the same geometry in the red wash with Marker Red Deep.
- **Offline bar:** full-width amber wash, #8a3f06 text, 1px #f3d7ae bottom rule.

### Inputs / Fields
- **Style:** 42px min height, 9px 12px padding, 10px radius, 1px Rule Strong border, white, 15px Ink. Placeholder #8391a7.
- **Focus:** border turns Marker Blue with a 3px 14% blue halo (`0 0 0 3px rgba(29,63,191,0.14)`). Search uses the same treatment on focus-within.
- **Select:** custom chevron in Ink Muted, 34px right padding.
- **Labels:** 13px/700 Ink Soft above the field, hints at 12.5px Ink Muted.

### Navigation
- **Desktop rail:** Rail Navy, 248px. Items are 14.5px/600 Rail Ink with a 10px radius. Hover is Rail Navy Raised with white text. **Active is a white magnet**: white fill, Marker Blue text, magnet shadow. Count badges are 22px pills (12% white, or Marker Blue when active). A Rail Navy Raised countdown card with a yolk meter sits at the bottom.
- **Mobile bottom nav:** white with a 1px top Rule. Items are 52px tall, 11px/650 Ink Muted. Active is Marker Blue on the blue wash with a 10px radius. Counts are 17px Marker Red pills with a 2px white ring.
- **Segmented control:** Aluminum Frame Deep tray (12px radius, 4px padding). The active segment is a white magnet with blue text.

### Toasts
- Ink background, white 14px/550 text, 12px radius, overlay shadow, rising in 0.24s. The error toast uses Marker Red Deep. The **win** toast (activity jumped to Hecho) uses Marker Green with a yolk icon and a 0.42s pop.

### Motion
The ease is `cubic-bezier(0.16, 1, 0.3, 1)` for everything that moves meaningfully: the check stroke, progress fills (0.5 to 0.6s), modal and toast rise, and view transitions (0.38s). Hover color changes run 0.15s ease. Reduced motion collapses all durations.

## Do's and Don'ts

### Do:
- **Do** keep the page Aluminum Frame (#e8edf5) and every writing surface white enamel.
- **Do** use Marker Red #d33a2c (and #b42d21 for text on the red wash) for all interface red. Keep #E5483A inside the brand mark artwork only.
- **Do** represent people as magnets (colored dot plus name pill with the magnet shadow), and mark "mine" with the blue wash or a Marker Blue Line outline.
- **Do** show progress as columns (Pendiente / En curso / Hecho) with red uppercase column heads over a 2px blue rule, and as flat 8 to 12px progress tracks.
- **Do** give step completion the drawn green marker check (0.32s, out-expo).
- **Do** use tabular numerals for every count, date distance and amount.
- **Do** use dashed borders only to mean an open slot ("tu imán", empty columns, "+N más", the step editor).

### Don't:
- **Don't** use gradients, glass or backdrop blur. The materials are enamel, aluminum and marker ink.
- **Don't** add a second typeface. Figtree carries every role.
- **Don't** build KPI tile rows or progress rings for the dashboard. The board and its columns are the progress display.
- **Don't** blur the magnet shadow into a soft floating glow, or put the aluminum frame and tray on anything but the home board.
- **Don't** use member or area data colors for UI chrome. They belong to dots, magnets and avatars.
- **Don't** use Marker Blue for status or Marker Green for anything but completion.
