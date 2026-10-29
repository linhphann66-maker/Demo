"""Editable v4 side-scrolling, semantic parts and joint completion. No provider is configured."""
from typing import Literal
from uuid import UUID
from datetime import datetime
from pydantic import Field, StrictBool, model_validator
try:
    from .rig_models import StrictModel, AlphaMask
except ImportError:
    from rig_models import StrictModel, AlphaMask
class Point(StrictModel):
    x: float = Field(ge=-10000,le=10000)
    y: float = Field(ge=-10000,le=10000)
class CharacterSettings(StrictModel):
    characterView: Literal['side_3_4','front']
    defaultFacing: Literal['left','right']
    facing: Literal['left','right']
    movementMode: Literal['horizontal']
    mirrorForOppositeDirection: StrictBool
    enableVerticalFacing: Literal[False]
    worldPosition: Point
class CharacterVariant(StrictModel):
    id: UUID
    name: str = Field(min_length=1,max_length=100)
    view: Literal['side_3_4','front']
    rootBoneId: UUID | None
    layerIds: list[UUID] = Field(max_length=1000)
    boneIds: list[UUID] = Field(max_length=256)
    clipIds: list[UUID] = Field(max_length=64)
    reference: StrictBool
class CharacterPart(StrictModel):
    id: UUID
    layerId: UUID
    sourceAssetId: UUID
    semantic: str = Field(min_length=1,max_length=80)
    depth: Literal['near','far','center']
    alphaMask: AlphaMask
    parentBoneId: UUID | None
    meshId: UUID | None
    attachmentId: UUID | None
    renderOrder: int = Field(ge=0,le=1000)
    jointId: UUID | None
    role: Literal['body','continuous','upper','lower','underlap','overlap','armor','weapon']
    overlapAssetId: UUID | None
    underlapAssetId: UUID | None
    mirrorPolicy: Literal['mirror','keep_texture','directional']
    leftAssetId: UUID | None
class CharacterJoint(StrictModel):
    id: UUID
    name: str = Field(min_length=1,max_length=100)
    kind: Literal['elbow','knee','shoulder','hip','cape','hair','weapon']
    upperBoneId: UUID
    lowerBoneId: UUID
    layerIds: list[UUID] = Field(min_length=1,max_length=16)
    mode: Literal['continuous_mesh','overlap_only','rigid_segment']
    overlapSize: float = Field(ge=0,le=48)
    underlapSize: float = Field(ge=0,le=48)
    radius: float = Field(ge=1,le=48)
    completion: Literal['procedural_neighbor_fill_v1','user_authored']
Suggestion = Literal['increase_overlap','adjust_pivot','expand_underlap','smooth_weights','increase_density']
class JointIssue(StrictModel):
    id: UUID
    jointId: UUID
    kind: Literal['visible_gap','exposed_alpha','stretch','invalid_triangle','self_intersection','broken_overlap','unexpected_overlap','invalid_weights','rotation_limit']
    severity: Literal['warning','error']
    angle: float = Field(ge=-180,le=180)
    position: Point
    message: str = Field(max_length=300)
    suggestions: list[Suggestion] = Field(max_length=5)
class JointReport(StrictModel):
    id: UUID
    createdAt: datetime
    sourceRevision: int = Field(ge=0)
    testedAngles: list[float] = Field(min_length=1,max_length=32)
    samples: int = Field(ge=0,le=1000000)
    uncoveredSamples: int = Field(ge=0,le=1000000)
    issues: list[JointIssue] = Field(max_length=2048)
    jointIds: list[UUID] = Field(max_length=128)
    @model_validator(mode='after')
    def angles_valid(self):
        if any(not -180<=n<=180 for n in self.testedAngles):raise ValueError('Sweep angle invalid')
        return self

