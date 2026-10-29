"""Schema v3 animation contracts, validated against the same rig entities as the client."""
from typing import Literal, Annotated
from uuid import UUID
from pydantic import Field, StrictBool, model_serializer
try:
    from .rig_models import StrictModel
except ImportError:
    from rig_models import StrictModel

Number = Annotated[float, Field(strict=True, allow_inf_nan=False)]
Channel = Literal['bone.x','bone.y','bone.rotation','bone.scaleX','bone.scaleY','layer.x','layer.y','layer.rotation','layer.scaleX','layer.scaleY','layer.opacity','layer.visible','mesh.deform','ik.x','ik.y','ik.blend','attachment.bone']
class Handles(StrictModel):
    x1: float = Field(ge=0,le=1)
    y1: float = Field(ge=0,le=1)
    x2: float = Field(ge=0,le=1)
    y2: float = Field(ge=0,le=1)
class Offset(StrictModel):
    x: Number = Field(ge=-4096,le=4096)
    y: Number = Field(ge=-4096,le=4096)
class Keyframe(StrictModel):
    id: UUID
    time: float = Field(ge=0,le=120)
    value: Number | StrictBool | UUID | None | dict[UUID,Offset]
    interpolation: Literal['linear','stepped','bezier']
    handles: Handles | None = None
    @model_serializer(mode='wrap')
    def optional_handles(self,handler):
        result=handler(self)
        if self.handles is None:result.pop('handles',None)
        return result
class AnimationTrack(StrictModel):
    id: UUID
    clipId: UUID
    targetId: UUID
    type: Channel
    enabled: bool
    rotationMode: Literal['shortest','direct']
    keyframes: list[Keyframe] = Field(max_length=4096)
class BoneState(StrictModel):
    boneId: UUID
    x: float = Field(ge=-10000,le=10000)
    y: float = Field(ge=-10000,le=10000)
    rotation: float = Field(ge=-36000,le=36000)
    scaleX: float = Field(ge=.05,le=10)
    scaleY: float = Field(ge=.05,le=10)
class LayerState(StrictModel):
    layerId: UUID
    x: float = Field(ge=-10000,le=10000)
    y: float = Field(ge=-10000,le=10000)
    rotation: float = Field(ge=-36000,le=36000)
    scaleX: float = Field(ge=.01,le=20)
    scaleY: float = Field(ge=.01,le=20)
    opacity: float = Field(ge=0,le=1)
    visible: bool
class IKState(StrictModel):
    targetId: UUID
    x: float = Field(ge=-10000,le=10000)
    y: float = Field(ge=-10000,le=10000)
    blend: float = Field(ge=0,le=1)
    enabled: bool
class AttachmentState(StrictModel):
    layerId: UUID
    boneId: UUID | None
class BaseState(StrictModel):
    bonePoses: list[BoneState] = Field(max_length=256)
    layerStates: list[LayerState] = Field(max_length=1000)
    ikStates: list[IKState] = Field(max_length=128)
    attachmentStates: list[AttachmentState] = Field(max_length=1000)
class PlaybackRange(StrictModel):
    start: float = Field(ge=0)
    end: float = Field(gt=0,le=120)
class ClipMetadata(StrictModel):
    origin: Literal['user-created','procedural']
    description: str = Field(max_length=2000)
    tags: list[Annotated[str,Field(max_length=80)]] = Field(max_length=20)
class AnimationClip(StrictModel):
    id: UUID
    name: str = Field(min_length=1,max_length=100)
    duration: float = Field(ge=1/120,le=120)
    fps: int = Field(ge=1,le=120)
    loopMode: Literal['loop','once']
    range: PlaybackRange
    trackIds: list[UUID] = Field(max_length=4096)
    eventIds: list[UUID] = Field(max_length=1024)
    baseState: BaseState
    metadata: ClipMetadata
class MarkerPayload(StrictModel):
    type: Literal['marker']
    value: str = Field(max_length=500)
class NumberPayload(StrictModel):
    type: Literal['number']
    value: Number
class VFXPayload(StrictModel):
    type: Literal['vfx']
    action: Literal['start','stop','burst']
    effectName: str = Field(min_length=1,max_length=100)
    socketId: UUID | None = None
    @model_serializer(mode='wrap')
    def optional_socket(self,handler):
        result=handler(self)
        if self.socketId is None:result.pop('socketId',None)
        return result
