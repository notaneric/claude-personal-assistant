# /design [brief] — Full Design Pipeline

Execute the complete design pipeline: taste filter → design language → HTML/CSS implementation. Every project gets its own aesthetic derived from the brief — not a house default.

## Skills Activated
Primary: impeccable (taste/slop filter — its `reference/brand.md` or `reference/product.md`)  
Secondary: huashu-design, ui-ux-pro-max  
Alt taste skills: design-taste-frontend, stitch-design-taste, gpt-taste  
Support: per-project DESIGN.md

## Steps

1. **Parse the brief:**
   - What's being designed? (UI component, page, dashboard, brand asset, icon system)
   - Platform? (web, mobile, desktop, print)
   - Any existing design constraints? (colors, fonts, framework)

2. **Derive a per-project aesthetic from the brief (not a house default):**
   - Every project gets its own direction from its brief, audience, and references.
   - Run `/grill` first if direction is unset: palette, density, mood, audience, reference sites. Do not invent a direction.
   - Write a per-project `DESIGN.md` that lives with the deliverable and governs it.

3. **Taste filter** (impeccable's brand.md/product.md slop test):
   - Before generating any UI: run the AI-slop test + category-reflex check
   - Reject: generic Bootstrap, gradient rainbows, stock-photo vibes
   - Accept: opinionated, specific, intentional design decisions

4. **Impeccable design language** (pbakaus/impeccable):
   - Apply design intelligence for spacing, hierarchy, contrast
   - Every element earns its place
   - No decorative elements that don't carry information

5. **Implementation** (huashu-design for HTML-native):
   - Semantic HTML5
   - CSS custom properties for theming
   - No heavy framework unless requested
   - Responsive by default

6. **Output:**
   - HTML/CSS implementation ready to paste/deploy
   - Design rationale (brief notes on key decisions)
   - Variant suggestions if relevant

## Platform Routing
- `/design web [brief]` → huashu HTML-native
- `/design mobile [brief]` → ui-ux-pro-max mobile patterns
- `/design dashboard [brief]` → data-dense layout, tables, charts
- `/design brand [brief]` → visual identity, logo concept, color system
- `/design component [brief]` → isolated reusable component

## Quality Gates
Before outputting any design work:
- Does it match the PROJECT's own DESIGN.md / brief direction?
- Would impeccable's slop test pass? (no generic slop, no category reflex)
- Is the theme (light/dark) and density justified by the brief's context, not a default?
- Is the visual hierarchy clear and intentional?
- No decorative elements without function?
- Verified in-browser (screenshot → analyze → fix, min 2 passes) before reporting done?
