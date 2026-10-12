"""Generates the original kawaii artwork used by the CHIIKAWA secret theme.
Everything is drawn here as plain SVG: no internet images, no licensed artwork."""
import os, math

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'chiikawa'))
os.makedirs(OUT, exist_ok=True)

INK = '#3d3656'      # soft navy outline
BLUSH = '#ffb1c4'
W = 4                # outline width


def svg(w, h, body, vb=None):
    vb = vb or f'0 0 {w} {h}'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{w}" height="{h}">{body}</svg>'


def save(name, s):
    with open(os.path.join(OUT, name), 'w') as f:
        f.write(s)


# ----------------------------------------------------------------- mascots
def face(cx, cy, kind='smile', gap=44):
    ex1, ex2 = cx - gap / 2, cx + gap / 2
    if kind == 'happy':
        eyes = (f'<path d="M{ex1-7} {cy+2} q7 -9 14 0" fill="none" stroke="{INK}" stroke-width="3.6" stroke-linecap="round"/>'
                f'<path d="M{ex2-7} {cy+2} q7 -9 14 0" fill="none" stroke="{INK}" stroke-width="3.6" stroke-linecap="round"/>')
    else:
        eyes = ''.join(f'<ellipse cx="{x}" cy="{cy}" rx="4.6" ry="5.4" fill="{INK}"/><circle cx="{x+1.5}" cy="{cy-2}" r="1.6" fill="#fff"/>' for x in (ex1, ex2))
    blush = ''.join(f'<ellipse cx="{x}" cy="{cy+13}" rx="9.5" ry="6" fill="{BLUSH}" opacity=".85"/>' for x in (ex1 - 9, ex2 + 9))
    if kind == 'open':
        mouth = f'<path d="M{cx-7} {cy+9} q7 14 14 0 z" fill="#ff8aa5" stroke="{INK}" stroke-width="3" stroke-linejoin="round"/>'
    else:
        mouth = f'<path d="M{cx-7} {cy+11} q3.5 5 7 0 q3.5 5 7 0" fill="none" stroke="{INK}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>'
    return eyes + blush + mouth


