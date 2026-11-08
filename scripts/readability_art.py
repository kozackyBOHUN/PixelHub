"""Native 24px assets for the readability correction; does not change simulation."""
from pathlib import Path
from PIL import Image,ImageDraw
R=Path(__file__).resolve().parents[1]/'public/assets'
INK='#20384b'
def save(im,p):
    dest=R/p;dest.parent.mkdir(parents=True,exist_ok=True);im.save(dest)
colors={'gray':'#a6b4bc','red':'#d95050','blue':'#398bc6','yellow':'#e8c343','green':'#59a56a','purple':'#9363b6','orange':'#e28d36','teal':'#36a89f','pink':'#d878a8'}
def shade(c,k):return tuple(min(255,round(v*k)) for v in bytes.fromhex(c[1:]))
for name,c in colors.items():
    im=Image.new('RGBA',(24,24));d=ImageDraw.Draw(im)
    # Broad coloured faces, with a fixed vertical front. No faux-isometric tilt.
    d.rectangle((2,2,21,21),fill=INK)
    d.rectangle((3,3,20,15),fill=c)
    d.line((3,3,20,3),fill=shade(c,1.3))
    d.line((3,4,3,15),fill=shade(c,1.18))
    d.rectangle((3,16,20,20),fill=shade(c,.75))
    d.line((3,16,20,16),fill=shade(c,.58))
    # One unobtrusive packing strip, never a substitute for the destination colour.
    d.rectangle((16,4,18,14),fill=shade(c,1.12))
    d.rectangle((15,18,18,19),fill='#e9e4cf')
    save(im,Path('cargo/box')/(name+'.png'))
for name in ['base','variant_01','variant_02','worn']:
    im=Image.new('RGBA',(24,24),'#cad4d8' if name!='worn' else '#c3cdd0');d=ImageDraw.Draw(im)
    d.line((0,23,0,0,23,0),fill='#b2c1c9')
    d.line((1,23,23,23,23,1),fill='#dce3e4')
    if name=='variant_01':d.line((16,8,18,8),fill='#c2cdd1')
    if name=='variant_02':d.line((5,18,7,17),fill='#c0cbd0')
    save(im,Path('floors')/(name+'.png'))
im=Image.new('RGBA',(24,24),'#8da1ab');d=ImageDraw.Draw(im);d.point((7,17),fill='#91a5ae');save(im,Path('exterior/base.png'))
for name in ['desk','table','bench','sink','toilet','chair']:
    im=Image.new('RGBA',(24,24));d=ImageDraw.Draw(im)
    if name in ['desk','table','bench']:
        d.rectangle((2,6,21,17),fill=INK);d.rectangle((3,7,20,14),fill='#ccab74');d.line((3,7,20,7),fill='#efcf94')
        d.rectangle((3,15,20,17),fill='#8e6c48')
        for x in [3,19]:d.rectangle((x,18,x+1,21),fill=INK)
        if name=='desk':
            d.rectangle((16,18,20,20),fill='#a48558');d.line((17,18,19,18),fill=INK)
            d.rectangle((4,9,9,12),fill='#f2ebd4');d.line((5,10,8,10),fill='#8090a1')
        if name=='table':
            d.rectangle((7,9,10,12),fill='#eee5cd');d.rectangle((14,8,16,10),fill='#4a8197')
        if name=='bench':d.rectangle((2,9,21,12),fill='#d8b985')
    elif name=='chair':
        d.rectangle((6,3,18,10),fill=INK);d.rectangle((7,4,17,8),fill='#417d9f')
        d.rectangle((5,12,19,18),fill=INK);d.rectangle((6,12,18,16),fill='#508cad')
        d.line((8,19,7,21),fill=INK,width=2);d.line((16,19,17,21),fill=INK,width=2)
    elif name=='sink':
        d.rectangle((3,6,21,19),fill=INK);d.rectangle((4,7,20,17),fill='#edf1df')
        d.rectangle((7,10,17,15),fill='#88b5be');d.rectangle((9,11,15,14),fill='#b3d2d1')
        d.line((12,6,12,9),fill='#5c7d8c',width=2);d.rectangle((5,18,19,20),fill='#a5b9bc')
    else:
        d.rectangle((6,3,18,8),fill=INK);d.rectangle((7,4,17,7),fill='#e3e9dc')
        d.ellipse((6,8,18,20),fill='#eef1e5',outline=INK);d.ellipse((8,10,16,16),fill='#90b5bf');d.ellipse((10,11,15,15),fill='#b5d5d4')
    save(im,Path('furniture')/(name+'.png'))
print('Updated 9 cargo colours, 5 floor/exterior tiles and 6 furniture sprites.')
