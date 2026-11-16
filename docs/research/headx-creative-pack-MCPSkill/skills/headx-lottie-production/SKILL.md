---
name: headx-lottie-production
description: Create, validate and publish Lottie animations (icons, loaders, counters, hero loops, transitions) for websites and for HyperFrames videos through the headx-creative MCP. Use when a web animation or reusable vector motion is needed.
---
# Lottie Production

## Steps
1. `template_list(type="lottie")`; prefer built-in generators (`icon_pulse`, `spinner`). Fill params from brand (`color` defaults to palette primary).
2. `lottie_generate(template, params, name)` -> returns validation + saved asset. If `validation.ok` is false, read `issues` and fix params.
3. Any Lottie that did NOT come from our generator (downloads, LottieFiles, Cavalry export) must pass `lottie_validate` first. Reject on: expressions, scripts/URLs, oversize (> 300 KB default), fps > 60.
4. Preview: embed with lottie-web (renderer svg) in a local HTML page and look at first/middle/last frames. Check size and legibility.
5. `review_checklist("lottie")`, then `asset_save` (tags: lottie, usage, template).

## Web usage snippet
`lottie.loadAnimation({container, renderer:'svg', loop:true, autoplay:true, path:'/animations/x.json'})`

## Use in HyperFrames
The same JSON can be seeked by HyperFrames' Lottie adapter. Read the installed skill file `hyperframes-animation` -> `adapters/lottie.md` for the exact registration API (do not guess it).

## Limits
Complex effects (blur, particles, 3D) do not belong in Lottie: render them in Blender or HyperFrames instead. Custom shapes beyond the built-in generators: write Lottie JSON carefully using python-lottie if installed, then validate.