def mascot(kind='mochi', expr='smile', cap=False, bow=False, box=False, wave=False, size=200):
    body_fill = {'mochi': '#ffffff', 'bun': '#fff1cf', 'kiki': '#ffffff'}[kind]
    s = ''
    # ears (behind body)
    if kind == 'mochi':
        s += f'<ellipse cx="62" cy="62" rx="15" ry="17" transform="rotate(-18 62 62)" fill="{body_fill}" stroke="{INK}" stroke-width="{W}"/>'
        s += f'<ellipse cx="138" cy="62" rx="15" ry="17" transform="rotate(18 138 62)" fill="{body_fill}" stroke="{INK}" stroke-width="{W}"/>'
        s += '<ellipse cx="62" cy="63" rx="6" ry="8" transform="rotate(-18 62 63)" fill="#ffd3df"/><ellipse cx="138" cy="63" rx="6" ry="8" transform="rotate(18 138 63)" fill="#ffd3df"/>'
    elif kind == 'bun':
        s += f'<path d="M66 70 C44 20 62 -2 76 16 C86 30 86 52 86 70 Z" transform="rotate(-8 76 50)" fill="{body_fill}" stroke="{INK}" stroke-width="{W}" stroke-linejoin="round"/>'
        s += f'<path d="M134 70 C156 20 138 -2 124 16 C114 30 114 52 114 70 Z" transform="rotate(8 124 50)" fill="{body_fill}" stroke="{INK}" stroke-width="{W}" stroke-linejoin="round"/>'
        s += '<path d="M69 58 C60 34 66 24 72 30 C77 36 78 48 78 58 Z" transform="rotate(-8 76 50)" fill="#ffc9d6"/><path d="M131 58 C140 34 134 24 128 30 C123 36 122 48 122 58 Z" transform="rotate(8 124 50)" fill="#ffc9d6"/>'
    else:  # kiki: cat
        s += f'<path d="M46 80 L50 38 Q52 32 58 36 L86 56 Z" fill="{body_fill}" stroke="{INK}" stroke-width="{W}" stroke-linejoin="round"/>'
        s += f'<path d="M154 80 L150 38 Q148 32 142 36 L114 56 Z" fill="{body_fill}" stroke="{INK}" stroke-width="{W}" stroke-linejoin="round"/>'
        s += '<path d="M56 62 L57 46 L73 58 Z" fill="#ffd3df"/><path d="M144 62 L143 46 L127 58 Z" fill="#ffd3df"/>'
    # feet
    s += f'<ellipse cx="74" cy="168" rx="17" ry="10" fill="{body_fill}" stroke="{INK}" stroke-width="{W}"/><ellipse cx="126" cy="168" rx="17" ry="10" fill="{body_fill}" stroke="{INK}" stroke-width="{W}"/>'
    # tail for kiki / bun
    if kind == 'bun':
        s += f'<circle cx="164" cy="150" r="11" fill="#fff" stroke="{INK}" stroke-width="{W}"/>'
    if kind == 'kiki':
        s += f'<path d="M160 150 q26 -4 20 -30" fill="none" stroke="{INK}" stroke-width="12" stroke-linecap="round"/><path d="M160 150 q26 -4 20 -30" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>'
    # body
    s += f'<path d="M100 56 C150 56 168 92 166 124 C164 156 138 174 100 174 C62 174 36 156 34 124 C32 92 50 56 100 56 Z" fill="{body_fill}" stroke="{INK}" stroke-width="{W}" stroke-linejoin="round"/>'
    # arms
    if wave:
        s += f'<ellipse cx="38" cy="108" rx="10" ry="15" transform="rotate(35 38 108)" fill="{body_fill}" stroke="{INK}" stroke-width="{W}"/>'
    else:
        s += f'<ellipse cx="38" cy="134" rx="10" ry="14" transform="rotate(14 38 134)" fill="{body_fill}" stroke="{INK}" stroke-width="{W}"/>'
    s += f'<ellipse cx="162" cy="134" rx="10" ry="14" transform="rotate(-14 162 134)" fill="{body_fill}" stroke="{INK}" stroke-width="{W}"/>'
    s += face(100, 112, expr)
    if kind == 'kiki':
        s += f'<path d="M132 70 q8 -6 14 2 q-4 8 -12 6 z" fill="#8fbaf0" stroke="{INK}" stroke-width="3" stroke-linejoin="round"/><path d="M132 70 q-10 -4 -14 4 q4 8 14 4 z" fill="#8fbaf0" stroke="{INK}" stroke-width="3" stroke-linejoin="round"/><circle cx="133" cy="73" r="3.4" fill="#6a9be0" stroke="{INK}" stroke-width="2.4"/>'
    if bow and kind != 'kiki':
        s += f'<path d="M134 70 q8 -6 14 2 q-4 8 -12 6 z" fill="#ffb3c8" stroke="{INK}" stroke-width="3" stroke-linejoin="round"/><path d="M134 70 q-10 -4 -14 4 q4 8 14 4 z" fill="#ffb3c8" stroke="{INK}" stroke-width="3" stroke-linejoin="round"/><circle cx="135" cy="73" r="3.4" fill="#ff8aa8" stroke="{INK}" stroke-width="2.4"/>'
    if cap:
        s += (f'<path d="M58 66 C58 40 80 30 100 30 C120 30 142 40 142 66 Z" fill="#7aa8e6" stroke="{INK}" stroke-width="{W}" stroke-linejoin="round"/>'
              f'<path d="M104 60 C122 60 150 60 154 70 C140 74 118 70 104 66 Z" fill="#6c98d8" stroke="{INK}" stroke-width="{W}" stroke-linejoin="round"/>'
              f'<circle cx="100" cy="46" r="9" fill="#fff" stroke="{INK}" stroke-width="3"/><path d="M96 46 l4 -4 l4 4 l-4 4 z" fill="#7aa8e6"/>')
    if box:
        s += (f'<rect x="64" y="132" width="72" height="46" rx="7" fill="#e9c79a" stroke="{INK}" stroke-width="{W}" stroke-linejoin="round"/>'
              f'<rect x="92" y="132" width="16" height="46" fill="#f6dfb8" stroke="{INK}" stroke-width="3"/>'
              f'<ellipse cx="62" cy="150" rx="10" ry="13" fill="{body_fill}" stroke="{INK}" stroke-width="{W}"/><ellipse cx="138" cy="150" rx="10" ry="13" fill="{body_fill}" stroke="{INK}" stroke-width="{W}"/>')
    pad = 8
    return svg(size, size, s, f'{-pad} -6 {200+2*pad} {196+pad}')