def validate_character(p):
    bones={b.id:b for b in p.bones};layers={l.id:l for l in p.layers};assets={a.id:a for a in p.assetReferences};joints={j.id:j for j in p.characterJoints};meshes={m.id:m for m in p.meshes}
    def require(ok,message):
        if not ok:raise ValueError(message)
    require(len({v.view for v in p.characterVariants})==len(p.characterVariants),'Duplicate view')
    for key in ('layerIds','boneIds','clipIds'):
        ids=[x for v in p.characterVariants for x in getattr(v,key)];require(len(ids)==len(set(ids)),'Entity belongs to multiple views')
    require(not p.characterVariants or any(v.view==p.characterSettings.characterView for v in p.characterVariants),'Missing view artwork')
    for v in p.characterVariants:
        require(all(x in layers for x in v.layerIds) and all(x in bones for x in v.boneIds) and all(any(c.id==x for c in p.animationClips) for x in v.clipIds),'View references invalid')
        require(all(len(x)==len(set(x)) for x in [v.layerIds,v.boneIds,v.clipIds]),'Duplicate view references')
        if v.rootBoneId:require(v.rootBoneId in v.boneIds and bones[v.rootBoneId].parentId is None,'View root invalid')
    require(len({part.layerId for part in p.characterParts})==len(p.characterParts),'Duplicate semantic layer')
    for part in p.characterParts:
        l=layers.get(part.layerId)
        require(l is not None and l.assetId==part.sourceAssetId and part.sourceAssetId in assets,'Part source invalid')
        require(len(part.alphaMask.data)==part.alphaMask.width*part.alphaMask.height and all(x in (0,1) for x in part.alphaMask.data),'Part alpha invalid')
        if part.parentBoneId:require(part.parentBoneId in bones,'Part parent invalid')
        if part.meshId:require(part.meshId in meshes and meshes[part.meshId].layerId==part.layerId,'Part mesh invalid')
        if part.attachmentId:require(any(a.id==part.attachmentId and a.layerId==part.layerId for a in p.attachments),'Part attachment invalid')
        if part.jointId:require(part.jointId in joints and part.layerId in joints[part.jointId].layerIds,'Part joint invalid')
        for ref in (part.overlapAssetId,part.underlapAssetId,part.leftAssetId):
            if ref:require(ref in assets,'Part texture invalid')
        if part.mirrorPolicy!='mirror':require(part.meshId is None,'Mirror exceptions require rigid sprite')
        if part.mirrorPolicy=='directional':require(part.leftAssetId is not None,'Directional artwork missing')
        if part.leftAssetId:
            a=assets[part.leftAssetId];b=assets[part.sourceAssetId];require((a.width,a.height)==(b.width,b.height),'Directional size mismatch')
    for j in p.characterJoints:
        if j.kind=='weapon':require(j.mode=='rigid_segment','Weapon requires rigid socket')
        if j.mode=='continuous_mesh':require(any(m.layerId in j.layerIds for m in p.meshes),'Continuous mode requires actual mesh')
        if j.mode=='overlap_only':require(j.kind in ('elbow','knee') and all(any(part.jointId==j.id and part.role==role for part in p.characterParts) for role in ('upper','lower')),'Overlap mode requires authored segments')
        require(j.upperBoneId in bones and j.lowerBoneId in bones and all(x in layers for x in j.layerIds),'Joint references invalid')
        require(len(j.layerIds)==len(set(j.layerIds)),'Duplicate joint layer')
        if j.kind in ('elbow','knee'):require(bones[j.lowerBoneId].parentId==j.upperBoneId,'Joint bones not adjacent')
    if p.jointValidation:
        require(all(x in joints for x in p.jointValidation.jointIds) and all(i.jointId in joints for i in p.jointValidation.issues),'Report references invalid')

class SideGenerationSpec(StrictModel):
    characterView: Literal['side_3_4']='side_3_4'
    facing: Literal['right']='right'
    movementMode: Literal['horizontal']='horizontal'
    fullBody: Literal[True]=True
    neutralPose: Literal[True]=True
    separateNearFarLimbs: Literal[True]=True
    preserveOccludedRegions: Literal[True]=True
    perspective: Literal['mild']='mild'
class AnatomicalEditRequest(StrictModel):
    projectId: UUID
    sourceAssetId: UUID
    baseRevision: int = Field(ge=0)
    anatomy: Literal['near_arm','far_arm','near_leg','far_leg','hair_front','hair_back','torso','cape','armor','weapon']
    preserveSourcePixels: Literal[True]
    preserveOccludedRegions: Literal[True]
    overlapPixels: int = Field(ge=0,le=48)
    underlapPixels: int = Field(ge=0,le=48)
    generation: SideGenerationSpec
