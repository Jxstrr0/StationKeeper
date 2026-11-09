"""The station modules, one builder per `greybox.shape`. Dimensions and ports come from modules.json."""
import math

from mathutils import Vector

from .fittings import Model, band, can, capsule, mast_dish, nozzle, port, porthole, rail, truss
from .geo import TAU, TILE, Hull, Part, V, frame, rot_about

PI = math.pi


def beacon(P, pos, base):
    """A stalk and cup under the status light, so the light the game adds doesn't float."""
    pos, base = V(pos), V(base)
    n = (pos - base).normalized()
    if (pos - base).length > 0.25:
        P.strut(base - n * 0.05, pos - n * 0.14, 0.028, 'slate', sides=5)
    P.cyl(pos - n * 0.2, pos - n * 0.11, 0.07, 'slate', segs=8, r2=0.13)


def ports(P, d, axis=(1, 0, 0), radial_depth=0.5):
    """A docking port at every port in the definition; ones off the hull's axis get a deeper collar and a fairing."""
    ax = V(axis)
    for p in d['ports']:
        direction = V(p['direction'])
        if abs(direction.normalized().dot(ax)) > 0.9:
            port(P, p['position'], direction)
        else:
            port(P, p['position'], direction, depth=radial_depth)
            u, _, dd = frame(direction)
            P.lathe([(1.06, -radial_depth), (0.96, -0.2), (0.86, -0.2)], 'slate', origin=p['position'], axis=dd, ref=u, segs=24)


# ---- Core ----


def build_core(d):
    g = d['greybox']
    L, r = g['length'], g['radius']
    M = Model(d)
    P = M.body
    h = Hull(segs=40)
    can(P, h, -L / 2, L / 2, r, cone=0.75, cone_mat='hull')
    band(P, h, -1.85, -1.4, r)
    band(P, h, -1.3, -1.18, r)
    band(P, h, L / 2 - 0.95, L / 2 - 0.8, r, 'slate')
    ports(P, d)

    # Handrails either side of the radial ports, on the upper starboard flank and both lower flanks.
    for a in (0.68, PI - 0.68, PI + 0.68):
        rail(P, h, -3.0, -2.0, a, r)
        rail(P, h, 1.3, 3.0, a, r)
    # Raised access panels, and a cable conduit down the port side.
    P.arc_panel(h, -2.9, -1.7, 1.15, 1.75, r - 0.01, r + 0.022, 'hull', chamfer=0.02, uv_r=r)
    P.arc_panel(h, 1.5, 2.9, 2.0, 2.45, r - 0.01, r + 0.022, 'hull', chamfer=0.02, uv_r=r)
    P.arc_panel(h, -3.1, -2.2, -2.3, -1.85, r - 0.01, r + 0.022, 'hull', chamfer=0.02, uv_r=r)
    P.arc_panel(h, -2.6, -1.9, 2.05, 2.4, r - 0.01, r + 0.03, 'slate', chamfer=0.02)
    conduit = [h.at(x, -0.82, r + 0.02) for x in (-3.2, -1.6, 0.0, 1.6, 3.2)]
    P.tube(conduit, 0.04, 'slate', sides=5)
    for x in (-3.0, -1.5, 1.5, 3.0):
        P.beam(h.at(x - 0.06, -0.82, r), h.at(x + 0.06, -0.82, r), 0.14, 0.14, 'dark', up=h.radial(-0.82))

    # The command deck's windows, forward on both flanks.
    for t in (1.7, 2.3, 2.9):
        porthole(M, h, t, 1.05, r)
    for t in (2.0, 2.6):
        porthole(M, h, t, -1.05, r)

    # Comms dish on a mast aft, out to port.
    mast_dish(P, (-L / 2 + 1.2, 0, -r), (0, 0, -1), (0.3, 0, -1), mast=0.95, radius=0.55, depth=0.2)
    # Thruster quads on the nadir side, fore and aft.
    for x in (-L / 2 + 1.0, L / 2 - 1.0):
        c = Vector((x, -(r + 0.08), 0))
        P.box((0.5, 0.34, 0.5), c, 'dark', bevel=0.05)
        P.box((0.66, 0.08, 0.66), c + Vector((0, 0.17, 0)), 'slate', bevel=0.02)
        for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nozzle(P, c + Vector((dx * 0.22, -0.03, dz * 0.22)), (dx, 0, dz), length=0.2)
        nozzle(P, c + Vector((0, -0.14, 0)), (0, -1, 0), length=0.14, r1=0.08)
    # A body-mounted radiator on the zenith side, clear of the zenith port.
    pc = Vector((2.2, r + 0.44, -0.8))
    P.box((2.0, 0.06, 1.4), pc, 'radiator', bevel=0.012, cuts=(3, 0, 1))
    for x in (1.25, 3.15):
        P.beam((x, r + 0.44, -1.52), (x, r + 0.44, -0.08), 0.07, 0.09, 'slate')
    for x in (1.6, 2.8):
        P.strut(h.at(x, -0.41, r - 0.05), (x, r + 0.41, -0.8), 0.04, 'slate', sides=6)
    P.tube([h.at(1.3, -0.41, r - 0.02), (1.3, r + 0.3, -0.8), (1.3, r + 0.41, -1.2)], 0.03, 'white', sides=5)
    # Whip antennas forward.
    for a in (0.25, -0.25):
        P.strut(h.at(L / 2 - 1.3, a, r - 0.02), h.at(L / 2 - 1.0, a, r + 0.5), 0.012, 'slate', sides=3)
    # A grapple fixture low on the starboard side.
    gp = h.at(-2.2, 2.25, r)
    gn = h.radial(2.25)
    P.cyl(gp - gn * 0.03, gp + gn * 0.07, 0.2, 'white', segs=12, bevel=0.02)
    P.cyl(gp + gn * 0.07, gp + gn * 0.2, 0.045, 'slate', segs=8)

    light = V(g['light'])
    base = Vector((light.x, 0, 0)) + Vector((0, light.y, light.z)).normalized() * r
    beacon(P, light, base)
    return M