for k in ('mochi', 'bun', 'kiki'):
    save(f'{k}.svg', mascot(k))
    save(f'{k}-happy.svg', mascot(k, 'happy', wave=True))
    save(f'{k}-open.svg', mascot(k, 'open'))
save('mochi-cap.svg', mascot('mochi', 'smile', cap=True))
save('mochi-box.svg', mascot('mochi', 'happy', box=True))


def trio():
    # three mascots peeking up from the bottom edge (cut at the bottom by the viewBox)
    def inner(kind, expr, x, y, sc):
        m = mascot(kind, expr)
        body = m[m.index('>') + 1:-6]
        return f'<g transform="translate({x} {y}) scale({sc})">{body}</g>'
    s = inner('mochi', 'smile', 0, 12, .72) + inner('bun', 'happy', 98, 0, .78) + inner('kiki', 'smile', 196, 12, .72)
    return svg(340, 120, s, '0 0 340 120')


save('trio.svg', trio())


# ----------------------------------------------------------------- food / drink icons
def f_face(cx, cy, k=1.0):
    return (f'<ellipse cx="{cx-14*k}" cy="{cy}" rx="3.6" ry="4.2" fill="{INK}"/><ellipse cx="{cx+14*k}" cy="{cy}" rx="3.6" ry="4.2" fill="{INK}"/>'
            f'<ellipse cx="{cx-24*k}" cy="{cy+8*k}" rx="6.5" ry="4.2" fill="{BLUSH}" opacity=".9"/><ellipse cx="{cx+24*k}" cy="{cy+8*k}" rx="6.5" ry="4.2" fill="{BLUSH}" opacity=".9"/>'
            f'<path d="M{cx-5*k} {cy+7*k} q2.5 4 5 0 q2.5 4 5 0" fill="none" stroke="{INK}" stroke-width="2.8" stroke-linecap="round"/>')


def onigiri():
    s = f'<path d="M60 14 C74 14 106 70 104 98 C103 112 90 116 60 116 C30 116 17 112 16 98 C14 70 46 14 60 14 Z" fill="#fff" stroke="{INK}" stroke-width="{W}" stroke-linejoin="round"/>'
    s += f'<path d="M36 88 L84 88 L90 116 L30 116 Z" fill="#3b4a46" stroke="{INK}" stroke-width="{W}" stroke-linejoin="round"/>'
    s += f_face(60, 66)
    s += '<path d="M44 40 q-4 8 0 14" fill="none" stroke="#e8e4f0" stroke-width="3" stroke-linecap="round"/>'
    return svg(120, 124, s)


def boba():
    s = f'<path d="M72 6 L64 40" stroke="{INK}" stroke-width="8" stroke-linecap="round"/><path d="M72 6 L64 40" stroke="#ff9db8" stroke-width="3.4" stroke-linecap="round"/>'
    s += f'<path d="M24 34 L96 34 L88 112 Q87 120 78 120 L42 120 Q33 120 32 112 Z" fill="#f4dcc6" stroke="{INK}" stroke-width="{W}" stroke-linejoin="round"/>'
    s += f'<path d="M27 52 L93 52 L88 112 Q87 120 78 120 L42 120 Q33 120 32 112 Z" fill="#e4b98f"/>'
    s += f'<rect x="18" y="24" width="84" height="14" rx="7" fill="#ffd2df" stroke="{INK}" stroke-width="{W}"/>'
    s += ''.join(f'<circle cx="{x}" cy="{y}" r="5.6" fill="#5b4036" stroke="{INK}" stroke-width="2"/>' for x, y in ((42, 108), (56, 110), (70, 108), (49, 100), (63, 100), (77, 101)))
    s += f_face(60, 74, .95)
    s += f'<path d="M34 34 a26 18 0 0 1 52 0" fill="#fff" stroke="{INK}" stroke-width="3.4"/>'
    return svg(120, 128, s)


