"""Parts every module shares: docking ports, pressure hulls, stripe bands, trusses, portholes."""
import math

from mathutils import Vector

from .geo import TAU, Hull, V, frame


class Model:
    """What one module is made of. The exporter turns this into the nodes the game looks for."""

    def __init__(self, definition):
        from .geo import Part

        self.d = definition
        self.body = Part('body')
        self.glow = Part('glow')
        self.gimbal = None  # (Part, origin) for the solar array
        self.rings = []  # (name, pane Part, [game-space matrices], slots)

    def window_ring(self, name, pane, matrices, slots):
        self.rings.append((name, pane, matrices, slots))


def port(P, pos, direction, depth=0.32, hatch=True):
    """A docking port whose mating face is at `pos`, facing `direction`: collar, ring, hatch and three guide petals.

    Nothing here stands more than 0.17 m proud of the mating plane: the game's collision test shrinks every part's
    box by 0.2 m, and two docked modules must not count as touching.
    """
    o = V(pos)
    u, v, d = frame(direction)
    prof = [(0.86, -depth), (0.86, -0.075), (0.93, -0.075), (0.93, -0.014), (0.916, 0.0), (0.67, 0.0), (0.655, -0.015), (0.655, -0.15)]
    mats = ['slate', 'slate', 'slate', 'slate', 'white', 'white', 'slate']
    if hatch:
        prof += [(0.33, -0.15), (0.3, -0.11), (0.12, -0.11), (0.1, -0.13), (0, -0.13)]
        mats += ['dark', 'slate', 'slate', 'dark', 'dark']
    P.lathe(prof, 'slate', origin=o, axis=d, ref=u, segs=24, mats=mats)
    if hatch:
        # A handle across the hatch boss.
        P.beam(o + u * 0.2 - d * 0.1, o - u * 0.2 - d * 0.1, 0.04, 0.03, 'slate', up=d)
    # Guide petals, leaning in.
    for i in range(3):
        a = TAU * i / 3 + TAU / 12
        rad = u * math.cos(a) + v * math.sin(a)
        tan = v * math.cos(a) - u * math.sin(a)
        b0 = o + rad * 0.655 - d * 0.03
        t0 = o + rad * 0.56 + d * 0.165
        P.prism([b0 - tan * 0.17, b0 + tan * 0.17, t0 + tan * 0.09, t0 - tan * 0.09], 0.04, 'slate')
    # Latch housings round the collar.
    for i in range(6):
        a = TAU * i / 6
        rad = u * math.cos(a) + v * math.sin(a)
        tan = v * math.cos(a) - u * math.sin(a)
        c = o + rad * 0.9 - d * 0.16
        P.beam(c - tan * 0.07, c + tan * 0.07, 0.13, 0.1, 'dark', up=rad)


def can(P, h, t0, t1, r, mat='hull', neck=1.0, cone=0.55, step=0.06, ring=0.45, ends=(True, True), cone_mat='hull'):
    """A pressure hull along the Hull's axis from t0 to t1: conical bulkheads down to a neck where the ports go."""
    prof, mats = [], []
    rs = r - step
    if ends[0]:
        prof += [(0.8, t0 + 0.04), (neck, t0 + 0.04), (neck, t0 + 0.1), (rs, t0 + cone), (rs, t0 + cone + 0.1), (r, t0 + cone + 0.1 + step)]
        mats += [cone_mat, cone_mat, cone_mat, 'slate', 'slate']
        a = t0 + cone + 0.1 + step
    else:
        prof += [(0, t0), (r - 0.06, t0), (r, t0 + 0.06)]
        mats += ['slate', 'slate']
        a = t0 + 0.06
    b = t1 - cone - 0.1 - step if ends[1] else t1 - 0.06
    n = max(1, math.ceil((b - a) / ring))
    for k in range(1, n + 1):
        prof.append((r, a + (b - a) * k / n))
        mats.append(mat)
    if ends[1]:
        prof += [(rs, t1 - cone - 0.1), (rs, t1 - cone), (neck, t1 - 0.1), (neck, t1 - 0.04), (0.8, t1 - 0.04)]
        mats += ['slate', 'slate', cone_mat, cone_mat, cone_mat]
    else:
        prof += [(r - 0.06, t1), (0, t1)]
        mats += ['slate', 'slate']
    P.lathe(prof, mat, origin=h.o, axis=h.d, ref=h.u, segs=h.segs, mats=mats, uv_r=r)


def band(P, h, t0, t1, r, mat='stripe', height=0.018):
    """A raised band right round a hull."""
    c = min(height, (t1 - t0) / 4)
    P.lathe([(r - 0.01, t0), (r + height, t0 + c), (r + height, t1 - c), (r - 0.01, t1)], mat, origin=h.o, axis=h.d, ref=h.u, segs=h.segs)


