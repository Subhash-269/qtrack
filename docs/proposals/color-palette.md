# Color palette: default and theme options

*Small research pass on 22 Nov 2026: one small-model research agent, 9 searches, plus local WCAG contrast checks of every proposed pair. The evidence on ADHD and color is weak. Treat the theme choices as design judgment built on general accessibility guidance, and test them with real users.*

## TL;DR

- **No solid research tells us which UI colors suit ADHD users.** The only studies found are small: females with ADHD discriminated blue and red saturation less accurately ([PMC4219036](https://pmc.ncbi.nlm.nih.gov/articles/PMC4219036/), [PMC4282194](https://pmc.ncbi.nlm.nih.gov/articles/PMC4282194/)). Claims that "calming colors help ADHD" come from blogs. So we lean on accessibility rules and calm, low-clutter design.
- **The current dark palette is close.** Main text and accents pass with plenty of margin, but three things need fixing:
  1. **The muted grey `#5F5E5A` fails as text** (2.7–2.9 : 1, against 4.5 needed). It's used for small labels such as "UP NEXT", hour labels and project names.
  2. **Input and button borders are almost invisible** (`#2C2C2A`, 1.2–1.4 : 1, against 3 : 1 needed for controls).
  3. **The red timer color is borderline as text on cards** (4.4 : 1).
- **Recommendation:** keep the current look as the default, retuned to the **Calm** values below. Offer **Soft**, **High contrast** and **Light** in settings, with **System** to follow the device. Keep project colors user-pickable, with a separate tuned set for the light theme.

## Rules we follow

| Rule | Requirement | Source |
|---|---|---|
| Text contrast | 4.5 : 1 (3 : 1 for large text) | [WCAG 1.4.3](https://www.w3.org/wai/wcag22/understanding/contrast-minimum.html) |
| Controls and meaningful graphics (borders of inputs, chart bars, status dots) | 3 : 1 | [WCAG 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast) |
| Never color alone | Pair color with a label or icon (status words, "bug" chip, timer text) | WCAG 1.4.1 |
| Dark mode | Dark grey rather than pure black, off-white text, desaturated accents | [Material dark theme](https://m2.material.io/design/color/dark-theme) |
| Color-blind safety | Use hue sets that stay distinct for red-green color blindness (e.g. [Okabe-Ito](https://figcanvas.com/blog/okabe-ito-palette-hex-rgb-wong-prism)) | Okabe & Ito 2002; Wong, *Nature Methods* 2011 |
| APCA | A candidate contrast method for WCAG 3, not yet a standard. Use WCAG 2 ratios as the pass/fail rule | [APCA intro](https://github.com/Myndex/apca-introduction) |

**What other apps do.** Things 3 offers Light, Dark and Black modes with a blue accent ([iClarified](https://www.iclarified.com/68749/things-3-now-lets-you-choose-between-light-dark-and-black-mode)). Todoist offers named color themes (Todoist, Dark, Moonstone, Tangerine, plus Pro themes) and an automatic dark mode ([help](https://www.todoist.com/help/articles/change-color-themes-zD0N5K)). Sunsama follows the system setting, and its users ask for theme choice ([roadmap](https://roadmap.sunsama.com/integrations/p/choose-own-theme-in-app)). Nothing could be confirmed for Tiimo, Structured, Llama Life or Yoodoo.

## Current palette, checked

Against the page background `#111110` / card `#1A1A18`:

| Token | Use | Contrast | Verdict |
|---|---|---|---|
| `#F1EFE8` text | headings, body | 16.4 / 15.1 | ✅ |
| `#D3D1C7` title | list titles | 12.3 / 11.4 | ✅ |
| `#888780` sub | secondary text | 5.2 / 4.8 | ✅ (just) |
| **`#5F5E5A` muted** | small labels, hour labels, project names | **2.9 / 2.7** | ❌ text |
| **`#2C2C2A` line** | input and button borders | **1.4 / 1.2** | ❌ for controls (fine for card dividers) |
| `#E24B4A` red | running timer | 4.8 / **4.4** | ⚠️ as text on cards |
| green / blue / amber / purple / pink | statuses, accents | 8–12 | ✅ |
| 10 project colors | dots, bars | 7.7–11.5 | ✅ |

## Proposed themes (role tokens)

Every value below was checked with the WCAG 2 formula. The first number is against the background, the second against cards/surfaces.

### 1. Calm (default, dark)

A slightly lifted, warmer dark with softer accents. It's closest to today's look.

| bg | surface | border | border-strong* | text | muted | accent/info | success | warning | danger |
|---|---|---|---|---|---|---|---|---|---|
| `#1B1B19` | `#222220` | `#34342F` | `#6E6D66` 3.3/3.1 | `#E6E4DC` 13.5/12.5 | `#9C9A92` 6.1/5.7 | `#8FB8D6` 8.2 | `#7FBFA0` 8.1 | `#E0B872` 9.3 | `#D98880` 6.4 |

\* **border-strong** is a new token for input and button borders, chosen to clear 3 : 1. Plain `border` stays for card edges and dividers, which are decorative.

### 2. Soft (low contrast, for sensory sensitivity)

| bg | surface | text | muted | info | success | warning | danger |
|---|---|---|---|---|---|---|---|
| `#202320` | `#282B27` | `#D8D6CC` 10.9/9.8 | `#8A897F` 4.5/**4.1** | `#9AB4C8` 7.4 | `#8DB59A` 7.0 | `#CFAE7A` 7.6 | `#C98A7B` 5.6 |

⚠️ Muted fails on surfaces (4.1). Lighten it to `#96958B` (4.8 : 1) before shipping.

### 3. High contrast

| bg | surface | border | text | muted | accent | success | warning | danger |
|---|---|---|---|---|---|---|---|---|
| `#000000` | `#111111` | `#6B6B66` 3.9 | `#FFFFFF` 21 | `#C8C8C2` 12.5 | `#7CC4FF` 11.2 | `#5FE0B0` 12.8 | `#FFD166` 14.6 | `#FF7A70` 8.3 |

### 4. Light

| bg | surface | border | text | muted | info | success | warning | danger |
|---|---|---|---|---|---|---|---|---|
| `#F7F6F2` | `#FFFFFF` | `#D6D4CC` | `#1F1E1C` 15.4 | `#6B6A64` 5.0 | `#1F5F9E` 6.1 | `#2E7D5B` 4.6 | `#8A5A00` 5.5 | `#B3261E` 6.0 |

Input borders in Light also need a border-strong of `#8C8A82` (3.2 : 1 on the background, 3.5 on white).

## Project colors

- **Dark themes:** keep today's 10 pastels. All are 7.7–11.5 : 1 on Calm, so they're very readable.
- **Light theme:** use a darker twin of each so dots and bars still stand out: `#6A5ACD #1F6FB2 #1E8A6A #9A6A00 #B8457A #0F7C93 #B4532A #5A7D1E #B23B3B #5F5E5A`. All are 4.0–6.0 : 1 on the light background, which passes the 3 : 1 rule for graphics.
- **Store one color index per project**, not a hex value, so each theme can show its own tuned shade. Today `projects.color` stores the hex value directly.
- **Never use color as the only identifier.** Project names already appear next to dots and in legends; keep it that way.
- **Color-blind check:** the pairs most likely to be confused are green/teal (`#5DCAA5` / `#6FC3D8`) and pink/red (`#ED93B1` / `#F09595`). Accept this for now because names always appear alongside. If users report trouble, offer an Okabe-Ito "color-blind safe" project set as an option.

## Status colors (keep, with labels)

| Meaning | Color | Always paired with |
|---|---|---|
| Running timer | red (danger) | the countdown and "Now · Focus" |
| Done / pass / break | green (success) | ✓ and the word |
| In progress / links | blue (info) | the word |
| Due today | amber (warning) | "today" / "from yesterday" |
| Skipped / let go | muted | the word |

Red stays reserved for the running timer, matching the calmer wording in the borrowed-ideas proposal.

## Suggested next steps

1. **Quick fix, no new feature:** raise small-label text from `#5F5E5A` to `#8A8983` (5.0 : 1 on cards), and give inputs and buttons a `border-strong`.
2. **Move colors into CSS variables.** Today they're scattered as inline hex values across App.jsx and the components. Using variables makes themes possible.
3. Ship **Calm** as the default, plus a **Theme** setting in the account menu: System, Calm, Soft, High contrast, Light.
4. Change project colors to an index, then add the light-theme twins.
5. Mock up the four themes side by side before building them.
