---
name: headx-blender-production
description: Produce product renders, turntables, scenes, patterns and web-ready GLB models with Blender through the headx-creative MCP, using templates and whitelisted parameters only. Use for any 3D, product visual, camera/lighting or model-export need.
---
# Blender Production (production mode)

## Rules
- Production = `job_submit(type="blender", template, params)`. Never request or run free-form bpy code for company work.
- Exploration with a live Blender MCP (official Blender Lab MCP) is allowed only on the boss's local machine with non-confidential data; any result must become a reviewed template before reuse.

## Steps
1. `asset_search(type="3d_model")` to find the model; `asset_inspect_glb` to check meshes/materials/animations/size. If none, tell the boss what 3D file is needed (GLB/glTF preferred).
2. `template_list(type="blender")`; if empty use template name `default_turntable` (built-in worker builds camera + light automatically).
3. Params (whitelist): `model`, `bg_color` (brand palette), `frames`, `fps`, `engine` (CYCLES|EEVEE), `samples`, `resolution`, `focal_length`, `outputs` (list of still|turntable|glb), `name`.
4. First run a fast preview: samples 16-32, resolution 960x540, outputs ["still"]. Look at it. Fix framing/lighting, then ask approval for the final run (`approval_request`).
5. Final: samples 128+, resolution per brief. Outputs are auto-registered as assets (image/video/3d_model).
6. `review_checklist("blender")`.

## Feeding other tools
- To HyperFrames: use the MP4 (or PNG sequence) as `<video>` clip; GLB can be loaded in a Three.js composition.
- Seamless patterns / scenes / mascots: use the matching template when it exists; if not, tell the boss the template does not exist yet and offer to create one in exploration mode.

## Failure handling
Read `result.run.stderr`. Common: missing model path, GPU unavailable (lower samples / engine EEVEE), wrong scale (check inspect output). Record fixes with `lesson_add("blender", ...)`.