# ---- Inflatables ----

WINDOW_BAND = {'habitat': 1.1, 'quarters': 1.6, 'galley': 0.9, 'lounge': 1.7}


def build_habitat(d):
    """Guest habitat, crew quarters, galley and lounge: a quilted inflatable along +X, told apart by their windows.

    - guest habitat: a ring of twelve framed windows;
    - crew quarters: two rows of small round portholes;
    - galley: seven windows and a vent stack with a hood;
    - guest lounge: a wide panoramic band, ten big panes with slim mullions.
    """
    g = d['greybox']
    L, r, kind = g['length'], g['radius'], d['kind']
    M = Model(d)
    P = M.body
    h = Hull(segs=40 if r >= 2 else 32)
    mid = L / 2
    bw = WINDOW_BAND.get(kind, 1.1)
    sh = min(1.05, mid - bw / 2 - 0.3)  # where the shoulder meets the straight part

    # The blanket: a blunt, inflated shoulder at each end, straight between.
    steps = 7
    shoulder = [(1.06 + (r - 1.06) * math.sin(PI / 2 * k / steps), 0.22 + (sh - 0.22) * (1 - math.cos(PI / 2 * k / steps))) for k in range(steps + 1)]
    n_mid = max(2, math.ceil((L - 2 * sh) / 0.45))
    straight = [(r, sh + (L - 2 * sh) * k / n_mid) for k in range(1, n_mid)]
    far = [(rr, L - t) for rr, t in reversed(shoulder)]
    neck0 = [(0.8, 0.04), (1.0, 0.04), (1.0, 0.16), (1.09, 0.16), (1.09, 0.22)]
    neck1 = [(1.09, L - 0.22), (1.09, L - 0.16), (1.0, L - 0.16), (1.0, L - 0.04), (0.8, L - 0.04)]
    prof = neck0 + shoulder + straight + far + neck1
    mats = ['slate'] * len(neck0) + ['quilt'] * (len(shoulder) + len(straight) + len(far) - 1) + ['slate'] * len(neck1)
    P.lathe(prof, 'quilt', origin=h.o, axis=h.d, ref=h.u, segs=h.segs, mats=mats, uv_r=r)
    ports(P, d)

    # Restraint straps over each shoulder.
    n_straps = 12 if r >= 2 else 10
    for pts in (shoulder, far):
        normals = []
        for i in range(len(pts)):
            a, b = pts[max(0, i - 1)], pts[min(len(pts) - 1, i + 1)]
            dt, dr = b[1] - a[1], b[0] - a[0]
            ln = math.hypot(dt, dr)
            normals.append((dt / ln, -dr / ln))  # (radial, axial) parts of the outward normal
        for k in range(n_straps):
            a = TAU * (k + 0.5) / n_straps
            rows = []
            for (rr, t), (nr, nt) in zip(pts, normals):
                half = 0.045 / max(rr, 0.5)
                rows.append([P.vert(h.at(t + nt * 0.014, a + s * half, rr + nr * 0.014)) for s in (-1, 1)])
            for i in range(len(rows) - 1):
                P.face([rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]], 'slate')

    # Hoop stripes where the shoulders end, and the dark window band between them.
    sw = min(0.33, mid - bw / 2 - sh - 0.05)
    band(P, h, sh + 0.02, sh + 0.02 + sw, r)
    band(P, h, L - sh - 0.02 - sw, L - sh - 0.02, r)
    b0, b1 = mid - bw / 2, mid + bw / 2
    P.lathe([(r - 0.01, b0), (r + 0.012, b0 + 0.012), (r + 0.012, b1 - 0.012), (r - 0.01, b1)], 'dark', origin=h.o, axis=h.d, ref=h.u, segs=h.segs)
    rw = r + 0.012  # the band's surface
    rf = r + 0.05  # the frames' faces

    def pane_ring(name, count, w, hgt, skip=(), lit_ring=True, frames=True):
        """`count` slots round the hull; a pane w along the hull and hgt round it in each, half a slot off the top."""
        da = hgt / r
        slots = [i for i in range(count) if i not in skip]
        offset = 0.0 if skip else TAU / count / 2
        pane = Part(name)
        pane.arc_panel(h, mid - w / 2, mid + w / 2, -da / 2, da / 2, rw, rw + 0.012, 'window', top_only=True)
        mats_ = [rot_about(h.o, h.d, offset + TAU * i / count) for i in slots]
        if frames:
            for i in slots:
                a = offset + TAU * i / count
                P.arc_frame(h, mid - w / 2, mid + w / 2, a - da / 2, a + da / 2, r, rf, 0.055, 'slate', chamfer=0.015)
        if lit_ring:
            M.window_ring(name, pane, mats_, count)
        else:
            for m in mats_:
                M.glow.arc_panel(Hull(h.o, m.to_3x3() @ h.d, m.to_3x3() @ h.u, h.segs), mid - w / 2, mid + w / 2, -da / 2, da / 2, rw, rw + 0.012, 'window', top_only=True)

    if kind == 'quarters':
        # Bunks need portholes, not a view.
        for row in (-0.4, 0.4):
            for i in range(16):
                porthole(M, h, mid + row, TAU * (i + 0.5) / 16, rw, radius=0.15, frame_w=0.04, segs=10)
        band(P, h, mid - 0.035, mid + 0.035, rw, 'slate', height=0.02)
        # A locker pod and a whip antenna, for the silhouette.
        P.box((0.9, 0.3, 0.7), h.at(sh + 0.75, 0.0, r + 0.1), 'white', bevel=0.05, cuts=(1, 0, 1))
        P.strut(h.at(L - sh - 0.6, 0.0, r - 0.02), h.at(L - sh - 0.5, 0.0, r + 0.75), 0.014, 'slate', sides=3)
    elif kind == 'galley':
        pane_ring('main', 8, 0.55, 0.5, skip=(0,), lit_ring=False)
        # The extractor: a stack with a hood, and a foil-wrapped filter box beside it.
        sx = mid - 0.5
        P.cyl((sx, r - 0.05, 0), (sx, r + 0.78, 0), 0.2, 'slate', segs=14, bevel=0.02, cuts=1)
        P.cyl((sx, r + 0.1, 0), (sx, r + 0.16, 0), 0.25, 'white', segs=14)
        P.lathe([(0.12, 0.72), (0.38, 0.8), (0.38, 0.86), (0.3, 0.94), (0, 0.94)], 'white', origin=(sx, r, 0), axis=(0, 1, 0), segs=14)
        for a in range(3):
            ang = TAU * a / 3
            P.strut((sx + 0.19 * math.cos(ang), r + 0.6, 0.19 * math.sin(ang)), (sx + 0.3 * math.cos(ang), r + 0.8, 0.3 * math.sin(ang)), 0.015, 'slate', sides=3)
        P.box((0.7, 0.42, 0.6), (mid + 0.5, r + 0.14, 0.4), 'foil', bevel=0.05, cuts=(1, 0, 1))
        P.tube([(mid + 0.15, r + 0.2, 0.4), (sx + 0.1, r + 0.2, 0.4), (sx + 0.1, r + 0.2, 0.12)], 0.045, 'slate', sides=5)
    elif kind == 'lounge':
        # A panoramic band: big panes, slim mullions, a rail above and below.
        count = 10
        pitch = TAU / count
        da = pitch - 0.16 / r
        pane = Part('main')
        pane.arc_panel(h, mid - bw / 2 + 0.12, mid + bw / 2 - 0.12, -da / 2, da / 2, rw, rw + 0.012, 'window', top_only=True)
        M.window_ring('main', pane, [rot_about(h.o, h.d, pitch / 2 + pitch * i) for i in range(count)], count)
        for i in range(count):
            a = pitch * i
            P.arc_panel(h, mid - bw / 2 + 0.06, mid + bw / 2 - 0.06, a - 0.05 / r, a + 0.05 / r, r, rf, 'slate', chamfer=0.012)
        band(P, h, b0 + 0.02, b0 + 0.12, rw, 'slate', height=0.04)
        band(P, h, b1 - 0.12, b1 - 0.02, rw, 'slate', height=0.04)
    else:
        pane_ring('main', 12, 0.7, 0.55)

    # Handrails either side of the band, where there's room.
    for a in (PI / 2, -PI / 2):
        t0, t1 = sh + sw + 0.14, b0 - 0.14
        if t1 - t0 > 0.5:
            rail(P, h, t0, t1, a, r)
            rail(P, h, L - t1, L - t0, a, r)

    light = V(g['light'])
    beacon(P, light, (light.x, r, 0))
    return M


