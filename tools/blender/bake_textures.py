"""Bake the station's tiling surface textures: public/textures/station/<name>_{albedo,normal,rough}.jpg.

    python tools/blender/bake_textures.py            # all five sets
    python tools/blender/bake_textures.py foil quilt

Each surface is a procedural node graph in Blender (seams, quilting, crinkles, cell grids, tileable 4D noise wrapped
on a torus), baked with Cycles onto a plane as a handful of masks. The masks are then composed into albedo, a
tangent-space normal map (from the baked height, with wrap-around so it tiles) and roughness.

The size in metres of one repeat of each is TILE in sk/geo.py; the models' UVs are in those units.
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

from sk.geo import TILE  # noqa: E402

SIZE = 512
SAMPLES = 16
QUALITY = 86


# ---- a small expression layer over shader math nodes ----


class X:
    """A scalar in a node tree. Arithmetic on these adds Math nodes."""

    tree = None

    def __init__(self, socket):
        self.s = socket

    @staticmethod
    def lift(v):
        return v if isinstance(v, X) else v

    @classmethod
    def math(cls, op, *args, clamp=False):
        n = cls.tree.nodes.new('ShaderNodeMath')
        n.operation = op
        n.use_clamp = clamp
        for i, a in enumerate(args):
            if isinstance(a, X):
                cls.tree.links.new(a.s, n.inputs[i])
            else:
                n.inputs[i].default_value = float(a)
        return X(n.outputs[0])

    def __add__(self, o):
        return X.math('ADD', self, o)

    __radd__ = __add__

    def __sub__(self, o):
        return X.math('SUBTRACT', self, o)

    def __rsub__(self, o):
        return X.math('SUBTRACT', o, self)

    def __mul__(self, o):
        return X.math('MULTIPLY', self, o)

    __rmul__ = __mul__

    def __truediv__(self, o):
        return X.math('DIVIDE', self, o)


def fract(a):
    return X.math('FRACT', a)


def floor(a):
    return X.math('FLOOR', a)


def mn(a, b):
    return X.math('MINIMUM', a, b)


def mx(a, b):
    return X.math('MAXIMUM', a, b)


def absf(a):
    return X.math('ABSOLUTE', a)


def sin(a):
    return X.math('SINE', a)


def cos(a):
    return X.math('COSINE', a)


def sqrt(a):
    return X.math('SQRT', a)


def mod(a, b):
    return X.math('FLOORED_MODULO', a, b)


def smooth(lo, hi, a):
    """0 below lo, 1 above hi, smoothstep between."""
    n = X.tree.nodes.new('ShaderNodeMapRange')
    n.interpolation_type = 'SMOOTHSTEP'
    X.tree.links.new(a.s, n.inputs['Value'])
    n.inputs['From Min'].default_value = lo
    n.inputs['From Max'].default_value = hi
    return X(n.outputs['Result'])


def edge(c):
    """Distance from a 0..1 cell coordinate to the nearer cell edge, 0..0.5."""
    return mn(c, 1 - c)


def hash2(ix, iy, seed=0.0):
    return fract(sin(ix * 127.1 + iy * 311.7 + seed) * 43758.5453)


def torus(u, v, seed=0.0):
    """(vector, w) wrapping the unit square onto a flat torus in 4D, one unit round each way, so 4D textures tile."""
    k = 1 / math.tau
    comb = X.tree.nodes.new('ShaderNodeCombineXYZ')
    for i, val in enumerate((cos(u * math.tau) * k, sin(u * math.tau) * k, cos(v * math.tau) * k)):
        X.tree.links.new(val.s, comb.inputs[i])
    return comb.outputs[0], sin(v * math.tau) * k + seed


def noise(u, v, scale, detail=2.0, seed=0.0):
    """Tileable fractal noise, about `scale` features across the tile. 0..1."""
    n = X.tree.nodes.new('ShaderNodeTexNoise')
    n.noise_dimensions = '4D'
    vec, w = torus(u, v, seed)
    X.tree.links.new(vec, n.inputs['Vector'])
    X.tree.links.new(w.s, n.inputs['W'])
    n.inputs['Scale'].default_value = scale
    n.inputs['Detail'].default_value = detail
    n.inputs['Roughness'].default_value = 0.55
    return X(n.outputs[0])


def voronoi(u, v, scale, feature='F1', seed=0.0):
    """Tileable Voronoi: (distance, per-cell random) with about `scale` cells across the tile."""
    n = X.tree.nodes.new('ShaderNodeTexVoronoi')
    n.voronoi_dimensions = '4D'
    n.feature = feature
    vec, w = torus(u, v, seed)
    X.tree.links.new(vec, n.inputs['Vector'])
    X.tree.links.new(w.s, n.inputs['W'])
    n.inputs['Scale'].default_value = scale
    sep = X.tree.nodes.new('ShaderNodeSeparateColor')
    X.tree.links.new(n.outputs['Color'], sep.inputs[0])
    return X(n.outputs['Distance']), X(sep.outputs[0])


# ---- the surfaces: each returns two (r, g, b) triples of masks to bake ----


def hull_graph(u, v):
    """Plating: 2 m x 1 m panels laid like bricks, a groove between them, fasteners along the edges."""
    row = floor(v * 4)
    x = u * 2 + mod(row, 2) * 0.5
    cx, cy = fract(x), fract(v * 4)
    ix = mod(floor(x), 2)
    dx, dy = edge(cx) * 2.0, edge(cy) * 1.0  # metres to the panel's edge
    d = mn(dx, dy)
    seam = 1 - smooth(0.004, 0.016, d)
    height = smooth(0.0, 0.035, d)
    # Fasteners 6 cm in from each edge, every 25 cm.
    along_x = (fract(cx * 8) - 0.5) * 0.25
    along_y = (fract(cy * 4) - 0.5) * 0.25
    r1 = sqrt((dy - 0.06) * (dy - 0.06) + along_x * along_x)
    r2 = sqrt((dx - 0.06) * (dx - 0.06) + along_y * along_y)
    rivet = 1 - smooth(0.008, 0.016, mn(r1, r2))
    return (height, seam, rivet), (hash2(ix, row), noise(u, v, 3.0, 3.0), noise(u, v, 48.0, 2.0, 3.1))


def quilt_graph(u, v):
    """A quilted blanket: 37.5 cm pillows, stitched seams, a tuft where the seams cross."""
    cx, cy = fract(u * 8), fract(v * 8)
    dx, dy = edge(cx), edge(cy)
    pillow = sqrt(sin(cx * math.pi) * sin(cy * math.pi))
    seam = 1 - smooth(0.01, 0.05, mn(dx, dy))
    tuft = 1 - smooth(0.03, 0.07, sqrt(dx * dx + dy * dy))
    cell = hash2(floor(u * 8), floor(v * 8), 1.7)
    return (pillow, seam, tuft), (cell, noise(u, v, 4.0, 3.0, 5.0), noise(u, v, 90.0, 1.0, 9.0))


def foil_graph(u, v):
    """Crinkled foil: facets at two scales with sharp creases between them."""
    d1, c1 = voronoi(u, v, 7.0)
    d2, _ = voronoi(u, v, 19.0, seed=4.0)
    f2, _ = voronoi(u, v, 7.0, feature='F2')
    crease = smooth(0.0, 0.5, (f2 - d1) * 7.0)
    return (d1 * 7.0, d2 * 19.0, crease), (c1, noise(u, v, 5.0, 4.0, 2.0), noise(u, v, 40.0, 2.0, 6.0))


def panel_graph(u, v):
    """Solar cells: 40 cm x 20 cm cells with clipped corners, two busbars each and fine collector fingers."""
    cx, cy = fract(u * 4), fract(v * 8)
    dx, dy = edge(cx) * 0.4, edge(cy) * 0.2
    corner = smooth(0.022, 0.03, dx + dy)
    cell = smooth(0.004, 0.009, mn(dx, dy)) * corner
    bus = 1 - smooth(0.002, 0.005, mn(absf(cy - 1 / 3), absf(cy - 2 / 3)) * 0.2)
    finger = 1 - smooth(0.15, 0.35, edge(fract(cx * 32)))
    rnd = hash2(floor(u * 4), floor(v * 8), 0.3)
    return (cell, bus, finger), (rnd, noise(u, v, 3.0, 2.0, 1.0), noise(u, v, 60.0, 1.0, 8.0))


def radiator_graph(u, v):
    """Radiator face: flow tubes every 12.5 cm standing proud of the sheet, panel breaks every half metre and metre."""
    tube = smooth(0.3, 0.46, edge(fract(u * 16)))
    du, dv = edge(fract(u * 4)) * 0.5, edge(fract(v * 2)) * 1.0
    seam = 1 - smooth(0.004, 0.012, mn(du, dv))
    rnd = hash2(floor(u * 4), floor(v * 2), 2.2)
    return (tube, seam, rnd), (noise(u, v, 3.0, 3.0, 7.0), noise(u, v, 70.0, 1.0, 2.0), noise(u, v, 12.0, 2.0, 4.0))


# ---- baking ----


def bake_triples(graph):
    """Build the graph on a plane and bake each of its mask triples. Returns float arrays, row 0 at v = 0."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = SAMPLES
    scene.cycles.seed = 3
    scene.cycles.use_denoising = False
    scene.render.bake.margin = 0
    bpy.ops.mesh.primitive_plane_add(size=2)
    plane = bpy.context.active_object
    mat = bpy.data.materials.new('bake')
    mat.use_nodes = True
    plane.data.materials.append(mat)
    tree = mat.node_tree
    tree.nodes.clear()
    X.tree = tree
    coord = tree.nodes.new('ShaderNodeTexCoord')
    sep = tree.nodes.new('ShaderNodeSeparateXYZ')
    tree.links.new(coord.outputs['UV'], sep.inputs[0])
    triples = graph(X(sep.outputs[0]), X(sep.outputs[1]))
    emit = tree.nodes.new('ShaderNodeEmission')
    out = tree.nodes.new('ShaderNodeOutputMaterial')
    tree.links.new(emit.outputs[0], out.inputs['Surface'])
    image = bpy.data.images.new('target', SIZE, SIZE, float_buffer=True, is_data=True)
    target = tree.nodes.new('ShaderNodeTexImage')
    target.image = image
    tree.nodes.active = target
    results = []
    for triple in triples:
        comb = tree.nodes.new('ShaderNodeCombineColor')
        for i, x in enumerate(triple):
            tree.links.new(x.s, comb.inputs[i])
        tree.links.new(comb.outputs[0], emit.inputs['Color'])
        bpy.ops.object.bake(type='EMIT')
        px = np.empty(SIZE * SIZE * 4, dtype=np.float32)
        image.pixels.foreach_get(px)
        results.append(px.reshape(SIZE, SIZE, 4)[:, :, :3].astype(np.float64))
    return results


