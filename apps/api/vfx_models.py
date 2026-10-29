"""Versioned particle stack. Unsupported graph node types are rejected explicitly."""
from typing import Literal
from uuid import UUID
from pydantic import Field, model_validator, model_serializer
try:
    from .rig_models import StrictModel
except ImportError:
    from rig_models import StrictModel

class OptionalVFX(StrictModel):
    @model_serializer(mode='wrap')
    def omit_unset(self, handler):
        result=handler(self)
        for key in type(self).model_fields:
            if key not in self.model_fields_set and result.get(key) is None: result.pop(key,None)
        return result

class VFXPoint(StrictModel):
    x: float = Field(ge=-10000, le=10000)
    y: float = Field(ge=-10000, le=10000)

class VFXAttachment(OptionalVFX):
    boneId: UUID | None
    offset: VFXPoint
    rotation: float = Field(ge=-3600, le=3600)
    scale: float = Field(ge=.01, le=20)
    followRotation: bool
    followScale: bool
    followPosition: bool | None = None
    fixedPosition: VFXPoint | None = None

class ParticleEmitter(OptionalVFX):
    id: UUID
    type: Literal['ParticleEmitter','SpriteEmitter']
    name: str = Field(min_length=1,max_length=100)
    enabled: bool
    position: VFXPoint
    rotation: float = Field(ge=-3600,le=3600)
    rate: float = Field(ge=0,le=500)
    burst: int = Field(ge=0,le=512)
    maxParticles: int = Field(ge=1,le=1024)
    lifetime: float = Field(ge=.05,le=10)
    speed: float = Field(ge=0,le=1000)
    spread: float = Field(ge=0,le=360)
    acceleration: VFXPoint
    gravity: float | None = Field(default=None,ge=-2000,le=2000)
    drag: float = Field(ge=0,le=20)
    size: float = Field(ge=.1,le=100)
    endScale: float = Field(ge=0,le=5)
    angularVelocity: float = Field(ge=-3600,le=3600)
    color: str = Field(pattern=r'^#[\da-fA-F]{6}$')
    endColor: str = Field(pattern=r'^#[\da-fA-F]{6}$')
    opacity: float = Field(ge=0,le=1)
    shape: Literal['point','circle','ring','rectangle','line','cone']
    radius: float = Field(ge=0,le=500)
    blendMode: Literal['normal','add','screen']
    space: Literal['local','world']
    orbitVelocity: float | None = Field(default=None,ge=-720,le=720)
    lifetimeVariation: float | None = Field(default=None,ge=0,le=.9)
    velocityVariation: float | None = Field(default=None,ge=0,le=1)
    sizeVariation: float | None = Field(default=None,ge=0,le=.9)
    scaleOverLife: list['VFXKey'] | None = Field(default=None,min_length=2,max_length=32)
    opacityOverLife: list['VFXKey'] | None = Field(default=None,min_length=2,max_length=32)
    colorOverLife: list['VFXKey'] | None = Field(default=None,min_length=2,max_length=32)
    textureId: UUID | None = None
    attachment: VFXAttachment

class VFXMetadata(StrictModel):
    provenance: Literal['procedural','user-created']
    description: str = Field(max_length=1000)

class VFXTrigger(StrictModel):
    clipId: UUID | None
    startEventId: UUID | None
    stopEventId: UUID | None
    delay: float = Field(ge=0,le=30)
    mode: Literal['continuous','burst']

class TrailRenderer(OptionalVFX):
    id: UUID
    type: Literal['TrailRenderer']
    name: str = Field(min_length=1,max_length=100)
    enabled: bool
    base: VFXAttachment
    tip: VFXAttachment
    fadePower: float | None = Field(default=None,ge=.1,le=4)
    width: float = Field(ge=.1,le=500)
    lifetime: float = Field(ge=.01,le=5)
    sampleRate: int = Field(ge=1,le=120)
    segmentLimit: int = Field(ge=2,le=256)
    color: str = Field(pattern=r'^#[\da-fA-F]{6}$')
    endColor: str = Field(pattern=r'^#[\da-fA-F]{6}$')
    opacity: float = Field(ge=0,le=1)
    taper: float = Field(ge=0,le=1)
    smoothing: bool
    blendMode: Literal['normal','add','screen']
    textureId: UUID | None