# ---- Cupola ----


def build_cupola(d):
    g = d['greybox']
    L, r = g['length'], g['radius']
    collar = 0.9
    M = Model(d)
    P = M.body
    h = Hull(segs=32)
    can(P, h, 0, collar, r, cone=0.3, ends=(True, False))
    ports(P, d)
    band(P, h, 0.5, 0.7, r)

    # A six-sided frustum of windows with a seventh on top.
    rb, rt = r * 0.9, r * 0.55
    x0, x1 = collar, L - 0.06
    base = [h.at(x0, TAU * k / 6, rb) for k in range(6)]
    top = [h.at(x1, TAU * k / 6, rt) for k in range(6)]
    for k in range(6):
        k2 = (k + 1) % 6
        out = h.radial(TAU * k / 6)
        P.beam(base[k], top[k], 0.13, 0.13, 'slate', up=out, bevel=0.025)
        mid_out = h.radial(TAU * (k + 0.5) / 6)
        P.beam(base[k], base[k2], 0.16, 0.14, 'slate', up=mid_out, bevel=0.025)
        P.beam(top[k], top[k2], 0.12, 0.12, 'slate', up=h.d, bevel=0.02)
        # The pane, set a little inside the frame.
        inset = mid_out * -0.035
        M.glow.quad([base[k] + inset, base[k2] + inset, top[k2] + inset, top[k] + inset], 'window')
        # A shutter folded back along the collar, hinged at the sill.
        tan = h.d.cross(mid_out)
        c0 = h.o + h.d * (x0 - 0.06) + mid_out * (r + 0.065)
        c1 = h.o + h.d * 0.22 + mid_out * (r + 0.065)
        P.prism([c0 + tan * 0.6, c0 - tan * 0.6, c1 - tan * 0.36, c1 + tan * 0.36], 0.04, 'white')
        P.beam(c0 + mid_out * 0.012, c1 + mid_out * 0.012, 0.07, 0.03, 'slate', up=mid_out)
        P.cyl(c0 + h.d * 0.05 - tan * 0.5 - mid_out * 0.03, c0 + h.d * 0.05 + tan * 0.5 - mid_out * 0.03, 0.05, 'slate', segs=6)
    M.glow.face([M.glow.vert(p - h.d * 0.03) for p in top], 'window')
    # A grapple pin on the crown.
    P.cyl(h.at(x1 - 0.02, 0, 0), h.at(L, 0, 0), 0.07, 'slate', segs=8)

    light = V(g['light'])
    beacon(P, light, (light.x, r * 0.9, 0))
    return M