def burger():
    s = f'<path d="M14 54 C14 22 34 10 60 10 C86 10 106 22 106 54 Z" fill="#f3b25f" stroke="{INK}" stroke-width="{W}" stroke-linejoin="round"/>'
    s += ''.join(f'<ellipse cx="{x}" cy="{y}" rx="4" ry="2.4" fill="#fff4d6"/>' for x, y in ((38, 26), (60, 20), (82, 26), (50, 38), (72, 38)))
    s += f'<path d="M10 58 q10 10 20 0 q10 10 20 0 q10 10 20 0 q10 10 20 0 q10 10 20 0 L110 66 L10 66 Z" fill="#8ed081" stroke="{INK}" stroke-width="{W}" stroke-linejoin="round"/>'
    s += f'<rect x="12" y="68" width="96" height="14" rx="7" fill="#9b5b43" stroke="{INK}" stroke-width="{W}"/>'
    s += f'<path d="M14 84 C14 104 28 112 60 112 C92 112 106 104 106 84 Z" fill="#f3b25f" stroke="{INK}" stroke-width="{W}" stroke-linejoin="round"/>'
    s += f_face(60, 40, .9)
    return svg(120, 124, s)


def latte():
    s = f'<path d="M34 6 q-8 10 0 20 M56 2 q-8 10 0 20 M78 6 q-8 10 0 20" fill="none" stroke="#d6cfe6" stroke-width="4" stroke-linecap="round"/>'
    s += f'<path d="M96 52 Q124 50 122 74 Q120 96 94 94" fill="none" stroke="{INK}" stroke-width="{W+6}" stroke-linecap="round"/><path d="M96 52 Q124 50 122 74 Q120 96 94 94" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>'
    s += f'<path d="M14 40 L100 40 L96 100 Q94 118 74 118 L40 118 Q20 118 18 100 Z" fill="#fff" stroke="{INK}" stroke-width="{W}" stroke-linejoin="round"/>'
    s += f'<ellipse cx="57" cy="42" rx="42" ry="9" fill="#c98c62" stroke="{INK}" stroke-width="{W}"/><path d="M40 42 q17 -8 34 0 q-17 6 -34 0z" fill="#f2dcc4"/>'
    s += f_face(57, 76, .95)
    return svg(130, 128, s)


def cake():
    s = f'<path d="M12 50 L108 50 L108 100 Q108 112 96 112 L24 112 Q12 112 12 100 Z" fill="#ffe4ec" stroke="{INK}" stroke-width="{W}" stroke-linejoin="round"/>'
    s += f'<path d="M12 68 L108 68" stroke="{INK}" stroke-width="3"/><path d="M12 50 C14 30 46 24 60 24 C80 24 106 30 108 50 Z" fill="#fff" stroke="{INK}" stroke-width="{W}" stroke-linejoin="round"/>'
    s += f'<circle cx="60" cy="22" r="10" fill="#ff7f9f" stroke="{INK}" stroke-width="3.4"/><path d="M60 12 q3 -8 9 -8" fill="none" stroke="#5fb36b" stroke-width="3.4" stroke-linecap="round"/>'
    s += f_face(60, 86, .9)
    return svg(120, 120, s)


def icecream():
    s = f'<path d="M30 62 L60 124 L90 62 Z" fill="#f0c486" stroke="{INK}" stroke-width="{W}" stroke-linejoin="round"/><path d="M42 70 L72 100 M60 62 L74 92 M44 96 L62 80" stroke="#d9a864" stroke-width="3" stroke-linecap="round"/>'
    s += f'<path d="M22 66 C14 36 36 10 60 10 C84 10 106 36 98 66 Z" fill="#ffd0e0" stroke="{INK}" stroke-width="{W}" stroke-linejoin="round"/>'
    s += f'<path d="M20 64 q10 12 20 0 q10 12 20 0 q10 12 20 0 q10 12 20 0" fill="#ffd0e0" stroke="{INK}" stroke-width="{W}" stroke-linejoin="round"/>'
    s += f_face(60, 42, .95)
    return svg(120, 130, s)


for n, fn in (('onigiri', onigiri), ('boba', boba), ('burger', burger), ('latte', latte), ('cake', cake), ('icecream', icecream)):
    save(f'{n}.svg', fn())


