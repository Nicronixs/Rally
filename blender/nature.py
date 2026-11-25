"""Vegetation and rocks, low-poly because the game draws thousands of them (instanced).

Each object stands on the ground at z = 0. Materials named Needles, Leaves, Bush, Rock and
Cactus get a per-instance colour tint in the game; Bark and Snow keep their colour.
"""
import math
import random
import bmesh
from mathutils import Vector, Matrix
from lib import material, Builder, displace, smooth


def mats():
    return {
        'Bark': material('Bark', 0x5a4030, rough=0.95),
        'Needles': material('Needles', 0xffffff, rough=0.85, double=True),
        'Leaves': material('Leaves', 0xffffff, rough=0.8),
        'Snow': material('Snow', 0xf2f6fb, rough=0.6, double=True),
        'Bush': material('Bush', 0xffffff, rough=0.85),
        'Rock': material('Rock', 0xffffff, rough=0.9),
        'Cactus': material('Cactus', 0xffffff, rough=0.7),
    }


def pine_tier(b, z0, radius, height, mat, rng, snow=None, points=10):
    """One drooping, jagged tier of a conifer. With snow, the upper part is white."""
    apex = b.bm.verts.new((rng.uniform(-0.05, 0.05), rng.uniform(-0.05, 0.05), z0 + height))
    mid, line, base = [], [], []
    for k in range(points):
        a = 2 * math.pi * (k + rng.uniform(-0.15, 0.15)) / points
        r = radius * (1.0 if k % 2 == 0 else 0.72) * rng.uniform(0.92, 1.08)
        droop = 0.12 * radius if k % 2 == 0 else 0.0
        bz, mz = z0 - droop, z0 + height * 0.42
        base.append(b.bm.verts.new((math.cos(a) * r, math.sin(a) * r, bz)))
        mid.append(b.bm.verts.new((math.cos(a) * r * 0.55, math.sin(a) * r * 0.55, mz)))
        # snow line: the visible upper part of each tier is white on snowy trees
        t = 0.62 + rng.uniform(-0.1, 0.1)
        if snow is not None:
            line.append(b.bm.verts.new((math.cos(a) * r * (0.55 + 0.45 * t), math.sin(a) * r * (0.55 + 0.45 * t), mz + (bz - mz) * t)))  # noqa: E501
    top_mat = snow if snow is not None else mat
    for k in range(points):
        k2 = (k + 1) % points
        f = b.bm.faces.new((apex, mid[k], mid[k2]))
        f.material_index = b.slot(top_mat)
        if snow is None:
            f = b.bm.faces.new((mid[k], base[k], base[k2], mid[k2]))
            f.material_index = b.slot(mat)
            continue
        f = b.bm.faces.new((mid[k], line[k], line[k2], mid[k2]))
        f.material_index = b.slot(top_mat)
        f = b.bm.faces.new((line[k], base[k], base[k2], line[k2]))
        f.material_index = b.slot(mat)


def pine(M, name, snow=False, seed=1):
    rng = random.Random(seed)
    b = Builder([M['Bark'], M['Needles']] + ([M['Snow']] if snow else []))
    b.cylinder(0.26, 0.10, 6.6, loc=(0, 0, 3.3), mat=M['Bark'], segments=6, caps=False)
    tiers = [(1.6, 2.0, 2.9), (2.9, 1.6, 2.6), (4.1, 1.15, 2.4), (5.2, 0.72, 2.2)]
    for z0, r, h in tiers:
        pine_tier(b, z0, r, h, M['Needles'], rng, snow=M['Snow'] if snow else None)
    return b.finish(name)


def blob(M, b, centre, radius, mat, rng, squash=1.0):
    b.sphere(radius, loc=centre, mat=mat, subdiv=1, scale=(rng.uniform(0.9, 1.1), rng.uniform(0.9, 1.1), squash))


def broadleaf(M, seed=3):
    rng = random.Random(seed)
    b = Builder([M['Bark'], M['Leaves']])
    b.cylinder(0.24, 0.14, 3.4, loc=(0, 0, 1.7), mat=M['Bark'], segments=7, caps=False)
    b.tube((0, 0, 2.6), (0.9, 0.3, 3.8), 0.08, M['Bark'], segments=5)
    b.tube((0, 0, 2.9), (-0.7, -0.5, 4.1), 0.07, M['Bark'], segments=5)
    for c, r in (((0, 0, 4.6), 1.9), ((0.95, 0.35, 4.0), 1.3), ((-0.8, -0.5, 4.2), 1.35), ((0.1, -0.2, 5.6), 1.2)):
        blob(M, b, c, r, M['Leaves'], rng, squash=0.85)
    obj = b.finish('Broadleaf')
    return obj


def bush(M, seed=5):
    rng = random.Random(seed)
    b = Builder([M['Bush']])
    for c, r in (((0, 0, 0.45), 0.85), ((0.55, 0.2, 0.35), 0.6), ((-0.45, -0.3, 0.32), 0.55)):
        blob(M, b, c, r, M['Bush'], rng, squash=0.7)
    return b.finish('Bush')


def rock(M):
    b = Builder([M['Rock']])
    b.sphere(1.0, mat=M['Rock'], subdiv=2, scale=(1.3, 1.0, 0.72))
    obj = b.finish('Rock')
    displace(obj, 0.45, 0.6, seed=2)
    # sink it a little into the ground and keep the faceted look
    for v in obj.data.vertices:
        v.co.z += 0.35
        if v.co.z < 0:
            v.co.z *= 0.3
    obj.data.shade_flat()
    return obj


def cactus(M):
    b = Builder([M['Cactus']])
    b.cylinder(0.24, 0.20, 3.0, loc=(0, 0, 1.5), mat=M['Cactus'], segments=8)
    b.sphere(0.20, loc=(0, 0, 3.0), mat=M['Cactus'], subdiv=1)
    for sx, z0, h in ((1, 1.1, 1.0), (-1, 1.6, 0.8)):
        b.tube((0, 0, z0), (sx * 0.55, 0, z0), 0.13, M['Cactus'], segments=7)
        b.cylinder(0.14, 0.12, h, loc=(sx * 0.55, 0, z0 + h / 2), mat=M['Cactus'], segments=7)
        b.sphere(0.12, loc=(sx * 0.55, 0, z0 + h), mat=M['Cactus'], subdiv=1)
    obj = b.finish('Cactus', smooth_angle=50)
    return obj


def build():
    M = mats()
    objs = [pine(M, 'Pine'), pine(M, 'PineSnow', snow=True, seed=2), broadleaf(M), bush(M), rock(M), cactus(M)]
    for o in objs:
        if o.name in ('Broadleaf', 'Bush'):
            smooth(o, 35)
    return objs