# ---- Battery ----


def build_battery(d):
    g = d['greybox']
    sx, sy, sz = g['size']
    top = -0.45
    M = Model(d)
    P = M.body
    port(P, (0, 0, 0), (0, 1, 0), depth=0.5)
    cy = top - sy / 2
    P.box((sx, sy, sz), (0, cy, 0), 'foil', bevel=0.1, cuts=(2, 2, 2))
    # A frame round the pack: corner posts, top and bottom rims.
    hx, hz = sx / 2 - 0.05, sz / 2 - 0.05
    for x in (-hx, hx):
        for z in (-hz, hz):
            P.beam((x, top, z), (x, top - sy, z), 0.12, 0.12, 'slate', bevel=0.02, cuts=2)
    for y in (top - 0.03, top - sy + 0.03):
        for z in (-hz, hz):
            P.beam((-hx, y, z), (hx, y, z), 0.1, 0.1, 'slate', cuts=2)
        for x in (-hx, hx):
            P.beam((x, y, -hz), (x, y, hz), 0.1, 0.1, 'slate', cuts=2)
    P.box((1.95, 0.08, 1.95), (0, top + 0.03, 0), 'slate', bevel=0.03, cuts=(1, 0, 1))
    P.box((sx + 0.03, 0.16, sz + 0.03), (0, top - 0.32, 0), 'stripe', bevel=0.02, cuts=(2, 0, 2))
    # Cooling fins down both sides, with headers along their tips.
    fins = 9
    fy = cy - 0.1
    for s in (1, -1):
        for i in range(fins):
            x = -sx / 2 + 0.3 + i * (sx - 0.6) / (fins - 1)
            P.box((0.045, sy * 0.7, 0.5), (x, fy, s * (sz / 2 + 0.24)), 'white', cuts=(0, 1, 1))
        for y in (fy + sy * 0.3, fy - sy * 0.3):
            P.beam((-sx / 2 + 0.2, y, s * (sz / 2 + 0.47)), (sx / 2 - 0.2, y, s * (sz / 2 + 0.47)), 0.05, 0.05, 'slate', cuts=3)
    # Grapple fixture underneath.
    P.cyl((0, top - sy + 0.02, 0), (0, top - sy - 0.11, 0), 0.22, 'slate', segs=12, bevel=0.02)
    P.cyl((0, top - sy - 0.11, 0), (0, top - sy - 0.24, 0), 0.06, 'white', segs=8)
    # Cable run and connector on the +X face, a louvred vent on the -X face, a handrail beside the cable.
    fx = sx / 2
    P.tube([(fx + 0.03, top - 0.12, 0.4), (fx + 0.03, top - sy * 0.55, 0.4), (fx + 0.03, top - sy * 0.55, -0.1), (fx + 0.03, top - sy * 0.88, -0.1)], 0.04, 'dark', sides=5)
    P.box((0.08, 0.22, 0.22), (fx + 0.03, top - 0.15, 0.4), 'slate', bevel=0.02)
    P.box((0.08, 0.22, 0.3), (fx + 0.03, top - sy * 0.88, -0.1), 'slate', bevel=0.02)
    P.handrail((fx, top - 0.5, -0.75), (fx, top - sy + 0.35, -0.75), (1, 0, 0), 'rail', height=0.07)
    P.box((0.06, 0.7, 1.0), (-fx + 0.01, cy, 0), 'slate', bevel=0.02)
    for i in range(5):
        P.box((0.04, 0.05, 0.86), (-fx - 0.03, cy - 0.24 + i * 0.12, 0), 'white')
    light = V(g['light'])
    beacon(P, light, light - Vector((0.3, 0, 0)))
    return M


