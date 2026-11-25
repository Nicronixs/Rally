"""Helpers for building the game models with Blender's Python API (bpy/bmesh).

Coordinate convention in Blender: +X forward, +Y left, +Z up.
The glTF exporter converts to the game's Y-up frame (+X forward, +Y up, +Z right).
"""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

_MATS = {}


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _MATS.clear()


def _lin(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgb(hexcolor):
    """sRGB hex -> linear RGB tuple (Blender stores linear colours)."""
    return (_lin((hexcolor >> 16) & 255), _lin((hexcolor >> 8) & 255), _lin(hexcolor & 255))


def material(name, color=0xffffff, rough=0.6, metal=0.0, emit=None, emit_strength=1.0,
             alpha=1.0, double=False):
    """Principled material; the game looks materials up by name."""
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*rgb(color), 1.0)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if emit is not None:
        p.inputs['Emission Color'].default_value = (*rgb(emit), 1.0)
        p.inputs['Emission Strength'].default_value = emit_strength
    if alpha < 1.0:
        p.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
    m.use_backface_culling = not double
    m.diffuse_color = (*rgb(color), alpha)
    _MATS[name] = m
    return m


class Builder:
    """Collects geometry in one bmesh with several material slots."""

    def __init__(self, mats):
        self.bm = bmesh.new()
        self.mats = list(mats)
        self.uv = self.bm.loops.layers.uv.new('UVMap')

    def slot(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def _assign(self, verts, mat):
        idx = self.slot(mat)
        faces = set()
        for v in verts:
            faces.update(v.link_faces)
        for f in faces:
            f.material_index = idx
        return faces

    def box(self, size, loc=(0, 0, 0), mat=None, rot=None):
        m = Matrix.Translation(loc)
        if rot is not None:
            m = m @ rot.to_4x4()
        m = m @ Matrix.Diagonal((size[0], size[1], size[2], 1.0))
        res = bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)
        return self._assign(res['verts'], mat)

    def cylinder(self, r1, r2, depth, loc=(0, 0, 0), mat=None, segments=12, axis='Z', rot=None, caps=True):
        m = Matrix.Translation(loc)
        if rot is not None:
            m = m @ rot.to_4x4()
        if axis == 'X':
            m = m @ Matrix.Rotation(math.radians(90), 4, 'Y')
        elif axis == 'Y':
            m = m @ Matrix.Rotation(math.radians(-90), 4, 'X')
        res = bmesh.ops.create_cone(self.bm, cap_ends=caps, cap_tris=False, segments=segments,
                                    radius1=r1, radius2=r2, depth=depth, matrix=m)
        return self._assign(res['verts'], mat)

    def tube(self, a, b, r, mat, segments=8):
        """Cylinder from point a to point b."""
        a, b = Vector(a), Vector(b)
        d = b - a
        rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix()
        m = Matrix.Translation((a + b) / 2) @ rot.to_4x4()
        res = bmesh.ops.create_cone(self.bm, cap_ends=False, cap_tris=False, segments=segments,
                                    radius1=r, radius2=r, depth=d.length, matrix=m)
        return self._assign(res['verts'], mat)

    def sphere(self, radius, loc=(0, 0, 0), mat=None, subdiv=2, scale=(1, 1, 1)):
        m = Matrix.Translation(loc) @ Matrix.Diagonal((*scale, 1.0))
        res = bmesh.ops.create_icosphere(self.bm, subdivisions=subdiv, radius=radius, matrix=m)
        return self._assign(res['verts'], mat)

    def torus(self, R, r, loc=(0, 0, 0), mat=None, seg=20, segr=8, rot=None, arc=(0.0, 2 * math.pi)):
        """Torus around local Z; arc limits it to a partial ring."""
        m = Matrix.Translation(loc)
        if rot is not None:
            m = m @ rot.to_4x4()
        full = abs(arc[1] - arc[0] - 2 * math.pi) < 1e-6
        n = seg if full else seg + 1
        rings = []
        for i in range(n):
            a = arc[0] + (arc[1] - arc[0]) * i / seg
            ring = []
            for j in range(segr):
                b = 2 * math.pi * j / segr
                p = Vector(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
                ring.append(self.bm.verts.new(m @ p))
            rings.append(ring)
        idx = self.slot(mat)
        faces = []
        for i in range(seg):
            r0, r1 = rings[i], rings[(i + 1) % n]
            for j in range(segr):
                f = self.bm.faces.new((r0[j], r1[j], r1[(j + 1) % segr], r0[(j + 1) % segr]))
                f.material_index = idx
                faces.append(f)
        return faces

    def quad(self, pts, mat, uvs=None):
        vs = [self.bm.verts.new(Vector(p)) for p in pts]
        f = self.bm.faces.new(vs)
        f.material_index = self.slot(mat)
        if uvs:
            for loop, uv in zip(f.loops, uvs):
                loop[self.uv].uv = uv
        return f

    def revolve(self, profile, segments, mat, axis='Y', loc=(0, 0, 0), close=True):
        """Revolve (radius, axial) profile points around an axis (Y by default)."""
        rings = []
        for i in range(segments):
            a = 2 * math.pi * i / segments
            ring = []
            for (r, ax) in profile:
                if axis == 'Y':
                    p = Vector((r * math.cos(a), ax, r * math.sin(a)))
                else:
                    p = Vector((r * math.cos(a), r * math.sin(a), ax))
                ring.append(self.bm.verts.new(Vector(loc) + p))
            rings.append(ring)
        idx = self.slot(mat)
        faces = []
        for i in range(segments):
            r0, r1 = rings[i], rings[(i + 1) % segments]
            for j in range(len(profile) - 1):
                f = self.bm.faces.new((r0[j], r0[j + 1], r1[j + 1], r1[j]))
                f.material_index = idx
                faces.append(f)
        return faces

    def finish(self, name, parent=None, smooth_angle=None, recalc=True):
        if recalc:
            bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        obj = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(obj)
        if parent is not None:
            obj.parent = parent
        if smooth_angle is None:
            me.shade_flat()
        else:
            me.shade_smooth()
            me.set_sharp_from_angle(angle=math.radians(smooth_angle))
        return obj


def empty(name, loc=(0, 0, 0), parent=None, rot=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    e.location = loc
    e.rotation_euler = rot
    bpy.context.scene.collection.objects.link(e)
    if parent is not None:
        e.parent = parent
    return e


def apply_modifiers(obj):
    """Bake all modifiers into the mesh (like 'Apply' in the UI)."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    obj.modifiers.clear()
    obj.data = me
    return obj


def bvh(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    return BVHTree.FromObject(obj, dg)


def ray(tree, origin, direction):
    loc, normal, _, _ = tree.ray_cast(Vector(origin), Vector(direction).normalized(), 50.0)
    return loc, normal


def smooth(obj, angle):
    obj.data.shade_smooth()
    obj.data.set_sharp_from_angle(angle=math.radians(angle))


def displace(obj, strength, scale, seed=0):
    """Noise displacement along normals, baked."""
    tex = bpy.data.textures.new(f'{obj.name}_noise', type='CLOUDS')
    tex.noise_scale = scale
    tex.noise_depth = 1
    mod = obj.modifiers.new('Displace', 'DISPLACE')
    mod.texture = tex
    mod.strength = strength
    mod.mid_level = 0.5
    mod.texture_coords = 'GLOBAL'
    obj.location = (seed * 7.31, seed * 3.17, 0)  # moving the object shifts the noise pattern
    apply_modifiers(obj)
    obj.location = (0, 0, 0)
    return obj


def all_children(obj):
    out = [obj]
    for c in obj.children:
        out += all_children(c)
    return out


def export_glb(roots, path):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for r in roots:
        for o in all_children(r):
            o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_apply=True,
        export_yup=True, export_cameras=False, export_lights=False, export_extras=False,
        export_materials='EXPORT')
    print('exported', path)
