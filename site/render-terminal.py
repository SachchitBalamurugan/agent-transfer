import math
import random
import sys
from pathlib import Path
import numpy as np
import mitsuba as mi
from PIL import Image, ImageFilter

mi.set_variant('scalar_rgb')
T = mi.ScalarTransform4f
rng = random.Random(78)
objects = {}
def rgb(s):
    return {'type':'rgb','value':s}
def mat(name, colour, roughness=.35, metal=0):
    objects[name.replace(chr(46),chr(95))] = {'type':'principled','base_color':rgb(colour),'roughness':roughness,'metallic':metal}
def geom(kind, name, material, transform):
    objects[name.replace(chr(46),chr(95))] = {'type':kind,'to_world':transform,'bsdf':{'type':'ref','id':material}}
def cube(name, p, dims, material, turn=0):
    geom('cube', name,material,T().translate(p) @ T().rotate([0,1,0],turn) @ T().scale([v/2 for v in dims]))
def rod(name,p,q,r, material):
    objects[name.replace(chr(46),chr(95))]={'type':'cylinder','p0':p,'p1':q,'radius':r,'bsdf':{'type':'ref','id':material}}
def ball(name,p,dims,material):
    geom('sphere',name,material,T().translate(p) @ T().scale(dims))

mat('iron',[.055,.13,.114],.27,.52)
mat('edge',[.16,.27,.22],.26,.38)
mat('brass',[.67,.37,.12],.26,.83)
mat('dark',[.042,.033,.024],.4,.24)
mat('wood',[.32,.14,.062],.38)
mat('leather',[.42,.115,.037],.4)
mat('forest',[.083,.16,.105],.48)
mat('belt',[.105,.043,.022],.41)
mat('paper',[.77,.64,.37],.65)
mat('shade',[.19,.148,.11],.29)
for i in range(6):
    c=.22+rng.random()*.07
    mat('tile'+str(i),[c*1.11,c*.99,c*.83],.23)
for i in range(4): mat('hill'+str(i),[.23+i*.025,.27+i*.02,.235+i*.027],.96)

# Tile seams, iron rails and sleepers converge on the departure platform.
cube('subfloor',[0,-.32,-11],[150,.5,150],'shade')
for j in range(17):
    for i in range(10):
        cube(f'floor{i}_{j}',[(i-4.5)*1.6,-.05,12-j*2],[1.586,.1,1.984],'tile'+str(rng.randrange(6)))
for x in [-9.25,-8.1,8.25,9.4]:
    cube('track'+str(x),[x,-.02,-18],[.09,.15,95],'iron')
for x in [-8.7,8.8]:
    for j in range(70): cube(f'sleeper{x}_{j}',[x,-.087,12-j*.65],[2.4,.12,.22],'dark')
for x in [-7.75,7.75]:
    cube('line'+str(x),[x,.012,-4],[.12,.016,34],'brass')

# Cast iron uprights and triangular cross-braces support a sawtooth glasshouse.
for j in range(8):
    z=9-j*4.7
    for side in [-1,1]:
        x=side*6.75
        rod(f'post{j}_{side}',[x,0,z],[x,5.1,z],.13,'iron')
        for k,(y,w,h) in enumerate([(.14,.55,.29),(.40,.41,.23),(4.90,.43,.17),(5.13,.64,.18)]):
            cube(f'plinth{j}_{side}_{k}',[x,y,z],[w,h,w],'edge')
        rod(f'brace{j}_{side}',[x,3.88,z],[x-side*1.48,5.28,z],.072,'iron')
        rod(f'rafter{j}_{side}',[x,5.25,z],[0,7.42,z],.106,'iron')
        rod(f'bar{j}_{side}',[x,5.28,z],[0,5.28,z],.07,'edge')
        for k in range(1,6):
            bx=x*(1-k/6)
            rod(f'truss{j}_{side}_{k}',[bx,5.28,z],[bx-side*.78,5.25+(k+.7)/6*2.17,z],.035,'iron')
    for side in [-1,1]:
        x=side*4.75
        rod(f'lampstem{j}_{side}',[x,4.45,z],[x,5.27,z],.028,'brass')
        ball(f'lampshade{j}_{side}',[x,4.45,z],[.24,.10,.24],'iron')
        ball(f'lampglass{j}_{side}',[x,4.35,z],[.14,.11,.14],'paper')