# ---- Truss-mounted: solar array and radiator ----


def root_adapter(P, sign):
    """Collar-to-truss adapter at the base port: a cone from the docking collar down to the truss's width."""
    P.lathe([(0.86, 0.26), (0.9, 0.3), (0.9, 0.4), (0.6, 0.86), (0.6, 0.98), (0, 0.98)], 'slate', origin=(0, 0, 0), axis=(0, 0, sign), ref=(0, 1, 0), segs=24,
            mats=['slate', 'white', 'slate', 'white', 'slate'])


def build_solar(d):
    g = d['greybox']
    L, wing_l, wing_w = g['length'], g['wingLength'], g['wingWidth']
    M = Model(d)
    P = M.body
    port(P, (0, 0, 0), (0, 0, -1), depth=0.3)
    root_adapter(P, 1)
    truss(P, (0, 0, 0.9), (0, 0, L - 0.1), 0.8, (0, 1, 0))
    # Power cable up the truss, an electronics box near the root, and the joint's fixed half.
    P.tube([(0.3, 0.3, 0.95), (0.3, 0.3, L * 0.5), (0.3, 0.3, L - 0.1)], 0.045, 'dark', sides=5)
    P.box((0.5, 0.24, 0.8), (0, -0.5, 1.75), 'white', bevel=0.04, cuts=(0, 0, 1))
    P.box((0.3, 0.1, 0.5), (0, -0.64, 1.75), 'slate')
    P.cyl((0, 0, L - 0.16), (0, 0, L), 0.52, 'slate', segs=20, bevel=0.03)

    # Everything that turns with the wings.
    G = Part('gimbal_body')
    zc = L + 0.5
    G.lathe([(0, 0), (0.46, 0.0), (0.6, 0.07), (0.6, 0.28), (0.645, 0.3), (0.645, 0.42), (0.6, 0.44), (0.6, 0.93), (0.54, 1.0), (0, 1.0)], 'slate',
            origin=(0, 0, L), axis=(0, 0, 1), ref=(0, 1, 0), segs=24, mats=['slate', 'slate', 'slate', 'white', 'white', 'white', 'slate', 'slate', 'slate'])
    mx = -0.09
    half = wing_l + 0.85
    G.cyl((mx, -half, zc), (mx, half, zc), 0.07, 'slate', segs=8, cuts=11)
    sections = 6
    sec = wing_l / sections
    tile = TILE['panel']
    for s in (1, -1):
        for zlo, zhi in ((zc + 0.1, zc + wing_w / 2 - 0.1), (zc - wing_w / 2 + 0.1, zc - 0.1)):
            for k in range(sections):
                ya, yb = 0.8 + sec * k + 0.02, 0.8 + sec * (k + 1) - 0.02
                ylo, yhi = (ya, yb) if s > 0 else (-yb, -ya)
                front = [G.vert((0.03, ylo, zlo)), G.vert((0.03, yhi, zlo)), G.vert((0.03, yhi, zhi)), G.vert((0.03, ylo, zhi))]
                uvs = [(0, 0), (0, (yhi - ylo) / tile), ((zhi - zlo) / tile, (yhi - ylo) / tile), ((zhi - zlo) / tile, 0)]
                G.face(front, 'panel', uvs)
                back = [G.vert((-0.005, ylo, zlo)), G.vert((-0.005, ylo, zhi)), G.vert((-0.005, yhi, zhi)), G.vert((-0.005, yhi, zlo))]
                G.face(back, 'dark')
            # Hinge lines between the sections, and the bars at root and tip.
            for k in range(1, sections):
                y = s * (0.8 + sec * k)
                G.beam((0.0, y, zlo), (0.0, y, zhi), 0.04, 0.05, 'slate')
        for z in (zc + wing_w / 2 - 0.05, zc - wing_w / 2 + 0.05):
            G.beam((0.0, s * 0.78, z), (0.0, s * (0.82 + wing_l), z), 0.05, 0.06, 'slate', cuts=5)
        G.beam((0.0, s * (0.84 + wing_l), zc - wing_w / 2), (0.0, s * (0.84 + wing_l), zc + wing_w / 2), 0.09, 0.07, 'slate', cuts=1)
        G.box((0.16, 0.14, wing_w - 0.04), (-0.02, s * 0.72, zc), 'white', bevel=0.03, cuts=(0, 0, 1))
        # Ties from the mast to the blankets' inner edges.
        for k in range(sections + 1):
            y = s * (0.8 + sec * k)
            G.strut((mx, y, zc), (0.0, y, zc + 0.12), 0.012, 'slate', sides=3)
            G.strut((mx, y, zc), (0.0, y, zc - 0.12), 0.012, 'slate', sides=3)
    M.gimbal = (G, (0, 0, L))

    light = V(g['light'])
    beacon(P, light, (light.x, 0.42, light.z))
    return M


