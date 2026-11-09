"""Build the station module models: public/models/<id>.glb for every module in src/data/modules.json.

    python tools/blender/build_models.py                 # all of them
    python tools/blender/build_models.py core habitat    # just these
    python tools/blender/build_models.py --preview /tmp/previews core

Needs Blender's Python (the `bpy` module; written against 5.2). See README.md beside this file.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

from sk import scene as sk_scene  # noqa: E402
from sk.geo import TO_BLENDER  # noqa: E402
from sk.glb import repack  # noqa: E402
from sk.modules import BUILDERS  # noqa: E402


def build(definition, out_dir, preview_dir=None):
    scene = sk_scene.reset()
    coll = scene.collection
    model = BUILDERS[definition['greybox']['shape']](definition)
    tris = model.body.tri_count()
    baked = [model.body.to_object(coll)]
    unlit = []

    if model.gimbal:
        part, origin = model.gimbal
        tris += part.tri_count()
        # The pivot is a node of its own; the mesh under it is modelled about that pivot.
        for v in part.bm.verts:
            v.co -= Vector(origin)
        pivot = sk_scene.empty('gimbal', origin, coll)
        ob = part.to_object(coll)
        ob.parent = pivot
        baked.append(ob)
    if model.glow.bm.faces:
        tris += model.glow.tri_count()
        unlit.append(model.glow.to_object(coll, shade_smooth=False))
    else:
        model.glow.bm.free()
    for name, pane, matrices, slots in model.rings:
        tris += pane.tri_count() * len(matrices)
        first = pane.to_object(coll, shade_smooth=False)
        for i, m in enumerate(matrices):
            ob = first if i == 0 else bpy.data.objects.new('pane', first.data)
            if i:
                coll.objects.link(ob)
            # The pane's slot round the hull is its index in the name; the game lights slots in a scattered order.
            slot = round(i * slots / len(matrices)) if len(matrices) != slots else i
            ob.name = f'win_{name}_{slot:02d}'
            ob.matrix_world = sk_scene.game_matrix(m)
            ob['slots'] = slots
            unlit.append(ob)
    sk_scene.empty('status_light', definition['greybox']['light'], coll)

    for ob in unlit:
        ob.hide_render = True
    sk_scene.bake_ao(baked)
    for ob in unlit:
        ob.hide_render = False

    path = os.path.join(out_dir, definition['id'] + '.glb')
    sk_scene.export_glb(path)
    size = repack(path)
    print(f"MODEL {definition['id']:14s} {tris:6d} tris {size / 1024:7.1f} KB", flush=True)

    if preview_dir:
        lo = Vector((1e9, 1e9, 1e9))
        hi = -lo
        inv = TO_BLENDER.inverted()
        for ob in scene.objects:
            if ob.type != 'MESH':
                continue
            for corner in ob.bound_box:
                p = inv @ (ob.matrix_world @ Vector(corner))
                lo = Vector(map(min, lo, p))
                hi = Vector(map(max, hi, p))
        centre = (lo + hi) / 2
        radius = (hi - lo).length / 2
        views = [(1.0, 0.7, 1.2), (-1.1, 0.5, -1.0), (0.3, -0.9, 1.0)]
        for i, v in enumerate(views):
            eye = centre + Vector(v).normalized() * radius * 2.6
            sk_scene.preview(os.path.join(preview_dir, f"{definition['id']}-{i}.png"), eye, centre, sun=(0.5, 0.8, 0.6), size=(640, 640), samples=24)
    return tris, size


def main(argv):
    preview_dir = None
    if '--preview' in argv:
        i = argv.index('--preview')
        preview_dir = argv[i + 1]
        argv = argv[:i] + argv[i + 2:]
    with open(os.path.join(ROOT, 'src', 'data', 'modules.json')) as f:
        defs = json.load(f)
    if isinstance(defs, dict):
        defs = defs.get('modules', defs)
    out_dir = os.path.join(ROOT, 'public', 'models')
    total = 0
    for d in defs:
        if argv and d['id'] not in argv:
            continue
        _, size = build(d, out_dir, preview_dir)
        total += size
    print(f'TOTAL {total / 1024:.1f} KB')


if __name__ == '__main__':
    main(sys.argv[1:])
