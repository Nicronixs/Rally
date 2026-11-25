"""Rally car: lofted body, details, interior, crew and wheels.

Origin = centre of the physics body. Ground is at z = -0.76.
Wheel centres: x = +-1.28, y = +-0.80, z = -0.42, radius 0.34 (see src/vehicle.js).
"""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix
from lib import (material, Builder, empty, apply_modifiers, bvh, smooth)

WHEEL_X = 1.28
WHEEL_Y = 0.80
WHEEL_Z = -0.42
WHEEL_R = 0.34


def lerp_keys(keys, x):
    if x <= keys[0][0]:
        return keys[0][1]
    for (x0, v0), (x1, v1) in zip(keys, keys[1:]):
        if x <= x1:
            t = (x - x0) / (x1 - x0)
            return v0 + (v1 - v0) * t
    return keys[-1][1]


# body shape keyframes along x (rear -> front)
FLOOR_Z = [(-1.98, -0.36), (-1.75, -0.45), (1.72, -0.45), (2.02, -0.33)]
SILL_Z = [(-1.98, -0.30), (-1.72, -0.40), (1.70, -0.40), (2.02, -0.27)]
SILL_W = [(-1.98, 0.78), (-1.70, 0.84), (1.70, 0.84), (2.02, 0.74)]
MID_Z = [(-1.98, -0.08), (2.02, -0.10)]
MID_W = [(-1.98, 0.84), (-1.75, 0.912), (-0.85, 0.912), (-0.62, 0.872), (0.68, 0.872),
         (0.90, 0.912), (1.72, 0.912), (2.02, 0.79)]
BELT_Z = [(-1.98, 0.20), (-1.0, 0.18), (0.80, 0.165), (1.40, 0.11), (2.02, 0.02)]
BELT_W = [(-1.98, 0.81), (-1.6, 0.845), (0.80, 0.85), (1.6, 0.83), (2.02, 0.73)]
ROOF_Z = [(-1.72, 0.655), (-1.2, 0.69), (-0.5, 0.70), (0.0, 0.67)]
COWL_X, ROOF_FRONT_X, ROOF_REAR_X, TAIL_X = 0.80, 0.0, -1.72, -1.98

STATIONS = [-1.98, -1.88, -1.72, -1.50, -1.20, -0.90, -0.62, -0.52, -0.20, 0.0,
            0.25, 0.55, 0.80, 1.10, 1.45, 1.80, 2.02]


def section(x):
    """Half cross-section: 10 (y, z) points from bottom centre around to roof centre."""
    zf, zs, ws = lerp_keys(FLOOR_Z, x), lerp_keys(SILL_Z, x), lerp_keys(SILL_W, x)
    wf = ws - 0.10
    zm, wm = lerp_keys(MID_Z, x), lerp_keys(MID_W, x)
    zb, wb = lerp_keys(BELT_Z, x), lerp_keys(BELT_W, x)
    pts = [(0.0, zf), (wf, zf), (ws, zs), (wm, zm), (wb, zb)]
    if x >= COWL_X:  # bonnet
        pts += [(wb - 0.05, zb + 0.012), (wb - 0.20, zb + 0.025), (0.50, zb + 0.034), (0.18, zb + 0.040), (0.0, zb + 0.042)]
    elif x >= ROOF_FRONT_X:  # windscreen
        zc = 0.17 + (COWL_X - x) / COWL_X * 0.495
        wap = 0.63 + (x / COWL_X) * 0.07
        pts += [(wb - 0.05, zb + 0.022), (wap + 0.035, max(zb + 0.03, zc - 0.045)),
                (wap, max(zb + 0.04, zc - 0.02)), (0.18, zc - 0.002), (0.0, zc)]
    elif x >= ROOF_REAR_X:  # roof
        zc = lerp_keys(ROOF_Z, x)
        pts += [(wb - 0.05, zb + 0.022), (0.695, zc - 0.075), (0.63, zc - 0.025), (0.18, zc - 0.003), (0.0, zc)]
    else:  # hatch with rear window
        zc = 0.655 + (x - ROOF_REAR_X) / (TAIL_X - ROOF_REAR_X) * (0.25 - 0.655)
        pts += [(wb - 0.05, zb + 0.022), (0.69, max(zb + 0.035, zc - 0.07)),
                (0.62, max(zb + 0.045, zc - 0.025)), (0.18, zc - 0.003), (0.0, zc)]
    return pts


