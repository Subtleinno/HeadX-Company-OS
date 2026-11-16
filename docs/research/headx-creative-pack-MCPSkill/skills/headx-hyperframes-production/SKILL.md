---
name: headx-hyperframes-production
description: Company layer for making videos with HyperFrames (HTML to MP4) - promos, explainers, captions, motion graphics, data videos, social clips, long videos with the boss's voice. Use together with the official HyperFrames skills whenever a video or animated sequence must be rendered.
---
# HyperFrames Production (company layer)

The official HyperFrames skills own the technical contract. Install and read them; do not rely on memory.
- Install/update: `npx hyperframes skills update` (or `npx skills add heygen-com/hyperframes`).
- Read first: `/hyperframes` (contract), then `/hyperframes-cli`, `/hyperframes-animation` (adapters for GSAP, Lottie, Three.js...), `/hyperframes-registry` (ready-made blocks), `/media-use` (audio, captions, transcripts).
- Flags change between versions: confirm with `npx hyperframes render --help`.

## Company workflow
1. Brand + assets + lessons (see headx-creative-director). Convert brand tokens (palette, fonts) into CSS variables at the top of the composition.
2. Write `BRIEF.md` and a storyboard (scene, seconds, visual, runtime). Prefer registry blocks before hand-writing.
3. Pull media from the asset library (Blender MP4, Lottie JSON, audio). Use local copies, no external URLs.
4. Build the composition following the official contract. Run `job_submit(type="hyperframes", params={"project_dir":..., "check_only":true})` until check passes.
5. Snapshot frames (start/middle/end) and inspect; fix overflow, contrast, brand colors.
6. Draft render: `quality:"draft"`. Present preview via `approval_request`.
7. After approval: `quality:"high"` and `docker:true` for deterministic output. Output auto-registers as a video asset.
8. `review_checklist("hyperframes")`.

## Long videos with the boss's voice
Script -> segments -> TTS per segment (local voice clone; record consent) -> transcript/captions -> one composition per segment -> render -> concatenate with FFmpeg. State clearly that the voice is AI-generated when publishing. Cantonese TTS quality must be tested before relying on it.

## Safety
Compositions are executable HTML/JS: render offline, only local libraries, never load unknown external scripts.
