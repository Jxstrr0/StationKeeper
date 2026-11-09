"""Scene plumbing: the material library, the ambient-occlusion bake into vertex colours, glTF export, previews."""
import math
import os

import bpy
import numpy as np
from mathutils import Matrix, Vector

from .geo import TO_BLENDER

# The material library. Names are the contract with the game (src/view/stationMaterials.ts), which swaps each for
# its own shared material; the colours here only matter for previews and as a fallback if a name is unknown.
MATERIALS = {
    'hull': (0xDEDAD1, 0.55, 0.08),
    'white': (0xE6E3DA, 0.5, 0.05),
    'slate': (0x3A3936, 0.6, 0.15),
    'dark': (0x1F1E1B, 0.8, 0.2),
    'stripe': (0x7B3FC4, 0.45, 0.1),
    'rail': (0xC9A43A, 0.5, 0.35),
    'foil': (0xB6955E, 0.35, 0.45),
    'quilt': (0xD9D5CB, 0.75, 0.0),
    'panel': (0x2A3A6E, 0.4, 0.15),
    'radiator': (0xECEBE6, 0.7, 0.05),
    'window': (0xFFD9A0, 0.2, 0.0),
}

AO_SAMPLES = 96
AO_DISTANCE = 1.6
# How much of the baked occlusion survives: 1 would let crevices go fully black, which reads as dirt in sunlight.
AO_STRENGTH = 0.72
AO_FLOOR = 0.3


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgb(h):
    return tuple(srgb_to_linear(((h >> s) & 255) / 255) for s in (16, 8, 0))


def reset():
    """An empty file with the material library in it."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = AO_SAMPLES
    scene.cycles.seed = 7
    scene.cycles.use_denoising = False
    scene.render.threads_mode = 'AUTO'
    world = bpy.data.worlds.new('World')
    scene.world = world
    world.light_settings.distance = AO_DISTANCE
    for name, (colour, rough, metal) in MATERIALS.items():
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        r, g, b = hex_rgb(colour)
        bsdf.inputs['Base Color'].default_value = (r, g, b, 1)
        bsdf.inputs['Roughness'].default_value = rough
        bsdf.inputs['Metallic'].default_value = metal
        m.diffuse_color = (r, g, b, 1)
        if name == 'window':
            bsdf.inputs['Emission Color'].default_value = (r, g, b, 1)
            bsdf.inputs['Emission Strength'].default_value = 1.0
    return scene


def empty(name, position, collection, parent=None):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_size = 0.2
    ob.location = TO_BLENDER @ Vector(position)
    collection.objects.link(ob)
    if parent:
        ob.parent = parent
    return ob


def game_matrix(m):
    """A game-space transform as the equivalent Blender-space object matrix."""
    return TO_BLENDER @ m @ TO_BLENDER.inverted()


def bake_ao(objects):
    """Bake ambient occlusion into a corner colour attribute on each object, with everything in the scene occluding."""
    scene = bpy.context.scene
    view_layer = bpy.context.view_layer
    for ob in objects:
        me = ob.data
        attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        me.color_attributes.active_color = attr
        me.color_attributes.render_color_index = 0
    for ob in objects:
        for other in view_layer.objects:
            other.select_set(False)
        ob.select_set(True)
        view_layer.objects.active = ob
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
        me = ob.data
        attr = me.color_attributes['Col']
        n = len(attr.data)
        buf = np.empty(n * 4, dtype=np.float32)
        attr.data.foreach_get('color', buf)
        buf = buf.reshape(n, 4)
        ao = np.clip(buf[:, 0], 0.0, 1.0)
        ao = soften(me, ao)
        ao = np.maximum(AO_FLOOR, 1.0 - AO_STRENGTH * (1.0 - ao))
        # Quantise, so re-running the bake on another machine is unlikely to change the files for noise alone.
        ao = np.round(ao * 32) / 32
        buf[:, 0] = buf[:, 1] = buf[:, 2] = ao
        buf[:, 3] = 1.0
        attr.data.foreach_set('color', buf.reshape(-1))
    for ob in view_layer.objects:
        ob.select_set(False)


def soften(me, ao):
    """Average the baked value over the corners that share a vertex and a smooth normal, to hide per-face noise."""
    n_loops = len(me.loops)
    vert = np.empty(n_loops, dtype=np.int32)
    me.loops.foreach_get('vertex_index', vert)
    normals = np.empty(n_loops * 3, dtype=np.float32)
    me.corner_normals.foreach_get('vector', normals)
    normals = np.round(normals.reshape(n_loops, 3) * 8).astype(np.int64)
    key = vert.astype(np.int64) * 4913 + (normals[:, 0] + 8) * 289 + (normals[:, 1] + 8) * 17 + (normals[:, 2] + 8)
    _, inverse = np.unique(key, return_inverse=True)
    total = np.bincount(inverse, weights=ao)
    count = np.bincount(inverse)
    return (total / count)[inverse].astype(np.float32)


def export_glb(path):
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        export_yup=True,
        export_apply=False,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_materials='EXPORT',
        export_vertex_color='ACTIVE',
        export_all_vertex_colors=False,
        export_active_vertex_color_when_no_material=True,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_extras=True,
        export_shared_accessors=False,
        use_selection=False,
    )


def preview(path, look_from, look_at=(0, 0, 0), sun=(0.5, 0.8, 0.4), size=(720, 540), samples=48, lens=50, ortho=None):
    """A quick Cycles render with the baked occlusion multiplied in, for checking a model by eye."""
    scene = bpy.context.scene
    for m in bpy.data.materials:
        tree = m.node_tree
        bsdf = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
        if any(link.to_socket == bsdf.inputs['Base Color'] for link in tree.links) or m.name == 'window':
            continue
        attr = tree.nodes.new('ShaderNodeVertexColor')
        attr.layer_name = 'Col'
        mix = tree.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        mix.inputs['A'].default_value = bsdf.inputs['Base Color'].default_value
        tree.links.new(attr.outputs['Color'], mix.inputs['B'])
        tree.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = lens
    cam_data.clip_end = 500
    if ortho:
        cam_data.type = 'ORTHO'
        cam_data.ortho_scale = ortho
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    eye = TO_BLENDER @ Vector(look_from)
    target = TO_BLENDER @ Vector(look_at)
    cam.location = eye
    cam.rotation_euler = (target - eye).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    light_data = bpy.data.lights.new('sun', 'SUN')
    light_data.energy = 4.0
    light_data.angle = math.radians(1.0)
    light = bpy.data.objects.new('sun', light_data)
    scene.collection.objects.link(light)
    light.rotation_euler = (TO_BLENDER @ Vector(sun)).to_track_quat('Z', 'Y').to_euler()
    world = scene.world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = (0.05, 0.07, 0.11, 1)
    bg.inputs['Strength'].default_value = 1.0
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.view_settings.view_transform = 'Standard'
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)
    bpy.data.objects.remove(light)