def rail(P, h, t0, t1, a, r, **kw):
    """A handrail along a hull at angle a."""
    P.handrail(h.at(t0, a, r), h.at(t1, a, r), h.radial(a), 'rail', **kw)


def porthole(model, h, t, a, r, radius=0.17, frame_w=0.045, lit=True, segs=12):
    """A round window on a hull: a slate frame on the body and a pane that glows."""
    c = h.at(t, a, r)
    n = h.radial(a)
    model.body.lathe(
        [(radius + frame_w, -0.03), (radius + frame_w, 0.02), (radius + frame_w - 0.012, 0.032), (radius, 0.032), (radius, 0.0)],
        'slate', origin=c, axis=n, ref=h.d, segs=segs,
    )
    part = model.glow if lit else model.body
    part.lathe([(radius, 0.008), (0, 0.008)], 'window' if lit else 'dark', origin=c, axis=n, ref=h.d, segs=segs)


def truss(P, a, b, width, up, bay=1.1, longeron=0.05, brace=0.028, mat='slate', brace_mat='white'):
    """An open square truss from a to b: four longerons, a batten frame every bay, alternating diagonals."""
    a, b = V(a), V(b)
    u, v, d = frame(b - a, up)
    length = (b - a).length
    hw = width / 2
    corners = [u * hw + v * hw, v * hw - u * hw, -u * hw - v * hw, u * hw - v * hw]
    bays = max(1, round(length / bay))
    for c in corners:
        P.beam(a + c, b + c, longeron * 2, longeron * 2, mat, up=u, cuts=bays - 1)
    for k in range(bays + 1):
        o = a + d * (length * k / bays)
        for i in range(4):
            P.strut(o + corners[i], o + corners[(i + 1) % 4], brace, brace_mat, sides=4)
        if k == bays:
            break
        o2 = a + d * (length * (k + 1) / bays)
        for i in range(4):
            c0, c1 = corners[i], corners[(i + 1) % 4]
            if (k + i) % 2 == 0:
                P.strut(o + c0, o2 + c1, brace, brace_mat, sides=4)
            else:
                P.strut(o + c1, o2 + c0, brace, brace_mat, sides=4)


def capsule(P, a, b, r, mat, segs=16, rings=4, squash=0.7):
    """A tank: a cylinder from a to b with domed ends beyond them."""
    a, b = V(a), V(b)
    length = (b - a).length
    prof = [(0, -r * squash)]
    for i in range(1, rings + 1):
        ang = math.pi / 2 * i / rings
        prof.append((r * math.sin(ang), -r * squash * math.cos(ang)))
    mid = 3
    for k in range(1, mid + 1):
        prof.append((r, length * k / mid))
    for i in range(1, rings + 1):
        ang = math.pi / 2 * (1 - i / rings)
        prof.append((r * math.sin(ang), length + r * squash * math.cos(ang)))
    prof[-1] = (0, length + r * squash)
    P.lathe(prof, mat, origin=a, axis=b - a, segs=segs, uv_r=r)


def nozzle(P, pos, direction, mat='slate', length=0.2, r0=0.045, r1=0.1, segs=10):
    """A small thruster bell, open end out."""
    P.lathe([(r0, 0), (r1, length), (r1 - 0.015, length), (r0 * 0.6, 0.03)], mat, origin=pos, axis=direction, segs=segs)


def mast_dish(P, base, out, aim, mast=0.9, radius=0.5, depth=0.17, mat='white'):
    """A dish on a short mast: `base` on the hull, mast along `out`, dish opening along `aim`."""
    base, out, aim = V(base), V(out).normalized(), V(aim).normalized()
    top = base + out * mast
    P.strut(base - out * 0.05, top, 0.035, 'slate', sides=6, cuts=1)
    P.cyl(base - out * 0.03, base + out * 0.06, 0.09, 'slate', segs=8)
    P.sphere(top, 0.07, 'slate', segs=8, rings=4)
    vertex = top + aim * 0.1
    P.strut(top, vertex, 0.03, 'slate', sides=6)
    P.dish(vertex, aim, radius, depth, mat, segs=20, rings=4, back='white')
    focus = radius * radius / (4 * depth)
    feed = vertex + aim * focus
    u, v, _ = frame(aim)
    for i in range(3):
        a = TAU * i / 3
        rim = vertex + (u * math.cos(a) + v * math.sin(a)) * radius * 0.92 + aim * depth * 0.85
        P.strut(rim, feed, 0.012, 'slate', sides=3)
    P.cyl(feed - aim * 0.05, feed + aim * 0.03, 0.05, 'slate', segs=8)