for k in range(-6,7):
    x=k*1.1
    rod('purlin'+str(k),[x,7.43-abs(x)*.32,9.5],[x,7.43-abs(x)*.32,-25],.044,'edge')
for side in [-1,1]:
    cube('eave'+str(side),[side*6.75,5.25,-7.65],[.24,.32,35],'iron')

def trunk(name,x,y,z,w,h,d,angle,skin):
    a=math.radians(angle)
    def point(dx,dy,dz):
        return [x+dx*math.cos(a)+dz*math.sin(a),y+dy,z-dx*math.sin(a)+dz*math.cos(a)]
    def part(label,dx,dy,dz,width,height,depth,m):
        cube(name+label,point(dx,dy,dz),[width,height,depth],m,angle)
    part('case',0,h*.48,0,w,h*.96,d,skin)
    part('lid',0,h,0,w*1.015,h*.14,d*1.02,skin)
    part('rim',0,h*.92,0,w*1.017,.027,d*1.025,'belt')
    for side in [-1,1]:
        tx=w*.31*side
        part('belt'+str(side),tx,h*.52,0,.107,h*1.09,d*1.035,'belt')
        part('lock'+str(side),tx,h*.78,d*.523,.146,.173,.035,'brass')
        for j,dy in enumerate([.064,h*.999]):
            part('corner'+str(side)+str(j),side*(w/2-.075),dy,d*.502,.15,.12,.04,'brass')
        part('foot'+str(side),side*w*.39,-.022,0,.14,.06,d*.66,'dark')
    for side in [-1,1]:
        part('handleMount'+str(side),side*.22,h+.09,0,.067,.17,.09,'brass')
    part('handle',0,h+.19,0,.49,.074,.10,'belt')
    part('label',.11,h*.59,d*.508,.28,.15,.03,'paper')
trunk('large',2.48,.07,4.3,2.7,1.22,1.30,-13,'leather')
trunk('small',2.32,1.39,4.34,1.82,.79,.95,6,'forest')
trunk('side',4.24,.05,3.1,1.28,.73,.75,22,'forest')
for j in range(4):
    z=1-j*6
    for s in [-1,1]:
        x=s*5.25
        for b in range(4):cube(f'bench{j}{s}{b}',[x+(b-1.5)*.11,.6,z],[.103,.09,2.3],'wood')
        for b in [-.75,.75]:cube(f'leg{j}{s}{b}',[x,.30,z+b],[.33,.6,.085],'iron')
for i in range(26):
    x=-97+i*7.8
    ball('hill'+str(i)+'geo',[x,-12,-82-rng.random()*20],[9+rng.random()*12,8+rng.random()*8,6],'hill'+str(i%4))

scene={'type':'scene','integrator':{'type':'path','max_depth':5},
 'sensor':{'type':'perspective','fov':62,'to_world':T().look_at(origin=[0.25,2.35,11.8],target=[.6,2.05,-12],up=[0,1,0]),'film':{'type':'hdrfilm','width':1560,'height':880,'rfilter':{'type':'tent'}},'sampler':{'type':'independent','sample_count':12}},
 'sun':{'type':'directional','direction':[.73,-.34,.6],'irradiance':rgb([4.9,3.1,1.65])},**objects}
theta,phi=np.mgrid[0:math.pi:160j,0:2*math.pi:320j]
elev=np.cos(theta)
sky=np.empty((160,320,3),dtype=np.float32)
for c,(horizon,zenith) in enumerate(zip([1.75,1.23,.84],[.23,.52,.80])):
    sky[:,:,c]=horizon+(zenith-horizon)*np.clip(elev,0,1)**.55
scene['sky']={'type':'envmap','bitmap':mi.Bitmap(sky),'scale':.70}
out=Path(sys.argv[1])
img=np.array(mi.render(mi.load_dict(scene),seed=34),dtype=np.float32)
img*=.89
img=(img*(2.51*img+.03))/(img*(2.43*img+.59)+.14)
img=np.where(img<=.0031308,12.92*img,1.055*np.power(np.maximum(img,0),1/2.4)-.055)
Image.fromarray((np.clip(img,0,1)*255).astype('uint8')).filter(ImageFilter.MedianFilter(3)).save(out,quality=91)