class FlipFrame(StrictModel):
    x: int = Field(ge=0,le=4095)
    y: int = Field(ge=0,le=4095)
    w: int = Field(ge=1,le=4096)
    h: int = Field(ge=1,le=4096)

class Flipbook(OptionalVFX):
    id: UUID
    type: Literal['FlipbookAnimation']
    name: str = Field(min_length=1,max_length=100)
    enabled: bool
    sourceMetadata: str | None = Field(default=None,max_length=200000)
    assetId: UUID
    frames: list[FlipFrame] = Field(min_length=1,max_length=512)
    fps: float = Field(ge=1,le=120)
    loop: bool
    frameOffset: int = Field(ge=0,le=511)
    opacity: float = Field(ge=0,le=1)
    scale: float = Field(ge=.01,le=20)
    rotation: float = Field(ge=-3600,le=3600)
    attachment: VFXAttachment
    blendMode: Literal['normal','add','screen']

class VFXFilter(StrictModel):
    id: UUID
    type: Literal['GlowEffect','ColorModifier','TransformModifier','Distortion','Dissolve']
    enabled: bool
    intensity: float = Field(ge=0,le=20)
    color: str = Field(pattern=r'^#[\da-fA-F]{6}$')
    opacity: float = Field(ge=0,le=1)
    position: VFXPoint
    rotation: float = Field(ge=-3600,le=3600)
    scale: float = Field(ge=.01,le=20)

class Easing(StrictModel):
    x1: float = Field(ge=0,le=1)
    y1: float = Field(ge=0,le=1)
    x2: float = Field(ge=0,le=1)
    y2: float = Field(ge=0,le=1)

class VFXKey(OptionalVFX):
    id: UUID
    time: float = Field(ge=0,le=30)
    value: float | str
    interpolation: Literal['linear','stepped','bezier']
    handles: Easing | None = None
    @model_validator(mode='after')
    def value_valid(self):
        import re,math
        if isinstance(self.value,str):
            if not re.fullmatch(r'#[\da-fA-F]{6}',self.value): raise ValueError('Invalid key color')
        elif not math.isfinite(self.value) or not -10000<=self.value<=10000:raise ValueError('Invalid key value')
        return self

class VFXTrack(StrictModel):
    id: UUID
    targetId: UUID
    channel: Literal['rate','speed','intensity','color','opacity','scale','rotation','glow','width','x','y']
    keys: list[VFXKey] = Field(max_length=2048)