def rgb(h):
    return np.array([(h >> 16) & 255, (h >> 8) & 255, h & 255], dtype=np.float64) / 255


def lerp(a, b, t):
    t = t[..., None] if np.ndim(t) == 2 and np.ndim(a) != 2 else t
    return a + (b - a) * t


def normal_from_height(height_m, tile_m, strength=1.0):
    """Tangent-space normals (+Y along +v) from a height field in metres, wrapping at the edges."""
    px = tile_m / SIZE
    dx = (np.roll(height_m, -1, axis=1) - np.roll(height_m, 1, axis=1)) / (2 * px)
    dy = (np.roll(height_m, -1, axis=0) - np.roll(height_m, 1, axis=0)) / (2 * px)
    n = np.stack([-dx * strength, -dy * strength, np.ones_like(dx)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def blur(a, passes=1):
    for _ in range(passes):
        a = (a + np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1)) / 5
    return a


def compose(name, a, b):
    """(albedo sRGB 0..1, height in metres, roughness 0..1) from the two baked triples."""
    if name == 'hull':
        height, seam, rivet = a[..., 0], a[..., 1], a[..., 2]
        cell, low, fine = b[..., 0], b[..., 1], b[..., 2]
        tone = 0.93 + 0.09 * cell + 0.07 * (low - 0.5) + 0.04 * (fine - 0.5)
        albedo = rgb(0xE3DFD6) * tone[..., None]
        albedo = lerp(albedo, rgb(0x6F6C66), seam * 0.85)
        albedo = lerp(albedo, rgb(0x9A968E), rivet * 0.8)
        h = height * 0.004 + rivet * 0.0025 + (low - 0.5) * 0.004
        rough = 0.5 + 0.12 * (cell - 0.5) + 0.2 * (fine - 0.5) + 0.2 * seam
        return albedo, h, rough, 1.0
    if name == 'quilt':
        pillow, seam, tuft = a[..., 0], a[..., 1], a[..., 2]
        cell, low, fine = b[..., 0], b[..., 1], b[..., 2]
        tone = 0.9 + 0.05 * cell + 0.08 * (low - 0.5) + 0.07 * (fine - 0.5) + 0.07 * pillow
        albedo = rgb(0xDDD9CF) * tone[..., None]
        albedo = lerp(albedo, rgb(0x8E8A82), seam * 0.45)
        albedo = lerp(albedo, rgb(0x6B6862), tuft * 0.7)
        h = pillow * 0.035 - tuft * 0.01 + (fine - 0.5) * 0.0015
        rough = 0.8 + 0.1 * (fine - 0.5) - 0.06 * pillow
        return albedo, h, rough, 1.0
    if name == 'foil':
        d1, d2, crease = a[..., 0], a[..., 1], a[..., 2]
        cell, low, fine = b[..., 0], b[..., 1], b[..., 2]
        tone = 0.96 + 0.22 * (cell - 0.5) + 0.22 * (low - 0.5) + 0.06 * (fine - 0.5) - 0.08 * (1 - crease)
        albedo = rgb(0xC09A58) * tone[..., None]
        albedo = lerp(albedo, rgb(0xE8C987), np.clip((cell - 0.75) * 3, 0, 1) * 0.35)
        h = d1 * 0.007 + d2 * 0.0025 + (low - 0.5) * 0.006
        rough = 0.3 + 0.18 * (cell - 0.5) + 0.12 * (fine - 0.5) + 0.15 * (1 - crease)
        return albedo, h, rough, 1.0
    if name == 'panel':
        cell, bus, finger = a[..., 0], a[..., 1], a[..., 2]
        rnd, low, fine = b[..., 0], b[..., 1], b[..., 2]
        base = lerp(rgb(0x1D2A5C), rgb(0x2F4384), rnd)
        base = base * (0.92 + 0.2 * (low - 0.5))[..., None]
        base = lerp(base, rgb(0x3A4E8E), finger * 0.22)
        base = lerp(base, rgb(0xAEB6CC), bus * 0.75)
        albedo = lerp(rgb(0x0E1018), base, cell)
        h = cell * 0.0012 + bus * cell * 0.0004
        rough = lerp(np.full_like(cell, 0.65), 0.22 + 0.1 * (rnd - 0.5) + 0.1 * (fine - 0.5), cell)
        return albedo, h, rough, 1.0
    if name == 'radiator':
        tube, seam, rnd = a[..., 0], a[..., 1], a[..., 2]
        low, fine, mid = b[..., 0], b[..., 1], b[..., 2]
        tone = 0.95 + 0.04 * rnd + 0.05 * (low - 0.5) + 0.03 * (fine - 0.5) + 0.03 * (mid - 0.5)
        albedo = rgb(0xEEEDE8) * tone[..., None]
        albedo = lerp(albedo, rgb(0xC9C6BD), (1 - tube) * 0.35)
        albedo = lerp(albedo, rgb(0x8B8882), seam * 0.8)
        h = tube * 0.0035 - seam * 0.002
        rough = 0.68 + 0.12 * (fine - 0.5) + 0.1 * seam
        return albedo, h, rough, 1.0
    raise KeyError(name)


GRAPHS = {'hull': hull_graph, 'quilt': quilt_graph, 'foil': foil_graph, 'panel': panel_graph, 'radiator': radiator_graph}


def save(arr, path, mode):
    """Rows are flipped so the file reads the way Blender's image editor shows it (v = 1 at the top)."""
    data = np.clip(np.round(arr[::-1] * 255), 0, 255).astype(np.uint8)
    Image.fromarray(data, mode).save(path, quality=QUALITY, optimize=True, subsampling=0 if mode == 'RGB' else -1)
    return os.path.getsize(path)


def main(argv):
    out_dir = os.path.join(ROOT, 'public', 'textures', 'station')
    os.makedirs(out_dir, exist_ok=True)
    total = 0
    for name, graph in GRAPHS.items():
        if argv and name not in argv:
            continue
        a, b = bake_triples(graph)
        albedo, height, rough, strength = compose(name, a, b)
        normal = normal_from_height(height, TILE[name], strength)
        sizes = [
            save(np.clip(albedo, 0, 1), os.path.join(out_dir, f'{name}_albedo.jpg'), 'RGB'),
            save(normal, os.path.join(out_dir, f'{name}_normal.jpg'), 'RGB'),
            save(np.clip(rough, 0, 1), os.path.join(out_dir, f'{name}_rough.jpg'), 'L'),
        ]
        total += sum(sizes)
        print(f'TEXTURE {name:9s} albedo {sizes[0] / 1024:6.1f} KB  normal {sizes[1] / 1024:6.1f} KB  rough {sizes[2] / 1024:6.1f} KB', flush=True)
    print(f'TOTAL {total / 1024:.1f} KB')


if __name__ == '__main__':
    main(sys.argv[1:])
