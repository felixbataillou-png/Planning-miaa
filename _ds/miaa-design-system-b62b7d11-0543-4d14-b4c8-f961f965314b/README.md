# MIAA Design System

**MIAA** — *Mission intermittente d'aide aux autres*  
(also: *Mouvement d'Intermittents d'Aide aux Autres*)

French non-profit association founded in **2008**, based at **14, rue des Carrières d'Amérique, 75019 Paris**.

---

## About MIAA

MIAA prepares and distributes **120 complete meals per day** to people in need in the eastern arrondissements of Paris. Several days per week, volunteers go out into the streets by car (maraudes) to meet people where they are. The association is deeply linked to the **cinema and entertainment industry** (*intermittents du spectacle*) — it recovers surplus catering, costumes and props from film/TV shoots and organises charity sales (braderies solidaires). Volunteers can contribute with **no long-term commitment** — sign up by email a few days in advance, join in the kitchen in the morning and/or on the street at noon. Donations are tax-deductible.

Key events:
- **Braderie Solidaire** — seasonal charity sale of clothes, accessories, décor
- **Meals for Monologues (M4M)** — fundraising event in the 19th arrondissement, recruits volunteers from theatre audiences

Contact for volunteering: m4m.miaa@gmail.com  
Donations via HelloAsso: tinyurl.com/donmiaahelloasso

---

## Sources

| Source | Details |
|---|---|
| Figma file | "Sans titre.fig" — full website export of miaa.fr (French-FR), captured 21/04/2026 via html.to.design. Page: `/Page-1`, frame: `miaa.fr-French-FR-by-html.to.design-FREE-version---21-04-202` |
| Website | https://miaa.fr |

---

## Content Fundamentals

**Language:** French (FR) exclusively. All copy is in French.

**Tone:** Warm, direct, community-oriented. Conversational and urgent when asking for help, grateful and inclusive otherwise. No corporate speak.

**Voice:**
- First person plural ("Nous", "notre") — MIAA speaks as a collective
- Second person ("vous") for addressing the reader — formal but friendly
- Calls to action are warm and inviting: "Rejoignez-nous !", "Votre aide est toujours la bienvenue."
- Urgency is expressed factually: "Pour la première fois, MIAA est en déficit."

**Casing:** Standard French sentence case. Acronyms in caps (MIAA, M4M). Section titles are sentence-cased, not title-cased.

**Emoji:** Not used. None in Figma design or copy.

**Numbers:** Used frequently and concretely — "120 repas", "5€ = 1,25€ après réduction fiscale", "1€ = 4 repas par an". Impact is made tangible.

**Links:** Inline text links in the brand teal (`#128BAD`). Short URLs (tinyurl) used for printed/shared contexts.

**Examples of copy:**
> "Depuis 2008, l'association MIAA propose un geste de solidarité simple : préparer et distribuer 120 repas complets par jour à destination des plus démunis."

> "Notre originalité consiste à faire appel à des bénévoles au gré des disponibilités de chacun, sans engagement régulier ou à long terme."

> "MIAA AGIT TOUTE L'ANNEE dans une ambiance conviviale et le souci de concentrer son énergie sur le terrain : aux fourneaux et dans la rue."

---

## Visual Foundations

### Colors
- **Primary teal** `#128BAD` — top bar, footer, sidebar, nav active, links, headings on dark
- **Light teal** `#02AED6` — hero gradient accent
- **Text** `#333333` — all body and heading text on white
- **White** `#FFFFFF` — page background, card surfaces, all text on teal
- **Light bg** `#F8F9FA` — subtle background tint
- **Border** `#DDDDDD` — nav item separators
- **Card border** `rgba(0,0,0,0.125)` — article/card outlines

### Typography
- **Single font family**: Raleway (Google Fonts)
- Weights used: Light (300), Regular (400), Bold (700), Italic (400i)
- No serif, no mono, no decorative fonts
- Scale: 45px (hero title) → 32px (h2) → 18px (featured body) → 16px (body default)
- Line heights: 1.1 for headings, 1.5 (24px) for body

### Spacing & Layout
- Full page width: 1920px; content column: 1140px centered (390px gutters)
- Two-column layout: 255px teal sidebar + 825px main content area
- Cards: 20px internal padding, 30px gap between cards
- Topbar: 40px height; Header: 130px; Hero: 258px; Footer: 40px
- Spacing system: 8, 15, 20, 30, 60, 100px

### Cards / Surfaces
- White background, `border-radius: 4px`, `1px solid rgba(0,0,0,0.125)` border
- No box-shadow on cards (shadow only on header: `0 2px 4px rgba(0,0,0,0.075)`)
- Article content: 20px padding on all sides

### Backgrounds & Images
- Hero: full-bleed photo (people cooking/volunteering) with teal overlay
- Sidebar: solid teal with white text — no gradient
- Images: full-width within card, `cover` fit, centered
- No gradient overlays, no patterns, no textures beyond the hero photo

### Borders & Radius
- Cards: `border-radius: 4px`
- Nav items: `border: 1px solid #DDDDDD` (sharp, no radius)
- Topbar / footer: no radius (full-bleed rectangles)

### Animations & Hover States
- No animations observed
- Link hover: implied underline (standard browser behaviour)
- No custom hover colours, no scale transforms, no transitions defined

### Imagery
- Warm, candid documentary style (volunteers cooking, interacting)
- Colorful event flyers (Braderie poster is vibrant: yellow, teal, red illustration)
- QR code used for donation link
- Color vibe: warm naturals for photography; bright primary colors for event graphics

### Iconography
- **Font Awesome 5** (Free Solid + Brands) — used sparingly
- Only icon visible: Facebook brand icon (white, 16px) in top bar
- No custom SVG icons; no emoji as icons; no unicode decorative characters

---

## Iconography

Font Awesome 5 is the icon system. Used via font-face (Font Awesome 5 Free Solid, Font Awesome 5 Brands).

- Only icons observed in Figma: **Facebook** (fa-brands) in the topbar social link
- Icon size: 16px, color white on teal background
- Usage is minimal and purposeful — not decorative

To use Font Awesome 5 in HTML:
```html
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
```

Assets copied:
- `assets/logo.png` — MIAA wordmark logo (blue text on white)
- `assets/thumbnail.png` — QR code / association thumbnail
- `assets/hero-banner.jpg` — hero photography (volunteers)
- `assets/braderie-banner.jpg` — Braderie Solidaire event flyer

---

## File Index

```
README.md                    ← this file
colors_and_type.css          ← CSS vars for all colors, type, spacing, layout
SKILL.md                     ← agent skill definition
assets/
  logo.png                   ← MIAA wordmark logo
  thumbnail.png              ← QR code / association thumbnail
  hero-banner.jpg            ← hero photograph
  braderie-banner.jpg        ← Braderie event flyer
preview/
  colors-brand.html          ← Brand color swatches
  colors-neutral.html        ← Neutral & semantic color swatches
  type-scale.html            ← Typography scale specimen
  type-weights.html          ← Font weight specimens
  spacing-tokens.html        ← Spacing & layout tokens
  spacing-radius.html        ← Border radius & shadows
  components-buttons.html    ← Button states
  components-nav.html        ← Navigation components
  components-cards.html      ← Card/article components
  components-sidebar.html    ← Sidebar component
  components-topbar.html     ← Topbar & footer bar
  components-hero.html       ← Hero section
ui_kits/
  website/
    README.md                ← UI kit documentation
    index.html               ← Interactive website prototype
```
