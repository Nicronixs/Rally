"""Builds the game models and exports them to public/models/*.glb.

    blender --background --factory-startup --python blender/build.py -- [car] [nature] [gate] [--preview]

With --preview, PNG renders are written to blender/previews/ for a quick visual check.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lib  # noqa: E402
import car  # noqa: E402
import nature  # noqa: E402
import gate  # noqa: E402

ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'public', 'models')
PREVIEW = os.path.join(HERE, 'previews')
MODULES = {'car': car, 'nature': nature, 'gate': gate}


def setup_render(width=1200, height=720):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = width, height
    world = bpy.data.worlds.new('World')
    sc.world = world
    bg = world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (*lib.rgb(0xb8cde0), 1)
    bg.inputs['Strength'].default_value = 0.9
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sun.data.energy = 3.5
    sun.data.angle = math.radians(4)
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(35))
    sc.collection.objects.link(sun)
    me = bpy.data.meshes.new('Ground')
    s = 60
    me.from_pydata([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [], [(0, 1, 2, 3)])
    me.materials.append(lib.material('PreviewGround', 0x8a8478, rough=0.9))
    ground = bpy.data.objects.new('Ground', me)
    sc.collection.objects.link(ground)
    return ground


def shoot(path, loc, target, fov=40, hide=()):
    sc = bpy.context.scene
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    sc.collection.objects.link(cam)
    cam.location = loc
    d = Vector(target) - Vector(loc)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    cam.data.sensor_fit = 'VERTICAL'
    cam.data.angle = math.radians(fov)
    cam.data.clip_start = 0.02
    sc.camera = cam
    hidden = [o for o in bpy.data.objects if o.name in hide]
    for o in hidden:
        o.hide_render = True
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    for o in hidden:
        o.hide_render = False
    bpy.data.objects.remove(cam)


def preview(name, roots):
    os.makedirs(PREVIEW, exist_ok=True)
    p = lambda n: os.path.join(PREVIEW, f'{name}_{n}.png')  # noqa: E731
    if name == 'car':
        ground = setup_render()
        ground.location.z = -0.76
        wheel, caliper = roots[1], roots[2]
        # place wheel copies where the physics puts them
        for sx in (1, -1):
            for sy in (1, -1):
                for src in (wheel, caliper):
                    o = src.copy()
                    bpy.context.scene.collection.objects.link(o)
                    o.location = (sx * car.WHEEL_X, sy * car.WHEEL_Y, car.WHEEL_Z)
                    if sy < 0:
                        o.scale.y = -1
        wheel.location = caliper.location = (0, 0, -20)
        shoot(p('front'), (5.2, 3.6, 1.2), (0, 0, -0.1), fov=32)
        shoot(p('rear'), (-5.0, -3.8, 1.5), (0, 0, -0.1), fov=32)
        shoot(p('side'), (0.0, 7.0, 0.1), (0, 0, -0.15), fov=30)
        shoot(p('top'), (0.01, 0.0, 9.0), (0, 0, 0), fov=30)
        shoot(p('cockpit'), (-0.40, 0.36, 0.335), (3.0, 0.36, 0.06), fov=72, hide=('Glass', 'DriverFigure'))
        shoot(p('codriver'), (-0.40, -0.36, 0.335), (3.0, -0.36, 0.06), fov=72, hide=('Glass', 'CodriverFigure'))
        shoot(p('wheel'), (car.WHEEL_X + 0.3, 2.4, -0.30), (car.WHEEL_X, 0.80, -0.42), fov=24)
    elif name == 'nature':
        setup_render()
        for k, o in enumerate(roots):
            o.location.x = (k - (len(roots) - 1) / 2) * 5.5
        # give the tinted materials their typical colours for the preview
        tints = {'Needles': 0x2f5a2a, 'Leaves': 0x4f7d2e, 'Bush': 0x6b7a3a, 'Rock': 0x7d756a, 'Cactus': 0x4e7a3c}
        for n, c in tints.items():
            mt = bpy.data.materials[n]
            mt.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*lib.rgb(c), 1)
        shoot(p('lineup'), (0, -30, 6), (0, 0, 2.8), fov=32)
    elif name == 'gate':
        setup_render()
        shoot(p('front'), (4, 16, 3), (0, 0, 3.2), fov=40)


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    names = [a for a in args if not a.startswith('--')] or list(MODULES)
    os.makedirs(OUT, exist_ok=True)
    for name in names:
        lib.reset_scene()
        roots = MODULES[name].build()
        lib.export_glb(roots, os.path.join(OUT, f'{name}.glb'))
        if '--preview' in args:
            preview(name, roots)


main()