def build_radiator(d):
    """Truss out along -Z from the base port, then two wings of panels along X that face the orbit normal."""
    g = d['greybox']
    L, wing_l, wing_w = g['length'], g['wingLength'], g['wingWidth']
    M = Model(d)
    P = M.body
    port(P, (0, 0, 0), (0, 0, 1), depth=0.3)
    root_adapter(P, -1)
    zc = -L - 0.3
    truss(P, (0, 0, -0.9), (0, 0, -L + 0.2), 0.8, (0, 1, 0))
    # Coolant supply and return down the truss.
    for x in (0.22, -0.22):
        P.tube([(x, -0.3, -0.7), (x, -0.3, -L * 0.5), (x, -0.3, -L + 0.2)], 0.05, 'white', sides=6)
    for z in (-1.4, -3.0, -4.6):
        P.box((0.62, 0.07, 0.12), (0, -0.3, z), 'slate')
    # Pump module: foil-wrapped, with a frame, two accumulators underneath and risers up to the manifold.
    P.box((1.4, 1.0, 1.0), (0, 0, zc), 'foil', bevel=0.08, cuts=(1, 1, 1))
    for x in (-0.69, 0.69):
        for y in (-0.49, 0.49):
            P.beam((x, y, zc - 0.5), (x, y, zc + 0.5), 0.09, 0.09, 'slate', cuts=1)
    for x in (-0.35, 0.35):
        capsule(P, (x, -0.68, zc - 0.22), (x, -0.68, zc + 0.22), 0.16, 'white', segs=10, rings=3)
        P.box((0.1, 0.12, 0.3), (x, -0.55, zc), 'slate')
    my = wing_w / 2 + 0.15
    half = wing_l + 0.8
    P.cyl((-half, my, zc), (half, my, zc), 0.085, 'slate', segs=8, cuts=9)
    for x in (-0.4, 0.4):
        P.tube([(x, 0.45, zc), (x, my, zc)], 0.05, 'white', sides=6)
    # Three panels a side, hung from the manifold, hinged to each other.
    segs = 3
    gap = 0.15
    seg_l = (wing_l - (segs - 1) * gap) / segs
    for side in (1, -1):
        for i in range(segs):
            xc = side * (0.8 + seg_l / 2 + i * (seg_l + gap))
            P.box((seg_l, wing_w, 0.05), (xc, 0, zc), 'radiator', bevel=0.012, cuts=(2, 1, 0))
            for dx in (-seg_l / 4, seg_l / 4):
                P.strut((xc + dx, wing_w / 2 - 0.02, zc), (xc + dx, my, zc), 0.03, 'white', sides=5)
            if i < segs - 1:
                xg = side * (0.8 + (i + 1) * (seg_l + gap) - gap / 2)
                for y in (-0.7, 0.0, 0.7):
                    P.cyl((xg, y - 0.14, zc), (xg, y + 0.14, zc), 0.05, 'slate', segs=6)
        P.beam((side * 0.78, -wing_w / 2 - 0.04, zc), (side * (0.82 + wing_l), -wing_w / 2 - 0.04, zc), 0.06, 0.06, 'slate', cuts=5)
        P.strut((side * 0.6, 0.3, zc), (side * 1.9, my, zc), 0.03, 'slate', sides=5)

    light = V(g['light'])
    beacon(P, light, (light.x, 0.42, light.z))
    return M


