"""Start/finish/split gate: aluminium truss arch with a banner.

Local frame: X across the road, -Y is the driving direction (game: +Z), Z up.
The game puts the START/ZIEL/SPLIT text on the material named "Banner".
"""
import math
from lib import material, Builder

HALF_SPAN = 5.4  # road half width + 1.2 m
HEIGHT = 5.4
T = 0.36  # truss width


def truss_column(b, x, M):
    """Square truss column from the ground to the top."""
    corners = [(x - T / 2, -T / 2), (x + T / 2, -T / 2), (x + T / 2, T / 2), (x - T / 2, T / 2)]
    for cx, cy in corners:
        b.tube((cx, cy, 0.0), (cx, cy, HEIGHT), 0.028, M['Truss'], segments=6)
    steps = 11
    for k in range(steps):
        z0, z1 = HEIGHT * k / steps, HEIGHT * (k + 1) / steps
        for i in range(4):
            a, c = corners[i], corners[(i + 1) % 4]
            b.tube((a[0], a[1], z0), (c[0], c[1], z1), 0.014, M['Truss'], segments=5)
    b.box((T + 0.3, T + 0.3, 0.05), loc=(x, 0, 0.025), mat=M['Dark'])


def truss_beam(b, M):
    z0 = HEIGHT
    corners = [(-T / 2, z0 - T / 2), (T / 2, z0 - T / 2), (T / 2, z0 + T / 2), (-T / 2, z0 + T / 2)]
    x0, x1 = -HALF_SPAN - T / 2, HALF_SPAN + T / 2
    for cy, cz in corners:
        b.tube((x0, cy, cz), (x1, cy, cz), 0.028, M['Truss'], segments=6)
    steps = 24
    for k in range(steps):
        xa = x0 + (x1 - x0) * k / steps
        xb = x0 + (x1 - x0) * (k + 1) / steps
        for i in range(4):
            a, c = corners[i], corners[(i + 1) % 4]
            b.tube((xa, a[0], a[1]), (xb, c[0], c[1]), 0.014, M['Truss'], segments=5)


def build():
    M = {
        'Truss': material('Truss', 0xc9ccd2, rough=0.35, metal=0.8),
        'Dark': material('Dark', 0x1a1a1c, rough=0.8),
        'Banner': material('Banner', 0xffffff, rough=0.7),
        'Frame': material('Frame', 0x202024, rough=0.6),
    }
    b = Builder([M['Truss'], M['Dark'], M['Banner'], M['Frame']])
    for x in (-HALF_SPAN, HALF_SPAN):
        truss_column(b, x, M)
    truss_beam(b, M)
    # banner below the beam, one textured face per side so the text reads correctly
    w, z0, z1 = HALF_SPAN - 0.25, HEIGHT - 1.55, HEIGHT - 0.30
    y = 0.03
    b.box((2 * w + 0.08, 0.05, z1 - z0 + 0.08), loc=(0, 0, (z0 + z1) / 2), mat=M['Frame'])
    # seen when approaching (viewer at +Y looking along -Y): text runs towards -X
    b.quad([(w, y, z0), (-w, y, z0), (-w, y, z1), (w, y, z1)], M['Banner'], uvs=[(0, 0), (1, 0), (1, 1), (0, 1)])
    b.quad([(-w, -y, z0), (w, -y, z0), (w, -y, z1), (-w, -y, z1)], M['Banner'], uvs=[(0, 0), (1, 0), (1, 1), (0, 1)])
    return [b.finish('Gate', recalc=False)]
