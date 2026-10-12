"""Seamless cloud strip for the Chiikawa theme: public/chiikawa/clouds.svg (1600 x 240).
Clouds never touch the left/right edge, so the strip tiles with no seam while it drifts right -> left."""
import os

W, H = 1600, 240
# x, y, scale, opacity   (cloud art is 240 x 110 at scale 1)
CLOUDS = [
    (150, 14, 1.15, .96), (470, 92, .62, .80), (640, 8, .95, .94), (905, 120, .70, .78),
    (1040, 30, 1.25, .97), (1330, 100, .58, .76), (1370, 10, .80, .90), (320, 150, .50, .65),
    (760, 168, .55, .62), (1180, 168, .48, .60),
]


def cloud(x, y, sc, op):
    parts = ('<ellipse cx="120" cy="77" rx="110" ry="33"/><circle cx="72" cy="55" r="33"/>'
             '<circle cx="125" cy="42" r="42"/><circle cx="173" cy="57" r="31"/>')
    shade = f'<g fill="#cfe3f5" transform="translate(0 6)">{parts}</g>'
    return f'<g transform="translate({x} {y}) scale({sc})" opacity="{op}">{shade}<g fill="#fff">{parts}</g></g>'


svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">' + ''.join(cloud(*c) for c in CLOUDS) + '</svg>'
out = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'chiikawa', 'clouds.svg')
open(out, 'w').write(svg)
print('wrote', os.path.normpath(out), len(svg), 'bytes')