# ---- Life support ----


def build_lifesupport(d):
    """A short pressurised module running aft along -X, with O2 spheres and a water tank strapped to it."""
    g = d['greybox']
    L, r = g['length'], g['radius']
    M = Model(d)
    P = M.body
    h = Hull(segs=36)
    mid = -L / 2
    can(P, h, -L, 0, r)
    ports(P, d)
    band(P, h, mid + 0.55, mid + 0.85, r)
    rail(P, h, -L + 0.75, -0.75, -0.5, r)
    P.arc_panel(h, mid - 0.2, mid + 0.4, 0.25, 0.75, r - 0.01, r + 0.022, 'hull', chamfer=0.02, uv_r=r)
    # Vent nozzle and a sample port on top.
    vp = h.at(mid - 1.0, -0.3, r)
    vn = h.radial(-0.3)
    P.cyl(vp - vn * 0.05, vp + vn * 0.3, 0.12, 'slate', segs=10, bevel=0.015)
    nozzle(P, vp + vn * 0.3, vn, length=0.16, r0=0.08, r1=0.15)
    P.box((0.45, 0.2, 0.35), (mid + 0.4, r + 0.04, -0.6), 'dark', bevel=0.03)
    # O2 spheres either side on cradles, strapped, each plumbed into the hull.
    sr = 0.62
    for z in (1, -1):
        c = Vector((mid - 0.6, 0.35, z * (r + 0.45)))
        P.sphere(c, sr, 'white', segs=20, rings=10, axis=(0, 0, 1))
        P.cyl((c.x, c.y, z * (r - 0.25)), (c.x, c.y, z * (r + 0.1)), 0.4, 'slate', segs=12, r2=0.3)
        for ax in ((1, 0, 0), (0, 1, 0)):
            P.torus(c, ax, sr + 0.005, 0.028, 'slate', segs=20, sides=4)
        P.cyl(c + Vector((0, 0, z * (sr - 0.03))), c + Vector((0, 0, z * (sr + 0.1))), 0.07, 'slate', segs=8)
        P.tube([c + Vector((0, 0, z * (sr + 0.06))), c + Vector((0.75, 0, z * (sr + 0.06))), (c.x + 0.75, c.y, z * (r + 0.1)), (c.x + 0.75, c.y, z * (r - 0.1))], 0.035, 'slate', sides=5)
    # Water tank underneath in foil, on saddles, with bands and a feed pipe.
    ty = -r - 0.35
    capsule(P, (mid - 0.95, ty, 0), (mid + 0.95, ty, 0), 0.55, 'foil', segs=18, rings=4, squash=0.65)
    for x in (mid - 0.8, mid + 0.8):
        P.torus((x, ty, 0), (1, 0, 0), 0.56, 0.035, 'slate', segs=18, sides=4)
        P.box((0.16, 0.5, 0.7), (x, -r - 0.0, 0), 'slate', bevel=0.02)
    P.tube([(mid, ty, 0.5), (mid, ty, 0.8), (mid, -r * 0.72, 1.25)], 0.04, 'slate', sides=5)
    # Pipe run along the upper flank.
    P.tube([h.at(x, 1.0, r + 0.03) for x in (-L + 0.8, mid, -0.8)], 0.035, 'white', sides=5)
    for x in (-L + 0.9, mid, -0.9):
        P.beam(h.at(x - 0.05, 1.0, r), h.at(x + 0.05, 1.0, r), 0.12, 0.12, 'slate', up=h.radial(1.0))

    light = V(g['light'])
    base = Vector((light.x, 0, 0)) + Vector((0, light.y, light.z)).normalized() * r
    beacon(P, light, base)
    return M


# ---- Research lab ----


