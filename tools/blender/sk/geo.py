"""Mesh-building helpers for the station modules.

Everything here works in *game space*: metres, +Y up, the same frame as the ports in modules.json. A `Part` collects
geometry in a bmesh, one material slot per library material; `to_object` turns it into a Blender object (Z up), so
the glTF exporter's Y-up conversion lands it back in game space with no node transform.

Lathe convention: profiles are lists of (radius, t) with t measured along the axis. Walking the profile with t to the
right and radius up, the outside of the surface is on the left. A closed cross-section therefore runs clockwise.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

TAU = math.tau

# Metres covered by one repeat of each tiling texture. UVs are baked into the models in these units, so the game
# only has to set RepeatWrapping. Materials not listed here are plain colours and get no useful UVs.
TILE = {'hull': 4.0, 'quilt': 3.0, 'foil': 2.0, 'panel': 1.6, 'radiator': 2.0}

# Game space (Y up) -> Blender space (Z up). A pure rotation, so winding and normals survive.
TO_BLENDER = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))

SHARP_ANGLE = math.radians(32)


def V(p):
    return p if isinstance(p, Vector) else Vector(p)


def frame(axis, ref=None):
    """Right-handed (u, v, d) with d along `axis`. Angles round the axis run from u towards v."""
    d = V(axis).normalized()
    if ref is None:
        ref = Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((0, 0, 1))
    u = V(ref) - d * V(ref).dot(d)
    if u.length < 1e-6:
        other = Vector((1, 0, 0)) if abs(d.x) < 0.9 else Vector((0, 0, 1))
        u = other - d * other.dot(d)
    u.normalize()
    return u, d.cross(u), d


def rot_about(origin, axis, angle):
    """4x4 rotation by `angle` about the line through `origin` along `axis`."""
    o = V(origin)
    return Matrix.Translation(o) @ Matrix.Rotation(angle, 4, V(axis).normalized()) @ Matrix.Translation(-o)


class Hull:
    """A cylinder-like body to hang curved panels on: origin, axis and the number of facets round it."""

    def __init__(self, origin=(0, 0, 0), axis=(1, 0, 0), ref=None, segs=40):
        self.o = V(origin)
        self.u, self.v, self.d = frame(axis, ref)
        self.segs = segs

    def at(self, t, a, r):
        return self.o + self.d * t + (self.u * math.cos(a) + self.v * math.sin(a)) * r

    def radial(self, a):
        return self.u * math.cos(a) + self.v * math.sin(a)

    def angles(self, a0, a1):
        """a0..a1 with a stop at every facet edge of the hull between them, so panels follow its facets exactly."""
        step = TAU / self.segs
        out = [a0]
        k = math.floor(a0 / step + 1e-6) + 1
        while k * step < a1 - 1e-6:
            if k * step > a0 + 1e-6:
                out.append(k * step)
            k += 1
        out.append(a1)
        return out


class Part:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new('UVMap')
        self.explicit = self.bm.faces.layers.int.new('explicit_uv')
        self.mats = []

    # ---- low level ----

    def mat_index(self, name):
        if name not in self.mats:
            self.mats.append(name)
        return self.mats.index(name)

    def vert(self, p):
        return self.bm.verts.new(V(p))

    def face(self, verts, mat, uvs=None):
        # Collapse repeated verts (lathe poles); skip anything that is no longer a face.
        vs, us = [], []
        for i, v in enumerate(verts):
            if v not in vs:
                vs.append(v)
                if uvs:
                    us.append(uvs[i])
        if len(vs) < 3:
            return None
        try:
            f = self.bm.faces.new(vs)
        except ValueError:
            return None
        f.material_index = self.mat_index(mat)
        f.smooth = True
        if uvs:
            f[self.explicit] = 1
            for loop, uv in zip(f.loops, us):
                loop[self.uv].uv = uv
        return f

    def absorb(self, tmp, mat, matrix=None):
        """Copy a temporary bmesh in, transformed, all in one material."""
        m = matrix or Matrix.Identity(4)
        mapping = {v: self.bm.verts.new(m @ v.co) for v in tmp.verts}
        for f in tmp.faces:
            self.face([mapping[v] for v in f.verts], mat)
        tmp.free()

    # ---- primitives ----

    def lathe(self, profile, mat, origin=(0, 0, 0), axis=(1, 0, 0), ref=None, segs=24, a0=0.0, sweep=TAU, flip=False, uv_r=None, mats=None):
        """Spin `profile` [(radius, t), ...] round the axis. `mats` optionally names a material per profile segment."""
        o = V(origin)
        u, v, d = frame(axis, ref)
        closed = abs(sweep - TAU) < 1e-6
        n = segs if closed else segs + 1
        rings = []
        for r, t in profile:
            if r < 1e-6:
                rings.append([self.vert(o + d * t)])
            else:
                rings.append([self.vert(o + d * t + (u * math.cos(a0 + sweep * j / segs) + v * math.sin(a0 + sweep * j / segs)) * r) for j in range(n)])
        arc = [0.0]
        for i in range(1, len(profile)):
            arc.append(arc[-1] + math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]))
        for i in range(len(profile) - 1):
            m = mats[i] if mats else mat
            if m is None:
                continue
            tile = TILE.get(m)
            reps = max(1, round(TAU * (uv_r or max(p[0] for p in profile)) / tile)) * (sweep / TAU) if tile else 0
            a, b = rings[i], rings[i + 1]
            if len(a) == 1 and len(b) == 1:
                continue
            for j in range(segs):
                j2 = (j + 1) % n
                quad = [a[j % len(a)], a[j2 % len(a)], b[j2 % len(b)], b[j % len(b)]]
                uvs = None
                if tile:
                    u0, u1 = reps * j / segs, reps * (j + 1) / segs
                    uvs = [(u0, arc[i] / tile), (u1, arc[i] / tile), (u1, arc[i + 1] / tile), (u0, arc[i + 1] / tile)]
                if flip:
                    quad.reverse()
                    if uvs:
                        uvs.reverse()
                self.face(quad, m, uvs)

    def cyl(self, a, b, r, mat, segs=16, bevel=0.0, caps=True, r2=None, cuts=0):
        """A cylinder (or cone, with r2) from point a to point b."""
        a, b = V(a), V(b)
        length = (b - a).length
        r2 = r if r2 is None else r2
        prof = []
        if caps:
            prof.append((0, 0))
        if bevel:
            prof += [(r - bevel, 0), (r, bevel)]
        else:
            prof.append((r, 0))
        for k in range(1, cuts + 1):
            f = k / (cuts + 1)
            prof.append((r + (r2 - r) * f, length * f))
        if bevel:
            prof += [(r2, length - bevel), (r2 - bevel, length)]
        else:
            prof.append((r2, length))
        if caps:
            prof.append((0, length))
        self.lathe(prof, mat, origin=a, axis=b - a, segs=segs)

    def strut(self, a, b, r, mat, sides=5, cuts=0):
        self.cyl(a, b, r, mat, segs=sides, caps=False, cuts=cuts)

    def sphere(self, center, r, mat, segs=20, rings=10, axis=(0, 1, 0), squash=1.0):
        prof = [(r * math.sin(math.pi * i / rings), -r * squash * math.cos(math.pi * i / rings)) for i in range(rings + 1)]
        prof[0] = (0, prof[0][1])
        prof[-1] = (0, prof[-1][1])
        self.lathe(prof, mat, origin=center, axis=axis, segs=segs)

    def torus(self, center, axis, R, r, mat, segs=24, sides=8):
        prof = [(R + r * math.cos(TAU * i / sides), r * math.sin(TAU * i / sides)) for i in range(sides + 1)]
        self.lathe(prof, mat, origin=center, axis=axis, segs=segs)

    def box(self, size, center, mat, rot=None, bevel=0.0, cuts=(0, 0, 0)):
        """A box, optionally chamfered, with extra loops along each local axis for baked shading to hang on."""
        tmp = bmesh.new()
        bmesh.ops.create_cube(tmp, size=1.0)
        for vert in tmp.verts:
            vert.co = Vector((vert.co.x * size[0], vert.co.y * size[1], vert.co.z * size[2]))
        if bevel:
            bmesh.ops.bevel(tmp, geom=tmp.edges[:], offset=bevel, segments=1, affect='EDGES', profile=0.5)
        for axis_i, n in enumerate(cuts):
            for k in range(1, n + 1):
                co = Vector((0, 0, 0))
                co[axis_i] = -size[axis_i] / 2 + size[axis_i] * k / (n + 1)
                no = Vector((0, 0, 0))
                no[axis_i] = 1
                bmesh.ops.bisect_plane(tmp, geom=tmp.verts[:] + tmp.edges[:] + tmp.faces[:], plane_co=co, plane_no=no)
        m = Matrix.Translation(V(center))
        if rot is not None:
            m = m @ (rot.to_4x4() if hasattr(rot, 'to_4x4') else rot)
        self.absorb(tmp, mat, m)

    def beam(self, a, b, w, h, mat, up=None, bevel=0.0, cuts=0):
        """A box section from a to b: `w` across, `h` along `up`."""
        a, b = V(a), V(b)
        u, v, d = frame(b - a, up)
        rot = Matrix((u, v, d)).transposed()
        self.box((h, w, (b - a).length), (a + b) / 2, mat, rot=rot, bevel=bevel, cuts=(0, 0, cuts))

    def tube(self, pts, r, mat, sides=6, caps=True, up=None):
        """A pipe along a polyline, mitred at the corners."""
        pts = [V(p) for p in pts]
        dirs = [(pts[i + 1] - pts[i]).normalized() for i in range(len(pts) - 1)]
        u, v, _ = frame(dirs[0], up)
        rings = []
        for i, p in enumerate(pts):
            if i == 0:
                t = dirs[0]
            elif i == len(pts) - 1:
                t = dirs[-1]
            else:
                t = (dirs[i - 1] + dirs[i]).normalized()
                # Carry the frame round the corner.
                q = dirs[i - 1].rotation_difference(dirs[i])
                u_next = q @ u
                # Verts lie in the mitre plane: project the previous ring's offsets along the incoming direction.
                ring = []
                for k in range(sides):
                    a = TAU * k / sides
                    off = (u * math.cos(a) + v * math.sin(a)) * r
                    s = -off.dot(t) / dirs[i - 1].dot(t)
                    ring.append(self.vert(p + off + dirs[i - 1] * s))
                rings.append(ring)
                u = u_next
                v = dirs[i].cross(u)
                continue
            rings.append([self.vert(p + (u * math.cos(TAU * k / sides) + v * math.sin(TAU * k / sides)) * r) for k in range(sides)])
        for i in range(len(rings) - 1):
            for k in range(sides):
                k2 = (k + 1) % sides
                self.face([rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]], mat)
        if caps:
            self.face(list(reversed(rings[0])), mat)
            self.face(rings[-1], mat)

    def prism(self, pts, depth, mat, normal=None):
        """Extrude a planar polygon (counter-clockwise seen from `normal`) back by `depth`."""
        pts = [V(p) for p in pts]
        if normal is None:
            normal = (pts[1] - pts[0]).cross(pts[2] - pts[1])
        n = V(normal).normalized()
        top = [self.vert(p) for p in pts]
        bot = [self.vert(p - n * depth) for p in pts]
        self.face(top, mat)
        self.face(list(reversed(bot)), mat)
        k = len(pts)
        for i in range(k):
            self.face([top[i], bot[i], bot[(i + 1) % k], top[(i + 1) % k]], mat)

    def quad(self, pts, mat):
        self.face([self.vert(p) for p in pts], mat)

    def arc_panel(self, hull, t0, t1, a0, a1, r0, r1, mat, chamfer=0.0, uv_r=None, cuts=0, top_only=False):
        """A raised panel wrapped on a hull: top at radius r1, walls down to r0, following the hull's facets."""
        angs = hull.angles(a0, a1)
        ca = chamfer / r1 if chamfer else 0.0
        top_a = list(angs)
        top_a[0] += ca
        top_a[-1] -= ca
        ts = [t0 + chamfer + (t1 - t0 - 2 * chamfer) * k / (cuts + 1) for k in range(cuts + 2)]
        tile = TILE.get(mat)
        ur = uv_r or r1
        reps = max(1, round(TAU * ur / tile)) if tile else 0

        def uv(a, t):
            return (reps * a / TAU, t / tile) if tile else None

        grid = [[self.vert(hull.at(t, a, r1)) for a in top_a] for t in ts]
        for i in range(len(ts) - 1):
            for j in range(len(top_a) - 1):
                uvs = [uv(top_a[j], ts[i]), uv(top_a[j + 1], ts[i]), uv(top_a[j + 1], ts[i + 1]), uv(top_a[j], ts[i + 1])] if tile else None
                self.face([grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]], mat, uvs)
        if top_only:
            return
        lo0 = [self.vert(hull.at(t0, a, r0)) for a in angs]
        lo1 = [self.vert(hull.at(t1, a, r0)) for a in angs]
        for j in range(len(angs) - 1):
            self.face([lo0[j], lo0[j + 1], grid[0][j + 1], grid[0][j]], mat)
            self.face([grid[-1][j], grid[-1][j + 1], lo1[j + 1], lo1[j]], mat)
        # The two straight ends.
        end0 = [lo0[0]] + [grid[i][0] for i in range(len(ts))] + [lo1[0]]
        end1 = [lo0[-1]] + [grid[i][-1] for i in range(len(ts))] + [lo1[-1]]
        self.face(end0, mat)
        self.face(list(reversed(end1)), mat)

    def arc_frame(self, hull, t0, t1, a0, a1, r0, r1, bar, mat, chamfer=0.0):
        """A rectangular frame on a hull round the opening t0..t1, a0..a1; the bars sit outside the opening."""
        ba = bar / r1
        self.arc_panel(hull, t0 - bar, t0, a0 - ba, a1 + ba, r0, r1, mat, chamfer)
        self.arc_panel(hull, t1, t1 + bar, a0 - ba, a1 + ba, r0, r1, mat, chamfer)
        self.arc_panel(hull, t0, t1, a0 - ba, a0, r0, r1, mat, chamfer)
        self.arc_panel(hull, t0, t1, a1, a1 + ba, r0, r1, mat, chamfer)

    def dish(self, center, axis, radius, depth, mat, segs=20, rings=5, thick=0.02, back=None):
        """A parabolic dish opening along `axis`, vertex at `center`."""
        front = [(radius * (1 - i / rings), depth * (1 - i / rings) ** 2) for i in range(rings + 1)]
        front[-1] = (0, 0)
        rear = [(radius * i / rings, depth * (i / rings) ** 2 - thick) for i in range(rings + 1)]
        rear[0] = (0, -thick)
        prof = front + rear + [front[0]]
        mats = [mat] * rings + [None] + [back or mat] * rings + [back or mat]
        self.lathe(prof, mat, origin=center, axis=axis, segs=segs, mats=mats)

    def handrail(self, p0, p1, out, mat, height=0.15, r=0.022, sides=5, post_every=1.1):
        """An EVA rail from p0 to p1 standing `height` off the surface along `out`, with feet at each end."""
        p0, p1, out = V(p0), V(p1), V(out).normalized()
        along = (p1 - p0).normalized()
        c = min(0.05, height * 0.4)
        top0, top1 = p0 + out * height, p1 + out * height
        self.tube([p0 - out * 0.03, p0 + out * (height - c), top0 + along * c, top1 - along * c, p1 + out * (height - c), p1 - out * 0.03], r, mat, sides=sides, caps=False)
        length = (p1 - p0).length
        n = int(length / post_every)
        for k in range(1, n):
            q = p0 + along * (length * k / n)
            self.strut(q - out * 0.03, q + out * height, r * 0.9, mat, sides=4)

    # ---- finishing ----

    def tri_count(self):
        return sum(len(f.verts) - 2 for f in self.bm.faces)

    def to_object(self, collection, shade_smooth=True):
        bm = self.bm
        bm.normal_update()
        # Box-project UVs for tiled faces that didn't get explicit ones (boxes, plates): metres / tile size.
        for f in bm.faces:
            if f[self.explicit]:
                continue
            tile = TILE.get(self.mats[f.material_index])
            if not tile:
                continue
            n = f.normal if f.normal.length > 0 else Vector((0, 1, 0))
            ax = max(range(3), key=lambda i: abs(n[i]))
            i0, i1 = [(1, 2), (0, 2), (0, 1)][ax]
            for loop in f.loops:
                co = loop.vert.co
                loop[self.uv].uv = (co[i0] / tile, co[i1] / tile)
        bm.normal_update()
        for e in bm.edges:
            if len(e.link_faces) == 2:
                a, b = e.link_faces
                e.smooth = shade_smooth and a.normal.angle(b.normal, 0.0) < SHARP_ANGLE
            else:
                e.smooth = False
        bmesh.ops.transform(bm, matrix=TO_BLENDER, verts=bm.verts)
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        for name in self.mats:
            me.materials.append(bpy.data.materials[name])
        ob = bpy.data.objects.new(self.name, me)
        collection.objects.link(ob)
        return ob
