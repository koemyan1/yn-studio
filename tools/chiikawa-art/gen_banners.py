import re, os, sys
import importlib.util
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('art', os.path.join(HERE, 'gen_art.py')); art = importlib.util.module_from_spec(spec); spec.loader.exec_module(art)
OUT=os.path.normpath(os.path.join(HERE,'..','..','public','chiikawa'))
INK='#3d3656'
def inner(s): return s[s.index('>')+1:-6]
def place(s, x, y, w, rot=0):
    vb = re.search(r'viewBox="([\d\.\- ]+)"', s).group(1).split(); vw, vh = float(vb[2]), float(vb[3]); sc = w/vw
    return f'<g transform="translate({x} {y}) rotate({rot} {w/2} {vh*sc/2}) scale({sc}) translate({-float(vb[0])} {-float(vb[1])})">{inner(s)}</g>'
def cloud(x,y,sc,op=.95):
    return f'<g transform="translate({x} {y}) scale({sc})" opacity="{op}">{inner(art.cloud())}</g>'
def text(x,y,t,size,fill=INK,stroke='#fff',sw=14,rot=0,anchor='start',weight=800,spacing=0):
    return (f'<text x="{x}" y="{y}" font-family="Poppins" font-weight="{weight}" font-size="{size}" letter-spacing="{spacing}" text-anchor="{anchor}" transform="rotate({rot} {x} {y})" '
            f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round" paint-order="stroke">{t}</text>')
def base(sky_a='#b5daf5', sky_b='#e6f3fb'):
    s = f'<defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{sky_a}"/><stop offset="1" stop-color="{sky_b}"/></linearGradient></defs><rect width="1600" height="500" fill="url(#sk)"/>'
    s += cloud(120,40,1.1)+cloud(620,20,.8,.85)+cloud(1020,70,1.2)+cloud(1380,20,.7,.8)+cloud(330,250,.6,.7)
    # hills + flowers
    s += '<path d="M0 410 Q200 350 420 400 T860 392 T1280 398 T1600 380 L1600 500 L0 500 Z" fill="#b9e3a2"/><path d="M0 450 Q250 410 520 446 T1060 440 T1600 440 L1600 500 L0 500 Z" fill="#9ed48b"/>'
    cols=['#ff9fbe','#fff','#ffd36e','#c7b3ff','#8fc5ff']
    for i,x in enumerate(range(40,1600,110)):
        s += art.flower(cols[i%5], x, 440+(i*23)%48, 1.5)
    return s
def render(name, body):
    html = f'<html><body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="1600" height="500" viewBox="0 0 1600 500">{body}</svg></body></html>'
    open('/tmp/b.html','w').write(html)
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b=p.chromium.launch(); pg=b.new_page(viewport={'width':1600,'height':500}); pg.goto('file:///tmp/b.html'); pg.screenshot(path=f'{OUT}/{name}.png'); b.close()
    # rounded-edge friendly: keep PNG; shrink
    os.system(f'convert {OUT}/{name}.png -strip -colors 200 PNG8:{OUT}/{name}.tmp.png && mv {OUT}/{name}.tmp.png {OUT}/{name}.png')

def truck():
    s = ''
    # cargo box
    s += f'<rect x="1000" y="215" width="330" height="190" rx="22" fill="#fff" stroke="{INK}" stroke-width="7"/>'
    s += f'<rect x="1000" y="360" width="330" height="26" fill="#cfe3f7"/><rect x="1000" y="215" width="330" height="190" rx="22" fill="none" stroke="{INK}" stroke-width="7"/>'
    # cube logo
    s += f'<path d="M1165 262 l46 -26 l46 26 v52 l-46 26 l-46 -26 z" fill="#5d9be0" stroke="{INK}" stroke-width="6" stroke-linejoin="round"/><path d="M1165 262 l46 26 l46 -26 M1211 288 v52" fill="none" stroke="#fff" stroke-width="6" stroke-linejoin="round" opacity=".9"/>'
    # cab
    s += f'<path d="M1000 405 L1000 270 L920 270 Q880 270 860 310 L832 372 L832 405 Z" fill="#fff" stroke="{INK}" stroke-width="7" stroke-linejoin="round"/>'
    s += f'<path d="M930 292 L910 292 Q892 292 884 312 L866 350 L930 350 Z" fill="#cfe9fb" stroke="{INK}" stroke-width="6" stroke-linejoin="round"/>'
    s += f'<rect x="820" y="386" width="44" height="16" rx="8" fill="#ffd36e" stroke="{INK}" stroke-width="5"/>'
    s += f'<rect x="820" y="402" width="520" height="14" rx="6" fill="#9db7d9" stroke="{INK}" stroke-width="6"/>'
    for cx in (900,1250):
        s += f'<circle cx="{cx}" cy="425" r="38" fill="#3d3656"/><circle cx="{cx}" cy="425" r="16" fill="#e8eefb" stroke="#8aa0c8" stroke-width="4"/>'
    return s

# ---- 1 delivery
b = base()
b += place(art.mascot('bun','happy',box=False),1330,150,200,rot=4)
# boxes stack
b += f'<rect x="1380" y="290" width="170" height="130" rx="10" fill="#efd1a3" stroke="{INK}" stroke-width="6"/><path d="M1465 290 v130" stroke="{INK}" stroke-width="5"/><rect x="1380" y="290" width="170" height="130" rx="10" fill="none" stroke="{INK}" stroke-width="6"/>'
b += place(art.mascot('bun','happy'),1385,150,170,rot=3)
b += truck()
b += place(art.mascot('mochi','smile',cap=True),880,200,170)
b += text(80,170,'DELIVERY',66,fill='#4a4272',sw=16,rot=-6,spacing=4)
b += text(110,222,'JUST',50,fill='#4a4272',sw=14,rot=-6,spacing=4)
b += text(120,340,'9-10 DAYS',150,fill='#5a4a86',sw=26,rot=-3,spacing=-2)
b += f'<path d="M130 372 q220 -26 520 -10" fill="none" stroke="{INK}" stroke-width="8" stroke-linecap="round"/>'
b += place(open(f'{OUT}/sparkle.svg').read(),700,150,46)+place(open(f'{OUT}/sparkle.svg').read(),60,300,36)
render('banner-delivery', b)

# ---- 2 food
b = base('#ffe3ec','#fff6ea')
b += place(open(f'{OUT}/onigiri.svg').read(),1000,110,210,rot=-8)+place(open(f'{OUT}/burger.svg').read(),1190,170,230,rot=6)+place(open(f'{OUT}/cake.svg').read(),1400,230,170,rot=-4)
b += place(art.mascot('mochi','open'),820,230,180)
b += place(art.mascot('bun','happy'),1060,300,0.1) if False else ''
b += text(80,190,'Yummy',140,fill='#e8648f',stroke='#fff',sw=26,rot=-4)
b += text(90,330,'FOOD TIME!',92,fill='#4a4272',stroke='#fff',sw=20,rot=-4)
b += text(94,395,'Fresh, warm & made with love',38,fill='#7d6ea0',stroke='#fff',sw=10,weight=600,rot=-4)
render('banner-food', b)

# ---- 3 drink
b = base('#d7ecfb','#f4f0ff')
b += place(open(f'{OUT}/boba.svg').read(),980,100,200,rot=-6)+place(open(f'{OUT}/latte.svg').read(),1190,150,230,rot=5)+place(open(f'{OUT}/icecream.svg').read(),1420,200,150,rot=-8)
b += place(art.mascot('kiki','happy'),820,235,180)
b += text(80,190,'Sip sip!',150,fill='#5d8fd8',stroke='#fff',sw=26,rot=-4)
b += text(90,330,'DRINKS MENU',92,fill='#4a4272',stroke='#fff',sw=20,rot=-4)
b += text(94,395,'Cold, sweet & super cute',38,fill='#7d6ea0',stroke='#fff',sw=10,weight=600,rot=-4)
render('banner-drink', b)

# ---- 4 welcome
b = base('#cfe6fa','#fff3f7')
b += place(art.mascot('mochi','happy',wave=True),860,170,230)+place(art.mascot('bun','smile'),1100,150,250,rot=2)+place(art.mascot('kiki','happy'),1360,170,220,rot=-2)
b += text(80,190,'Welcome!',150,fill='#e8648f',stroke='#fff',sw=26,rot=-4)
b += text(90,320,'to our cozy shop',78,fill='#4a4272',stroke='#fff',sw=18,rot=-4)
b += text(94,390,'Pick something you love',38,fill='#7d6ea0',stroke='#fff',sw=10,weight=600,rot=-4)
render('banner-welcome', b)
print(os.listdir(OUT))