def build_lab(d):
    """A research can running aft along -X: lit rack windows on -Z, an exposed payload platform on +Z, dish and sensor boom."""
    g = d['greybox']
    L, r = g['length'], g['radius']
    M = Model(d)
    P = M.body
    h = Hull(segs=36)
    mid = -L / 2
    can(P, h, -L, 0, r)
    ports(P, d)
    band(P, h, -1.25, -0.95, r)
    band(P, h, -1.61, -1.49, r)
    band(P, h, -L + 0.95, -L + 1.25, r)
    for a in (0.6, PI - 0.6):
        rail(P, h, -L + 0.8, -0.8, a, r)

    # Lit experiment-rack windows down the -Z side, framed, on a dark panel.
    wa = -PI / 2
    da = 0.5 / r
    P.arc_panel(h, -1.9 - 4 * 0.85 - 0.45, -1.9 + 0.45, wa - da / 2 - 0.1, wa + da / 2 + 0.1, r - 0.01, r + 0.014, 'dark', chamfer=0.012)
    for i in range(5):
        x = -1.9 - i * 0.85
        M.glow.arc_panel(h, x - 0.275, x + 0.275, wa - da / 2, wa + da / 2, r, r + 0.026, 'window', top_only=True)
        P.arc_frame(h, x - 0.275, x + 0.275, wa - da / 2, wa + da / 2, r, r + 0.05, 0.05, 'slate', chamfer=0.014)

    # Exposed payload platform on +Z: two pylons, a deck, and the instruments on it.
    for x in (-1.9, -L + 1.9):
        P.box((0.16, 0.9, 0.55), (x, 0, r + 0.2), 'slate', bevel=0.03, cuts=(0, 1, 1))
    deck = r + 0.45
    P.box((L - 2.2, 1.0, 0.1), (mid, 0, deck), 'slate', bevel=0.025, cuts=(4, 1, 0))
    P.box((0.9, 0.8, 0.45), (mid + 1.2, 0, deck + 0.27), 'white', bevel=0.04, cuts=(1, 1, 0))
    P.box((0.5, 0.5, 0.03), (mid + 1.2, 0, deck + 0.5), 'dark')
    P.box((0.7, 0.7, 0.4), (mid, 0.05, deck + 0.25), 'foil', bevel=0.05, cuts=(1, 1, 0))
    P.box((0.9, 0.8, 0.45), (mid - 1.2, 0, deck + 0.27), 'dark', bevel=0.04, cuts=(1, 1, 0))
    P.cyl((mid - 1.2, 0, deck + 0.45), (mid - 1.2, 0, deck + 0.62), 0.2, 'slate', segs=12, bevel=0.02)
    P.cyl((mid + 0.6, -0.28, deck + 0.05), (mid + 0.6, -0.28, deck + 0.5), 0.2, 'slate', segs=12, bevel=0.02)
    P.cyl((mid + 0.6, -0.28, deck + 0.5), (mid + 0.6, -0.28, deck + 0.52), 0.14, 'dark', segs=12)
    P.handrail((mid - 1.9, 0.44, deck + 0.05), (mid + 1.9, 0.44, deck + 0.05), (0, 0, 1), 'rail', height=0.14)

    # Dish on a mast on top, aft; a sensor boom out along -Z, low on the hull.
    mast_dish(P, (-L + 1.4, r, 0), (0, 1, 0), (0.25, 1, 0), mast=0.72, radius=0.34, depth=0.1)
    bp = Vector((-1.0, -0.9, -math.sqrt(r * r - 0.81)))
    P.strut(bp + Vector((0, 0, 0.05)), (-1.0, -0.9, -(r + 0.58)), 0.03, 'slate', sides=5, cuts=1)
    P.sphere((-1.0, -0.9, -(r + 0.65)), 0.13, 'dark', segs=10, rings=6)
    P.cyl(bp + Vector((0, 0, 0.03)), bp - Vector((0, 0, 0.08)), 0.09, 'slate', segs=8)

    light = V(g['light'])
    beacon(P, light, (light.x, r, 0))
    return M


# ---- Docking node ----


def build_node(d):
    """A short pressurised junction along +X from the mount, with ports fore, zenith and nadir."""
    g = d['greybox']
    L, r = g['length'], g['radius']
    M = Model(d)
    P = M.body
    h = Hull(segs=32)
    can(P, h, 0, L, r, cone=0.24, step=0.05, neck=1.0)
    ports(P, d, radial_depth=0.62)
    mid = L / 2
    for t0, t1 in ((0.47, 0.55), (L - 0.55, L - 0.47)):
        band(P, h, t0, t1, r)
    for a in (PI / 2, -PI / 2):
        rail(P, h, 0.75, L - 0.75, a + 0.35, r)
        P.arc_panel(h, mid - 0.45, mid + 0.45, a - 0.45, a + 0.12, r - 0.01, r + 0.02, 'hull', chamfer=0.02, uv_r=r)
    P.box((0.5, 0.16, 0.36), h.at(mid, PI / 2 - 0.2, r + 0.05), 'dark', bevel=0.03)

    light = V(g['light'])
    base = Vector((light.x, 0, 0)) + Vector((0, light.y, light.z)).normalized() * r
    beacon(P, light, base)
    return M


BUILDERS = {
    'core': build_core,
    'solar': build_solar,
    'battery': build_battery,
    'habitat': build_habitat,
    'radiator': build_radiator,
    'lifesupport': build_lifesupport,
    'lab': build_lab,
    'node': build_node,
    'cupola': build_cupola,
}