Payload = Annotated[MarkerPayload | NumberPayload | VFXPayload,Field(discriminator='type')]
class AnimationEvent(StrictModel):
    id: UUID
    clipId: UUID
    name: str = Field(min_length=1,max_length=100)
    time: float = Field(ge=0,le=120)
    enabled: bool
    payload: Payload | None

def validate_animations(doc):
    clips={c.id:c for c in doc.animationClips};bones={b.id for b in doc.bones};layers={l.id for l in doc.layers};meshes={m.id:m for m in doc.meshes};iks={t.id for t in doc.ikTargets};slots={s.id for s in doc.equipmentSlots}
    identities=set();count=0
    for c in doc.animationClips:
        if c.range.start>=c.range.end or c.range.end>c.duration+1e-8:raise ValueError('Playback range không hợp lệ')
        tracks=[t.id for t in doc.keyframeTracks if t.clipId==c.id];events=[e.id for e in doc.animationEvents if e.clipId==c.id]
        if len(c.trackIds)!=len(set(c.trackIds)) or set(c.trackIds)!=set(tracks) or len(c.eventIds)!=len(set(c.eventIds)) or set(c.eventIds)!=set(events):raise ValueError('Clip references không đồng bộ')
        for values,field,valid in [(c.baseState.bonePoses,'boneId',bones),(c.baseState.layerStates,'layerId',layers),(c.baseState.ikStates,'targetId',iks),(c.baseState.attachmentStates,'layerId',layers)]:
            ids=[getattr(v,field) for v in values]
            if len(ids)!=len(set(ids)) or any(i not in valid for i in ids):raise ValueError('Animation base references không hợp lệ')
        if any(a.boneId is not None and a.boneId not in bones for a in c.baseState.attachmentStates):raise ValueError('Base attachment không hợp lệ')
    for t in doc.keyframeTracks:
        clip=clips.get(t.clipId)
        if clip is None:raise ValueError('Track thiếu clip')
        identity=(t.clipId,t.targetId,t.type)
        if identity in identities:raise ValueError('Track bị trùng property')
        identities.add(identity)
        category=t.type.split('.')[0]
        valid=bones if category=='bone' else set(meshes) if category=='mesh' else iks if category=='ik' else layers
        if t.targetId not in valid:raise ValueError('Animation target không tồn tại')
        count+=len(t.keyframes);previous=-1
        for k in t.keyframes:
            if k.time<=previous+1e-8 or k.time>clip.duration+1e-8:raise ValueError('Keyframe time không hợp lệ')
            previous=k.time
            if t.type in ('layer.visible','attachment.bone') and k.interpolation!='stepped':raise ValueError('Discrete track cần stepped')
            if t.type=='layer.visible':
                if not isinstance(k.value,bool):raise ValueError('Visibility cần boolean')
            elif t.type=='attachment.bone':
                if k.value is not None and (not isinstance(k.value,UUID) or k.value not in bones):raise ValueError('Attachment key không hợp lệ')
            elif t.type=='mesh.deform':
                if not isinstance(k.value,dict) or len(k.value)>512 or any(i not in {v.id for v in meshes[t.targetId].vertices} for i in k.value):raise ValueError('Deformation offsets không hợp lệ')
            else:
                if not isinstance(k.value,(float,int)) or isinstance(k.value,bool):raise ValueError('Track cần số')
                lo,hi=-10000,10000
                if t.type.endswith('.rotation'):lo,hi=-36000,36000
                if 'scale' in t.type:lo,hi=(.05,10) if t.type.startswith('bone') else (.01,20)
                if t.type in ('layer.opacity','ik.blend'):lo,hi=0,1
                if not lo<=k.value<=hi:raise ValueError('Keyframe value vượt giới hạn')
    if count>20000:raise ValueError('Vượt 20000 keyframes')
    for e in doc.animationEvents:
        if e.clipId not in clips or e.time>clips[e.clipId].duration+1e-8:raise ValueError('Event ngoài duration')
        if isinstance(e.payload,VFXPayload) and e.payload.socketId is not None and e.payload.socketId not in slots:raise ValueError('Event socket không tồn tại')
        if e.name in ('sword_trail_start','sword_trail_end') and e.payload is not None and (not isinstance(e.payload,VFXPayload) or e.payload.action!=('start' if e.name.endswith('start') else 'stop')):raise ValueError('Reserved VFX event payload không hợp lệ')