def segment_material(j, xm, M):
    """Material of the loft face between point j and j+1 at mid-station xm."""
    if j <= 1:
        return M['Dark']
    if j == 2:
        return M['Stripe']
    if j == 3:
        return M['Paint']
    if j == 4:
        return M['Dark'] if -1.50 < xm < COWL_X else M['Paint']
    if j == 5:
        side_glass = (-1.50 < xm < -0.62) or (-0.52 < xm < COWL_X)
        return M['Glass'] if side_glass else M['Paint']
    if j == 6:
        return M['Paint']
    windscreen = ROOF_FRONT_X < xm < COWL_X
    rear_window = TAIL_X < xm < ROOF_REAR_X
    if windscreen or rear_window:
        return M['Glass']
    return M['Stripe'] if j == 8 else M['Paint']


def build_body(M):
    b = Builder([M['Paint'], M['Stripe'], M['Dark'], M['Glass']])
    bm = b.bm
    crease = bm.edges.layers.float.new('crease_edge')
    rings = []
    for x in STATIONS:
        rings.append([bm.verts.new((x, y, z)) for (y, z) in section(x)])
    K = len(rings[0])
    for i in range(len(STATIONS) - 1):
        xm = (STATIONS[i] + STATIONS[i + 1]) / 2
        for j in range(K - 1):
            f = bm.faces.new((rings[i][j], rings[i][j + 1], rings[i + 1][j + 1], rings[i + 1][j]))
            f.material_index = b.slot(segment_material(j, xm, M))
    # end caps built from horizontal strips down to the centre line
    for ring, front in ((rings[-1], True), (rings[0], False)):
        x = ring[0].co.x
        centre = [ring[0]] + [bm.verts.new((x, 0.0, ring[k].co.z)) for k in range(1, K - 1)] + [ring[K - 1]]
        for k in range(1, K - 1):
            quad = [centre[k], ring[k], ring[k + 1], centre[k + 1]]
            if k == 1:
                quad = [ring[0], ring[1], ring[2], centre[2]]
            if k == K - 2:
                quad = [centre[k], ring[k], ring[k + 1]]
            if not front:
                quad.reverse()
            f = bm.faces.new(quad)
            f.material_index = b.slot(M['Dark'] if k <= 1 else M['Paint'])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    # creases: keep glass edges and the shoulder line crisp after subdivision
    glass = b.slot(M['Glass'])
    for e in bm.edges:
        fs = e.link_faces
        if len(fs) == 2 and fs[0].material_index != fs[1].material_index:
            e[crease] = 1.0 if glass in (fs[0].material_index, fs[1].material_index) else 0.6
    for i in range(len(STATIONS) - 1):
        for j, c in ((4, 0.7), (2, 0.45)):
            e = bm.edges.get((rings[i][j], rings[i + 1][j]))
            if e:
                e[crease] = max(e[crease], c)
    for ring in (rings[0], rings[-1]):
        for k in range(K - 1):
            e = bm.edges.get((ring[k], ring[k + 1]))
            if e:
                e[crease] = max(e[crease], 0.35)
    body = b.finish('Body', recalc=False, smooth_angle=60)

    mod = body.modifiers.new('Mirror', 'MIRROR')
    mod.use_axis = (False, True, False)
    mod.use_clip = True
    mod.use_mirror_merge = True
    mod.merge_threshold = 0.001
    mod = body.modifiers.new('Subdivision', 'SUBSURF')
    mod.levels = 2
    mod.render_levels = 2
    mod.use_creases = True

    # wheel arch cut-outs
    cut = Builder([M['Dark']])
    for sx in (1, -1):
        for sy in (1, -1):
            cut.cylinder(0.415, 0.415, 0.9, loc=(sx * WHEEL_X, sy * 0.92, WHEEL_Z), mat=M['Dark'], segments=40, axis='Y')
    cutter = cut.finish('ArchCutter')
    mod = body.modifiers.new('Arches', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.object = cutter
    mod.solver = 'EXACT'
    mod.material_mode = 'TRANSFER'  # the cut walls become the black wheel wells
    apply_modifiers(body)
    bpy.data.objects.remove(cutter)
    smooth(body, 60)

    # move the glass faces into their own object (hidden in the cockpit view)
    bm = bmesh.new()
    bm.from_mesh(body.data)
    gidx = [m.name for m in body.data.materials].index(M['Glass'].name)
    gfaces = [f for f in bm.faces if f.material_index == gidx]
    gb = Builder([M['Glass']])
    vmap = {}
    for f in gfaces:
        vs = []
        for v in f.verts:
            if v.index not in vmap:
                vmap[v.index] = gb.bm.verts.new(v.co)
            vs.append(vmap[v.index])
        gb.bm.faces.new(vs)
    bmesh.ops.delete(bm, geom=gfaces, context='FACES_ONLY')
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.to_mesh(body.data)
    bm.free()
    glass = gb.finish('Glass', recalc=False, smooth_angle=80)
    return body, glass


def build_arches(M, parent):
    b = Builder([M['Dark']])
    for sx in (1, -1):
        for sy in (1, -1):
            x, y = sx * WHEEL_X, sy * WHEEL_Y
            # lip around the arch edge (the boolean cut already forms the wheel well)
            b.torus(0.425, 0.028, loc=(x, sy * 0.90, WHEEL_Z), mat=M['Dark'], seg=18, segr=6,
                    rot=Matrix.Rotation(math.radians(90), 3, 'X'), arc=(math.radians(-8), math.radians(188)))
    return b.finish('Arches', parent=parent, smooth_angle=50)


def oriented(origin, normal):
    """Matrix placing local XY on the surface with Z along the normal."""
    n = Vector(normal).normalized()
    rot = Vector((0, 0, 1)).rotation_difference(n).to_matrix().to_4x4()
    return Matrix.Translation(origin) @ rot


class Surface:
    """Ray casts against body and glass together."""

    def __init__(self, *objs):
        self.trees = [bvh(o) for o in objs]

    def cast(self, origin, direction):
        best = (None, None, 1e9)
        for t in self.trees:
            loc, nrm, _, dist = t.ray_cast(Vector(origin), Vector(direction).normalized(), 50.0)
            if loc is not None and dist < best[2]:
                best = (loc, nrm, dist)
        return best[0], best[1]


def surface_patch(b, tree, origin, direction, size, mat, offset=0.004, uv=False, shape='rect', up=(0, 0, 1)):
    """Flat patch (rect or ellipse) sitting on the car surface hit by a ray."""
    loc, nrm = tree.cast(origin, direction)
    if loc is None:
        print('miss', origin)
        return None
    n = nrm.normalized()
    upv = Vector(up)
    u = upv.cross(n).normalized()
    v = n.cross(u).normalized()
    c = loc + n * offset
    if shape == 'rect':
        corners = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
        pts = [c + u * (cx * size[0] / 2) + v * (cy * size[1] / 2) for cx, cy in corners]
        uvs = [((cx + 1) / 2, (cy + 1) / 2) for cx, cy in corners] if uv else None
        b.quad(pts, mat, uvs)
    else:
        ring = []
        for k in range(16):
            a = 2 * math.pi * k / 16
            ring.append(b.bm.verts.new(c + u * math.cos(a) * size[0] / 2 + v * math.sin(a) * size[1] / 2))
        f = b.bm.faces.new(ring)
        f.material_index = b.slot(mat)
    return loc, n


def build_details(M, root, body, glass):
    tree = Surface(body, glass)
    # lights, grille and number fields
    lights = Builder([M['Lamp'], M['Grille']])
    for sy in (1, -1):
        surface_patch(lights, tree, (3, sy * 0.56, -0.03), (-1, 0, 0), (0.34, 0.17), M['Grille'], shape='ellipse', offset=0.003)
        surface_patch(lights, tree, (3, sy * 0.56, -0.03), (-1, 0, 0), (0.28, 0.12), M['Lamp'], shape='ellipse', offset=0.006)
    lights.finish('Headlights', parent=root, recalc=False)

    tail = Builder([M['TailLamp']])
    for sy in (1, -1):
        surface_patch(tail, tree, (-3, sy * 0.62, 0.09), (1, 0, 0), (0.26, 0.12), M['TailLamp'])
    tail.finish('Taillights', parent=root, recalc=False)

    grille = Builder([M['Grille']])
    surface_patch(grille, tree, (3, 0, -0.13), (-1, 0, 0), (0.70, 0.13), M['Grille'])
    surface_patch(grille, tree, (3, 0, -0.30), (-1, 0, 0), (0.95, 0.07), M['Grille'])
    grille.finish('Grille', parent=root, recalc=False)

    numbers = Builder([M['Number']])
    for sy in (1, -1):
        surface_patch(numbers, tree, (0.12, sy * 3, -0.02), (0, -sy, 0), (0.40, 0.40), M['Number'], uv=True, offset=0.005,
                      up=(0, 0, 1))
    numbers.finish('Numbers', parent=root, recalc=False)

    # bonnet: rally light pod
    pod = Builder([M['Dark'], M['Lamp']])
    hood, _ = tree.cast((1.86, 0, 2), (0, 0, -1))
    pz = hood.z + 0.075
    pod.box((0.10, 1.12, 0.05), loc=(1.86, 0, pz - 0.035), mat=M['Dark'])
    for y in (-0.42, -0.14, 0.14, 0.42):
        pod.cylinder(0.088, 0.088, 0.08, loc=(1.88, y, pz + 0.04), mat=M['Dark'], segments=18, axis='X')
        pod.cylinder(0.075, 0.075, 0.004, loc=(1.922, y, pz + 0.04), mat=M['Lamp'], segments=18, axis='X')
    pod.finish('LightPod', parent=root, smooth_angle=40)

    # rear wing with end plates and stays
    wing = Builder([M['Accent'], M['Dark']])
    roof_end, _ = tree.cast((-1.70, 0, 2), (0, 0, -1))
    wz = roof_end.z + 0.02
    tilt = Matrix.Rotation(math.radians(-7), 3, 'Y')
    wing.box((0.30, 1.44, 0.032), loc=(-1.97, 0, wz), mat=M['Accent'], rot=tilt)
    wing.box((0.08, 1.42, 0.018), loc=(-2.10, 0, wz + 0.03), mat=M['Accent'], rot=Matrix.Rotation(math.radians(35), 3, 'Y'))
    for sy in (1, -1):
        wing.box((0.34, 0.016, 0.17), loc=(-1.98, sy * 0.73, wz - 0.05), mat=M['Accent'])
        base, _ = tree.cast((-1.90, sy * 0.45, 2), (0, 0, -1))
        wing.tube((-1.90, sy * 0.45, base.z - 0.01), (-1.98, sy * 0.45, wz - 0.01), 0.018, M['Dark'])
    wing.finish('Wing', parent=root, smooth_angle=40)

    # mirrors
    mir = Builder([M['Paint'], M['Dark'], M['Visor']])
    for sy in (1, -1):
        door, _ = tree.cast((0.58, sy * 2, 0.22), (0, -sy, 0))
        mir.box((0.10, 0.05, 0.03), loc=(0.58, door.y + sy * 0.03, 0.22), mat=M['Dark'])
        mir.sphere(0.075, loc=(0.56, door.y + sy * 0.10, 0.25), mat=M['Paint'], subdiv=2, scale=(0.9, 1.35, 0.75))
        mir.box((0.01, 0.15, 0.08), loc=(0.505, door.y + sy * 0.10, 0.25), mat=M['Visor'])
    mir.finish('Mirrors', parent=root, smooth_angle=50)

    # mud flaps behind each wheel
    flaps = Builder([M['Accent']])
    for sx in (1, -1):
        for sy in (1, -1):
            flaps.box((0.012, 0.26, 0.27), loc=(sx * WHEEL_X - 0.46, sy * 0.80, -0.50), mat=M['Accent'])
    flaps.finish('Mudflaps', parent=root)

    # small parts: splitter, diffuser, exhaust, tow hooks, roof vent, aerial
    d = Builder([M['Dark'], M['Metal'], M['Accent']])
    d.box((0.12, 1.46, 0.022), loc=(1.92, 0, -0.41), mat=M['Dark'])
    d.box((0.14, 1.30, 0.06), loc=(-1.96, 0, -0.38), mat=M['Dark'])
    for k in range(5):
        d.box((0.14, 0.012, 0.07), loc=(-1.97, -0.5 + k * 0.25, -0.40), mat=M['Dark'])
    d.cylinder(0.045, 0.045, 0.14, loc=(-2.0, -0.46, -0.37), mat=M['Metal'], segments=14, axis='X')
    d.torus(0.035, 0.010, loc=(2.07, 0.30, -0.30), mat=M['Accent'], seg=12, segr=6, rot=Matrix.Rotation(math.radians(90), 3, 'X'))
    d.torus(0.035, 0.010, loc=(-2.02, 0.32, -0.30), mat=M['Accent'], seg=12, segr=6, rot=Matrix.Rotation(math.radians(90), 3, 'X'))
    roof, _ = tree.cast((-0.35, 0, 2), (0, 0, -1))
    d.box((0.30, 0.26, 0.05), loc=(-0.30, 0, roof.z + 0.02), mat=M['Dark'], rot=Matrix.Rotation(math.radians(-4), 3, 'Y'))
    d.box((0.02, 0.22, 0.05), loc=(-0.15, 0, roof.z + 0.035), mat=M['Dark'])
    d.tube((-0.70, -0.25, roof.z), (-0.85, -0.25, roof.z + 0.40), 0.004, M['Dark'], segments=5)
    d.finish('Details', parent=root, smooth_angle=40)


def prism(b, profile, y0, y1, mat):
    """Extrude an (x, z) outline along y."""
    a = [b.bm.verts.new((x, y0, z)) for x, z in profile]
    c = [b.bm.verts.new((x, y1, z)) for x, z in profile]
    idx = b.slot(mat)
    n = len(profile)
    for k in range(n):
        f = b.bm.faces.new((a[k], a[(k + 1) % n], c[(k + 1) % n], c[k]))
        f.material_index = idx
    for ring in (a, list(reversed(c))):
        f = b.bm.faces.new(ring)
        f.material_index = idx


def build_interior(M, root):
    b = Builder([M['Interior'], M['Display'], M['Metal'], M['Seat'], M['Accent']])
    # dashboard and instrument hood
    prism(b, [(0.80, 0.13), (0.56, 0.155), (0.43, 0.125), (0.39, 0.03), (0.45, -0.09), (0.70, -0.11), (0.80, -0.02)],
          -0.72, 0.72, M['Interior'])
    prism(b, [(0.50, 0.15), (0.43, 0.205), (0.36, 0.19), (0.37, 0.14)], 0.20, 0.52, M['Interior'])
    b.quad([(0.395, 0.24, 0.16), (0.395, 0.48, 0.16), (0.42, 0.48, 0.10), (0.42, 0.24, 0.10)], M['Display'])
    # centre console, gear lever, hydraulic handbrake, fire extinguisher
    b.box((0.45, 0.24, 0.42), loc=(0.32, 0, -0.24), mat=M['Interior'])
    b.tube((0.26, 0.0, -0.03), (0.18, 0.02, 0.20), 0.012, M['Metal'])
    b.sphere(0.03, loc=(0.18, 0.02, 0.215), mat=M['Interior'], subdiv=1)
    b.tube((0.12, 0.14, -0.20), (0.04, 0.15, 0.06), 0.011, M['Metal'])
    b.box((0.035, 0.03, 0.05), loc=(0.035, 0.15, 0.075), mat=M['Accent'])
    b.cylinder(0.05, 0.05, 0.32, loc=(-0.25, 0, -0.38), mat=M['Accent'], segments=12, axis='X')
    # bucket seats
    for sy in (1, -1):
        y = sy * 0.36
        b.box((0.46, 0.44, 0.10), loc=(-0.48, y, -0.34), mat=M['Seat'])
        back = Matrix.Rotation(math.radians(-14), 3, 'Y')
        b.box((0.10, 0.46, 0.78), loc=(-0.74, y, 0.02), mat=M['Seat'], rot=back)
        for side in (1, -1):
            b.box((0.30, 0.06, 0.55), loc=(-0.66, y + side * 0.23, -0.02), mat=M['Seat'], rot=back)
            b.box((0.36, 0.06, 0.10), loc=(-0.46, y + side * 0.23, -0.27), mat=M['Seat'])
        b.box((0.08, 0.30, 0.14), loc=(-0.80, y, 0.40), mat=M['Seat'], rot=back)
    for sy in (1, -1):
        b.box((1.66, 0.014, 0.50), loc=(-0.08, sy * 0.80, -0.14), mat=M['Interior'])
        b.box((0.30, 0.05, 0.04), loc=(0.05, sy * 0.78, 0.0), mat=M['Interior'])
    obj = b.finish('Interior', parent=root, smooth_angle=35)

    # roll cage
    cage = Builder([M['Cage']])
    pts = []
    for sy in (1, -1):
        legs = [(-0.95, sy * 0.64, -0.44), (-0.95, sy * 0.62, 0.55), (-0.95, sy * 0.50, 0.63)]
        front = [(0.70, sy * 0.66, -0.40), (0.62, sy * 0.66, 0.12), (0.05, sy * 0.60, 0.61)]
        pts += [legs, front, [front[2], legs[2]],
                [(0.55, sy * 0.71, -0.36), (-0.88, sy * 0.71, 0.04)],
                [(0.55, sy * 0.71, 0.04), (-0.88, sy * 0.71, -0.36)],
                [(-0.95, sy * 0.55, 0.60), (-1.72, sy * 0.62, -0.30)]]
    pts += [[(-0.95, 0.50, 0.63), (-0.95, -0.50, 0.63)], [(0.05, 0.60, 0.61), (0.05, -0.60, 0.61)],
            [(-0.95, 0.62, 0.55), (-0.95, -0.64, -0.44)]]
    for line in pts:
        for a, c in zip(line, line[1:]):
            cage.tube(a, c, 0.021, M['Cage'])
        for p in line:
            cage.sphere(0.024, loc=p, mat=M['Cage'], subdiv=1)
    cage.finish('Cage', parent=root, smooth_angle=60)

    # steering wheel on a tilted mount; the game turns the wheel around its local X axis
    mount = empty('SteeringMount', loc=(0.12, 0.36, 0.02), parent=root, rot=(0, math.radians(25), 0))
    sw = Builder([M['Interior'], M['Marker'], M['Glove'], M['Metal']])
    ax = Matrix.Rotation(math.radians(90), 3, 'Y')
    sw.torus(0.165, 0.017, mat=M['Interior'], seg=28, segr=8, rot=ax)
    sw.box((0.015, 0.30, 0.028), loc=(0.005, 0, 0.0), mat=M['Interior'])
    sw.box((0.015, 0.032, 0.15), loc=(0.005, 0, -0.08), mat=M['Interior'])
    sw.cylinder(0.05, 0.05, 0.05, loc=(0.02, 0, 0), mat=M['Interior'], segments=14, axis='X')
    sw.box((0.03, 0.03, 0.04), loc=(0.0, 0, 0.165), mat=M['Marker'])
    for side in (1, -1):
        sw.sphere(0.032, loc=(-0.01, side * 0.165, 0.0), mat=M['Glove'], subdiv=2, scale=(0.9, 0.8, 1.35))
    wheel = sw.finish('SteeringWheel', parent=mount, smooth_angle=50)
    col = Builder([M['Interior']])
    col.tube((0.15, 0.36, 0.005), (0.45, 0.36, -0.135), 0.026, M['Interior'])
    col.finish('SteeringColumn', parent=root, smooth_angle=60)
    return obj, wheel


def build_crew(M, root):
    for name, sy in (('DriverFigure', 1), ('CodriverFigure', -1)):
        y = sy * 0.36
        c = Builder([M['Suit'], M['Helmet'], M['Visor'], M['Glove']])
        c.sphere(0.2, loc=(-0.60, y, -0.02), mat=M['Suit'], subdiv=2, scale=(0.75, 1.05, 1.45))
        c.sphere(0.12, loc=(-0.50, y, -0.25), mat=M['Suit'], subdiv=2, scale=(1.9, 1.25, 0.8))
        c.tube((-0.58, y, 0.22), (-0.55, y, 0.28), 0.05, M['Suit'])
        c.sphere(0.135, loc=(-0.52, y, 0.34), mat=M['Helmet'], subdiv=2, scale=(1.08, 0.95, 1.0))
        c.sphere(0.11, loc=(-0.425, y, 0.335), mat=M['Visor'], subdiv=2, scale=(0.55, 0.92, 0.42))
        if sy < 0:
            # co-driver holds the pace-note book
            for side in (1, -1):
                c.sphere(0.04, loc=(-0.20, y + side * 0.12, -0.04), mat=M['Glove'], subdiv=1, scale=(1.0, 0.8, 1.2))
        c.finish(name, parent=root, smooth_angle=60)
    nb = Builder([M['Paper'], M['Dark']])
    tilt = Matrix.Rotation(math.radians(-35), 3, 'Y')
    nb.box((0.21, 0.30, 0.018), loc=(-0.22, -0.36, -0.06), mat=M['Dark'], rot=tilt)
    nb.box((0.20, 0.28, 0.004), loc=(-0.225, -0.36, -0.048), mat=M['Paper'], rot=tilt)
    nb.finish('Notebook', parent=root)


def build_wheel(M):
    b = Builder([M['Tyre'], M['Rim'], M['Brake']])
    # tyre: rounded profile with two tread grooves, revolved around the axle (Y)
    tyre = [(0.236, -0.104), (0.30, -0.118), (0.326, -0.113), (0.340, -0.095), (0.340, -0.050), (0.333, -0.045),
            (0.333, -0.030), (0.340, -0.025), (0.340, 0.025), (0.333, 0.030), (0.333, 0.045), (0.340, 0.050),
            (0.340, 0.095), (0.326, 0.113), (0.30, 0.118), (0.236, 0.104)]
    b.revolve(tyre, 40, M['Tyre'])
    # rim barrel and lip
    b.revolve([(0.236, 0.104), (0.226, 0.090), (0.226, -0.095), (0.236, -0.104)], 40, M['Rim'])
    b.revolve([(0.205, 0.088), (0.226, 0.096), (0.236, 0.104)], 40, M['Rim'])
    # spokes, hub and centre nut
    for k in range(6):
        a = math.radians(60 * k)
        rot = Matrix.Rotation(-a, 3, 'Y')
        for off in (-0.022, 0.022):
            p = rot @ Vector((0.135, 0.084, off * 1.0))
            b.box((0.16, 0.022, 0.026), loc=p, mat=M['Rim'], rot=rot)
    b.cylinder(0.07, 0.065, 0.04, loc=(0, 0.08, 0), mat=M['Rim'], segments=18, axis='Y')
    b.cylinder(0.028, 0.024, 0.03, loc=(0, 0.11, 0), mat=M['Brake'], segments=6, axis='Y')
    # brake disc
    b.cylinder(0.168, 0.168, 0.022, loc=(0, -0.005, 0), mat=M['Brake'], segments=32, axis='Y')
    wheel = b.finish('Wheel', smooth_angle=40)
    cal = Builder([M['Caliper']])
    rot = Matrix.Rotation(math.radians(-50), 3, 'Y')
    cal.box((0.15, 0.06, 0.07), loc=rot @ Vector((0.0, 0.012, 0.155)), mat=M['Caliper'], rot=rot)
    caliper = cal.finish('Caliper', smooth_angle=40)
    return wheel, caliper


def car_materials():
    return {
        'Paint': material('Paint', 0xf2f2f2, rough=0.3, double=True),
        'Stripe': material('Stripe', 0x1f5fbf, rough=0.35, double=True),
        'Accent': material('Accent', 0xe0322b, rough=0.4),
        'Dark': material('Dark', 0x141416, rough=0.7, double=True),
        'Glass': material('Glass', 0x1b2733, rough=0.05, alpha=0.55),
        'Lamp': material('Lamp', 0xfff6d8, rough=0.1, emit=0xfff2c0, emit_strength=1.5),
        'TailLamp': material('TailLamp', 0x9a0a0a, rough=0.2, emit=0x700000, emit_strength=1.0),
        'Grille': material('Grille', 0x0c0c0e, rough=0.8),
        'Number': material('Number', 0xffffff, rough=0.5),
        'Metal': material('Metal', 0x9a9ca0, rough=0.35, metal=0.9),
        'Interior': material('Interior', 0x2a2a2d, rough=0.85),
        'Display': material('Display', 0x0a2a24, rough=0.3, emit=0x10a080, emit_strength=0.6),
        'Seat': material('Seat', 0x1c1c22, rough=0.9),
        'Cage': material('Cage', 0xc8c8cc, rough=0.35, metal=0.6),
        'Marker': material('Marker', 0xffd400, rough=0.5),
        'Glove': material('Glove', 0x181818, rough=0.8),
        'Suit': material('Suit', 0x1f5fbf, rough=0.8),
        'Helmet': material('Helmet', 0xf4f4f4, rough=0.25),
        'Visor': material('Visor', 0x101418, rough=0.05, metal=0.4),
        'Paper': material('Paper', 0xf4f1e6, rough=0.9),
        'Tyre': material('Tyre', 0x1b1b1c, rough=0.92),
        'Rim': material('Rim', 0xe8e8e8, rough=0.3, metal=0.6),
        'Brake': material('Brake', 0x6c6e72, rough=0.45, metal=0.8),
        'Caliper': material('Caliper', 0xe0322b, rough=0.4),
    }


def build():
    M = car_materials()
    root = empty('Car')
    body, glass = build_body(M)
    body.parent = root
    glass.parent = root
    build_arches(M, root)
    build_details(M, root, body, glass)
    build_interior(M, root)
    build_crew(M, root)
    empty('HeadDriver', loc=(-0.40, 0.36, 0.335), parent=root)
    empty('EngineSmoke', loc=(1.55, 0.0, 0.25), parent=root)
    wheel, caliper = build_wheel(M)
    return [root, wheel, caliper]