class VFXEffect(OptionalVFX):
    version: Literal[1]
    id: UUID
    name: str = Field(min_length=1,max_length=100)
    enabled: bool
    duration: float = Field(ge=.05,le=30)
    loopMode: Literal['once','loop']
    seed: int = Field(ge=0,le=4294967295)
    intensity: float = Field(ge=0,le=4)
    nodes: list[ParticleEmitter] = Field(min_length=1,max_length=8)
    metadata: VFXMetadata
    trigger: VFXTrigger | None = None
    trails: list[TrailRenderer] | None = Field(default=None,max_length=8)
    flipbooks: list[Flipbook] | None = Field(default=None,max_length=8)
    filters: list[VFXFilter] | None = Field(default=None,max_length=8)
    tracks: list[VFXTrack] | None = Field(default=None,max_length=128)

    @model_validator(mode='after')
    def budget(self):
        for node in self.nodes:
            if node.type=='SpriteEmitter' and not node.textureId:raise ValueError('SpriteEmitter requires texture')
            for channel,keys in [('scale',node.scaleOverLife),('opacity',node.opacityOverLife),('color',node.colorOverLife)]:
                for i,k in enumerate(keys or []):
                    if k.time>1 or (i and k.time<=keys[i-1].time) or (isinstance(k.value,str)!=(channel=='color')) or (channel!='color' and not 0<=k.value<=(1 if channel=='opacity' else 5)):raise ValueError('Invalid lifetime curve')
        if len({f.type for f in self.filters or []})!=len(self.filters or []):raise ValueError("Duplicate filter type")
        targets={self.id:{'intensity'}}
        targets.update({n.id:{'rate','speed','color','opacity','scale','rotation','x','y'} for n in self.nodes})
        targets.update({n.id:{'width','color','opacity'} for n in self.trails or []})
        targets.update({n.id:({'glow','color','opacity'} if n.type in ['GlowEffect','ColorModifier'] else {'x','y','rotation','scale','opacity'} if n.type=='TransformModifier' else {'glow'}) for n in self.filters or []})
        targets.update({n.id:{'opacity','scale','rotation'} for n in self.flipbooks or []})
        seen=set()
        for t in self.tracks or []:
            label=(t.targetId,t.channel)
            if t.channel not in targets.get(t.targetId,set()) or label in seen:raise ValueError('Invalid parameter track')
            seen.add(label)
            ranges={'rate':(0,500),'speed':(0,1000),'intensity':(0,4),'opacity':(0,1),'scale':(.1,100) if any(n.id==t.targetId for n in self.nodes) else (.01,20),'rotation':(-3600,3600),'glow':(0,20),'width':(.1,500)}
            lo,hi=ranges.get(t.channel,(-10000,10000))
            for i,k in enumerate(t.keys):
                if not isinstance(k.value,str) and not lo<=k.value<=hi:raise ValueError('Parameter key out of range')
                if k.time>self.duration or (i and k.time<=t.keys[i-1].time) or (isinstance(k.value,str)!=(t.channel=='color')):raise ValueError('Invalid keyframe')
        if sum(n.maxParticles for n in self.nodes)>2048: raise ValueError('Effect particle budget exceeds 2048')
        return self

def effect_ids(e):
    return [n.id for n in [e]+e.nodes+[k for n in e.nodes for k in (n.scaleOverLife or [])+(n.opacityOverLife or [])+(n.colorOverLife or [])]+(e.trails or [])+(e.flipbooks or [])+(e.filters or [])+(e.tracks or [])+[k for t in e.tracks or [] for k in t.keys]]

def attachments(e):return [n.attachment for n in e.nodes]+[a for n in e.trails or [] for a in [n.base,n.tip]]+[n.attachment for n in e.flipbooks or []]

def validate_vfx(p):
    if sum(len(t.keys) for e in p.vfxGraphs+(p.vfxPresets or []) for t in e.tracks or [])>20000:raise ValueError("VFX exceeds 20000 keys")
    for e in p.vfxGraphs+(p.vfxPresets or []):
        for a in attachments(e):
            if a.boneId is not None and not any(b.id==a.boneId for b in p.bones):raise ValueError('Missing VFX bone')
        assets={a.id:a for a in p.assetReferences}
        for id in [n.textureId for n in e.nodes]+[n.textureId for n in e.trails or []]+[n.assetId for n in e.flipbooks or []]:
            if id is not None and id not in assets:raise ValueError('Missing VFX texture')
        for f in e.flipbooks or []:
            a=assets[f.assetId]
            if f.frameOffset>=len(f.frames) or any(r.x+r.w>a.width or r.y+r.h>a.height for r in f.frames):raise ValueError('Invalid flipbook frame')
        if e.trigger:
            t=e.trigger;events={ev.id:ev for ev in p.animationEvents}
            if t.clipId is not None and not any(c.id==t.clipId for c in p.animationClips):raise ValueError('Missing VFX clip')
            for id in [t.startEventId,t.stopEventId]:
                if id is not None and (id not in events or events[id].clipId!=t.clipId):raise ValueError('Missing VFX event')
            if t.startEventId and t.stopEventId and events[t.stopEventId].time<events[t.startEventId].time:raise ValueError('VFX stop precedes start')

ParticleEmitter.model_rebuild()
VFXEffect.model_rebuild()