# ----------------------------------------------------------------- decorations
def cloud(w=240, h=110, fill='#fff', op=1):
    s = f'<g fill="{fill}" opacity="{op}"><ellipse cx="{w*.5}" cy="{h*.7}" rx="{w*.46}" ry="{h*.3}"/><circle cx="{w*.3}" cy="{h*.5}" r="{h*.3}"/><circle cx="{w*.52}" cy="{h*.38}" r="{h*.38}"/><circle cx="{w*.72}" cy="{h*.52}" r="{h*.28}"/></g>'
    return svg(w, h, s)


save('cloud.svg', cloud())


def flower(c='#ff9fbe', cx=0, cy=0, r=1.0):
    petals = ''.join(f'<ellipse cx="{cx}" cy="{cy-7*r}" rx="{4.4*r}" ry="{6*r}" fill="{c}" transform="rotate({a} {cx} {cy})"/>' for a in (0, 72, 144, 216, 288))
    return f'<g>{petals}<circle cx="{cx}" cy="{cy}" r="{3.6*r}" fill="#ffe27a"/></g>'


def sky(w=1200, h=520):
    s = f'<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8dcf6"/><stop offset=".62" stop-color="#d9ecf9"/><stop offset="1" stop-color="#fffaf0" stop-opacity="1"/></linearGradient></defs>'
    s += f'<rect width="{w}" height="{h}" fill="url(#g)"/>'
    # clouds are a separate moving layer now (see gen_clouds.py), so the sky itself stays cloud-free
    # wobbly hill line where sky meets the cream page
    s += f'<path d="M0 {h-90} Q150 {h-130} 300 {h-98} T600 {h-100} T900 {h-96} T1200 {h-104} L1200 {h} L0 {h} Z" fill="#fffaf0"/>'
    return svg(w, h, s)


save('sky.svg', sky())


def grass(w=1200, h=140):
    s = f'<path d="M0 60 Q60 30 120 56 T240 52 T360 58 T480 50 T600 58 T720 50 T840 58 T960 52 T1080 58 T1200 52 L1200 {h} L0 {h} Z" fill="#b9e3a2"/>'
    s += f'<path d="M0 84 Q80 62 160 82 T320 80 T480 84 T640 78 T800 84 T960 80 T1120 84 T1200 80 L1200 {h} L0 {h} Z" fill="#9ed48b"/>'
    cols = ['#ff9fbe', '#fff', '#ffd36e', '#c7b3ff', '#8fc5ff']
    for i, x in enumerate(range(30, 1200, 74)):
        y = 70 + (i * 17) % 40
        s += flower(cols[i % 5], x, y, .9 + (i % 3) * .2)
    for x in range(10, 1200, 38):
        s += f'<path d="M{x} {h} q-2 -22 -8 -30 M{x} {h} q3 -20 10 -26" stroke="#7fbf6e" stroke-width="3" fill="none" stroke-linecap="round"/>'
    return svg(w, h, s)


save('grass.svg', grass())

# tiny repeating pattern for card backgrounds: stars, hearts, dots
pat = ('<defs/><g opacity=".9">'
       '<path d="M30 30 l4 9 l9 1 l-7 6 l2 9 l-8 -5 l-8 5 l2 -9 l-7 -6 l9 -1 z" fill="#ffe27a" opacity=".7"/>'
       '<path d="M110 90 c-8 -8 -18 2 -10 10 l10 9 l10 -9 c8 -8 -2 -18 -10 -10 z" fill="#ffb7cb" opacity=".6"/>'
       '<circle cx="90" cy="26" r="4" fill="#b8dcf6"/><circle cx="26" cy="110" r="5" fill="#d9c7ff" opacity=".8"/><circle cx="130" cy="30" r="3" fill="#ffd2a6"/></g>')
save('pattern.svg', svg(160, 150, pat))

save('sparkle.svg', svg(40, 40, '<path d="M20 2 q2 14 18 18 q-16 4 -18 18 q-2 -14 -18 -18 q16 -4 18 -18 z" fill="#ffe27a" stroke="#f3c746" stroke-width="1.5" stroke-linejoin="round"/>'))
save('heart.svg', svg(40, 40, '<path d="M20 34 C4 22 2 12 8 8 C13 4 19 8 20 12 C21 8 27 4 32 8 C38 12 36 22 20 34 Z" fill="#ff9fbe" stroke="#3d3656" stroke-width="2.6" stroke-linejoin="round"/>'))

print(sorted(os.listdir(OUT)))
