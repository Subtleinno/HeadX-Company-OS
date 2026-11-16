"""Run inside Blender:  blender -b [template.blend] -P blender_worker.py -- --job job.json
Template-driven. Whitelisted params only. UNTESTED against a real Blender build — run tests/blender_smoke.md first.
params: model (glb path), bg_color (#hex), frames, fps, engine (CYCLES|EEVEE), samples, resolution [w,h],
        outputs: list of still|turntable|glb   (default ["still"])
"""
import sys, json, math, os
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
job = json.load(open(argv[argv.index("--job") + 1]))
P = job["params"]; OUT = job["outdir"]
result = {"ok": False, "files": [], "warnings": []}

def hex_rgba(h):
    h = h.lstrip("#"); return [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)] + [1]

def pick_engine(want):
    items = [i.identifier for i in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
    if want == "CYCLES" and "CYCLES" in items: return "CYCLES"
    for c in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        if c in items: return c
    return items[0]

try:
    sc = bpy.context.scene
    sc.render.engine = pick_engine(P.get("engine", "CYCLES"))
    if sc.render.engine == "CYCLES":
        sc.cycles.samples = int(P.get("samples", 64))
        try:
            prefs = bpy.context.preferences.addons["cycles"].preferences
            for dt in ("OPTIX", "CUDA", "HIP", "METAL", "ONEAPI"):
                try:
                    prefs.compute_device_type = dt; prefs.get_devices()
                    if any(d.type != "CPU" for d in prefs.devices):
                        for d in prefs.devices: d.use = True
                        sc.cycles.device = "GPU"; break
                except Exception: continue
        except Exception as e: result["warnings"].append(f"gpu setup: {e}")
    w, h = P.get("resolution", [1920, 1080]); sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.resolution_percentage = 100
    sc.render.fps = int(P.get("fps", 30))
    sc.frame_start = 1; sc.frame_end = int(P.get("frames", 120))

    if P.get("model"):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=P["model"])
        new = [o for o in bpy.data.objects if o not in before]
    else:
        new = []; result["warnings"].append("no model given; rendering template scene only")

    # world background
    if sc.world is None: sc.world = bpy.data.worlds.new("World")
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes.get("Background")
    if bg and P.get("bg_color"): bg.inputs[0].default_value = hex_rgba(P["bg_color"])

    # pivot + framing
    pivot = bpy.data.objects.get("PIVOT") or bpy.data.objects.new("PIVOT", None)
    if pivot.name not in sc.collection.objects: sc.collection.objects.link(pivot)
    meshes = [o for o in new if o.type == "MESH"]
    radius = 1.0
    if meshes:
        pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
        mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        center = (mn + mx) / 2; radius = max((mx - mn).length / 2, 0.01)
        pivot.location = center
        for o in new:
            if o.parent is None: o.parent = pivot
    # camera
    cam = bpy.data.objects.get("CAM_hero")
    if cam is None:
        cd = bpy.data.cameras.new("CAM_hero"); cam = bpy.data.objects.new("CAM_hero", cd); sc.collection.objects.link(cam)
    cam.data.lens = float(P.get("focal_length", 50))
    dist = radius / math.tan(math.radians(25)) * 1.6
    cam.location = pivot.location + Vector((0, -dist, radius * 0.5))
    tc = cam.constraints.new("TRACK_TO"); tc.target = pivot; tc.track_axis = "TRACK_NEGATIVE_Z"; tc.up_axis = "UP_Y"
    sc.camera = cam
    # key light if scene has none
    if not [o for o in sc.objects if o.type == "LIGHT"]:
        ld = bpy.data.lights.new("LIGHT_key", "AREA"); ld.energy = 800 * max(radius, 1) ** 2; ld.size = radius * 3
        lo = bpy.data.objects.new("LIGHT_key", ld); lo.location = pivot.location + Vector((radius * 2, -radius * 2, radius * 3)); sc.collection.objects.link(lo)

    outs = P.get("outputs", ["still"])
    if "still" in outs:
        sc.frame_set(1); sc.render.image_settings.file_format = "PNG"
        fp = os.path.join(OUT, "still.png"); sc.render.filepath = fp; bpy.ops.render.render(write_still=True); result["files"].append(fp)
    if "turntable" in outs:
        pivot.rotation_euler = (0, 0, 0); pivot.keyframe_insert("rotation_euler", frame=1)
        pivot.rotation_euler = (0, 0, math.radians(360)); pivot.keyframe_insert("rotation_euler", frame=sc.frame_end + 1)
        for fc in (pivot.animation_data.action.fcurves if pivot.animation_data and hasattr(pivot.animation_data.action, "fcurves") else []):
            for kp in fc.keyframe_points: kp.interpolation = "LINEAR"
        sc.render.image_settings.file_format = "FFMPEG"; sc.render.ffmpeg.format = "MPEG4"; sc.render.ffmpeg.codec = "H264"
        fp = os.path.join(OUT, "turntable.mp4"); sc.render.filepath = fp; bpy.ops.render.render(animation=True); result["files"].append(fp)
    if "glb" in outs and new:
        fp = os.path.join(OUT, "model.glb"); bpy.ops.export_scene.gltf(filepath=fp, export_format="GLB", use_selection=False); result["files"].append(fp)
    result["ok"] = bool(result["files"])
except Exception as e:
    result["error"] = f"{type(e).__name__}: {e}"
json.dump(result, open(os.path.join(OUT, "result.json"), "w"))
