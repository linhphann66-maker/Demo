"""Project-owned original procedural chibi part sheet, dedicated CC0-1.0."""
from PIL import Image,ImageDraw
from pathlib import Path
image=Image.new('RGBA',(480,600),(0,0,0,0));d=ImageDraw.Draw(image);ink='#282332'
# Exactly seven primary islands; all contours deliberately connected.
d.rounded_rectangle((20,20,110,116),radius=15,fill='#e2b58f',outline=ink,width=3);d.polygon([(106,55),(119,69),(106,77)],fill='#e2b58f',outline=ink)
d.ellipse((88,50,99,66),fill='white',outline=ink,width=2);d.ellipse((95,54,99,62),fill=ink);d.line((94,88,108,85),fill=ink,width=2)
d.polygon([(260,45),(270,20),(284,31),(295,20),(310,35),(328,20),(341,34),(366,20),(382,51),(375,98),(351,79),(338,66),(325,76),(310,57),(293,69),(280,58),(262,84)],fill='#e4e8ef',outline=ink,width=3)
d.polygon([(20,180),(116,180),(104,307),(31,310)],fill='#38846d',outline=ink,width=3);d.rectangle((52,185,84,290),fill='white',outline=ink,width=2);d.rectangle((27,268,108,280),fill='#77523e',outline=ink,width=2)
for x,w,h,shade in [(180,35,150,'#416778'),(260,40,160,'#5f8293')]:
 d.rounded_rectangle((x,180,x+w,180+h-24),radius=10,fill=shade,outline=ink,width=3);d.ellipse((x+3,180+h-40,x+w,180+h),fill='#e2b58f',outline=ink,width=3)
for x,w,h,shade in [(20,44,150,'#39434a'),(150,50,160,'#4c555e')]:
 d.rounded_rectangle((x,410,x+w-8,410+h-20),radius=8,fill=shade,outline=ink,width=3);d.rounded_rectangle((x,410+h-38,x+w,410+h),radius=5,fill='#78543b',outline=ink,width=3)
root=Path(__file__).parent;image.save(root/'builder-adventurer.png')
white=Image.new('RGBA',image.size,'white');white.alpha_composite(image);white.convert('RGB').save(root/'builder-adventurer-white.png')
# Individual layers retain each source part's alpha and semantic filenames.
parts={'head_base':(18,18,122,119),'hair':(258,18,385,101),'torso':(18,178,119,313),'left_arm':(178,178,218,333),'right_arm':(258,178,303,343),'left_leg':(18,408,67,563),'right_leg':(148,408,203,573)}
for name,box in parts.items():image.crop(box).save(root/('builder-'+name+'.png'))

# Optional accessories are not primary slots.
cloak=Image.new('RGBA',(90,180));draw=ImageDraw.Draw(cloak);draw.polygon([(65,4),(87,15),(70,172),(7,176),(27,20)],fill='#a63340',outline=ink,width=3);cloak.save(root/'builder-cloak.png')
sword=Image.new('RGBA',(42,160));draw=ImageDraw.Draw(sword);draw.polygon([(21,3),(30,25),(26,115),(15,115),(12,25)],fill='#dde7ec',outline=ink,width=2);draw.rectangle((6,113,36,122),fill='#e9b345',outline=ink,width=2);draw.rectangle((17,120,25,156),fill='#795244',outline=ink,width=2);sword.save(root/'builder-sword.png')

image.crop(parts["right_arm"]).resize((135,495),Image.Resampling.NEAREST).save(root/"builder-right_arm-large.png")
