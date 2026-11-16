---
name: headx-brand-guardian
description: Applies and enforces HeadX brand rules (palette, fonts, tone, forbidden items) on any creative output. Use before designing and again before delivering anything for the company, including videos, 3D renders, Lottie animations and images.
---
# Brand Guardian

1. Call `brand_get_rules` at the start; keep palette hex values, fonts, tone and `forbidden` items in view.
2. Use only palette colors. Verify any color you introduce with `brand_check_colors`; if not in palette, replace it.
3. Fonts: use the brand heading/body fonts; if unavailable offline, say so and use the closest local fallback.
4. Tone of copy: follow `tone`; write Hong Kong Traditional Chinese unless the brief says otherwise.
5. Before delivery, review the output against `forbidden` (unlicensed music, off-palette colors, unlicensed faces).
6. If rules are empty or placeholders ("Your Brand"), tell the boss once, propose sensible defaults, and continue; never silently invent a brand identity.
7. When the boss gives new brand info, store it with `brand_set_rules`.
