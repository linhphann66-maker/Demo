"""Editable ingestion provenance, independent from renderer/runtime objects."""
from typing import Literal,Annotated
from uuid import UUID
from pydantic import Field,model_validator
try:
    from .rig_models import StrictModel
except ImportError:
    from rig_models import StrictModel
Slot=Literal['head','hair','torso','left_arm','right_arm','left_leg','right_leg']
class CandidateBox(StrictModel):
    x:int=Field(ge=0,le=4095)
    y:int=Field(ge=0,le=4095)
    width:int=Field(ge=1,le=4096)
    height:int=Field(ge=1,le=4096)
class CandidateMask(StrictModel):
    width:int=Field(ge=1,le=128)
    height:int=Field(ge=1,le=128)
    data:list[Annotated[int,Field(ge=0,le=255)]]=Field(max_length=16384)
    @model_validator(mode='after')
    def size_valid(self):
        if len(self.data)!=self.width*self.height:raise ValueError('Invalid candidate mask')
        return self
class CandidateProvider(StrictModel):
    id:str=Field(max_length=100)
    model:str=Field(max_length=100)
    jobId:UUID
    approved:bool

try:
    from .vfx_models import OptionalVFX
except ImportError:
    from vfx_models import OptionalVFX
class PartCandidate(OptionalVFX):
    id:UUID
    sourceAssetId:UUID
    previewAssetId:UUID
    label:Literal['head','hair','torso','left_arm','right_arm','left_leg','right_leg','unknown']
    confidence:float=Field(ge=0,le=1)
    bbox:CandidateBox
    mask:CandidateMask
    orientation:Literal['right','left','unknown']
    warnings:list[Annotated[str,Field(max_length=300)]]=Field(max_length=32)
    method:Literal['alpha_components','solid_background','filename','manual','provider']
    rejected:bool
    provider:CandidateProvider|None=None
    material:Literal['soft','rigid']
    appearance:list[Annotated[int,Field(ge=0,le=65535)]]|None=Field(default=None,min_length=256,max_length=256)
class BuildSelection(StrictModel):
    head:UUID|None
    hair:UUID|None
    torso:UUID|None
    left_arm:UUID|None
    right_arm:UUID|None
    left_leg:UUID|None
    right_leg:UUID|None
class LayerMapping(StrictModel):
    slot:Slot
    candidateId:UUID
    layerId:UUID
class BuilderProvider(StrictModel):
    id:str=Field(max_length=100)
    model:str=Field(max_length=100)
AnchorName=Literal['neck_anchor','left_shoulder_anchor','right_shoulder_anchor','left_hip_anchor','right_hip_anchor','cloak_anchor','weapon_anchor','neck_base','scalp_anchor','shoulder_joint','hip_joint']
class AnchorPoint(StrictModel):
    x:float=Field(ge=0,le=1)
    y:float=Field(ge=0,le=1)
class CandidateAnchors(StrictModel):
    candidateId:UUID
    points:dict[AnchorName,AnchorPoint]
class AssemblySettings(StrictModel):
    normalized:bool
    scales:dict[Slot,Annotated[float,Field(ge=.01,le=20)]]
    anchors:list[CandidateAnchors]=Field(max_length=64)
    warnings:list[Annotated[str,Field(max_length=300)]]=Field(max_length=32)
class OptionalAttachment(StrictModel):
    kind:Literal['cloak','sword']
    candidateId:UUID
    layerId:UUID|None
class AIReviewedAssignment(StrictModel):
    candidateId:UUID
    slot:Slot
    confidence:float=Field(ge=0,le=1)
    lateralityCertain:bool
    depth:Literal['near','far','unknown']
class AIReview(StrictModel):
    model:str=Field(max_length=100)
    jobId:UUID
    at:str=Field(max_length=40)
    viewpoint:Literal['side_3_4','side','front','unknown']
    facing:Literal['right','left','unknown']
    renderOrder:list[UUID]=Field(max_length=48)
    needsReviewCandidateIds:list[UUID]=Field(max_length=48)
    assignments:list[AIReviewedAssignment]=Field(max_length=7)
class CharacterBuild(OptionalVFX):
    version:Literal[2]
    id:UUID
    mode:Literal['sheet','layers','complete']
    sourceAssetIds:list[UUID]=Field(min_length=1,max_length=64)
    candidates:list[PartCandidate]=Field(max_length=64)
    selection:BuildSelection
    layerMappings:list[LayerMapping]=Field(max_length=7)
    method:Literal['procedural','provider','manual']
    provider:BuilderProvider|None
    warnings:list[Annotated[str,Field(max_length=300)]]=Field(max_length=100)
    approved:bool
    assembly:AssemblySettings|None=None
    optionalAttachments:list[OptionalAttachment]|None=Field(default=None,max_length=2)
    legacyFaceLayerIds:list[UUID]|None=Field(default=None,max_length=16)
    aiReview:AIReview|None=None
    @model_validator(mode='before')
    @classmethod
    def migrate(cls,data):
        if not isinstance(data,dict) or data.get('version')!=1:return data
        if not isinstance(data.get('selection'),dict) or not isinstance(data.get('layerMappings'),list) or any(not isinstance(m,dict) or 'layerId' not in m for m in data['layerMappings']) or not isinstance(data.get('candidates'),list) or any(not isinstance(c,dict) or not isinstance(c.get('warnings'),list) for c in data['candidates']):return data
        from copy import deepcopy
        data=deepcopy(data);data['version']=2;data.get('selection',{}).pop('face',None)
        mappings=data.get('layerMappings',[]);data['legacyFaceLayerIds']=[m['layerId'] for m in mappings if m.get('slot')=='face'];data['layerMappings']=[m for m in mappings if m.get('slot')!='face']
        for c in data.get('candidates',[]):
            if c.get('label')=='face':c.update(label='unknown',warnings=(c.get('warnings',[])+['Chi tiết đầu từ dự án cũ; giữ ảnh nguồn, không dùng làm slot chính.'])[:32])
        return data

def validate_builder(p):
    b=p.characterBuild
    if b is None:return []
    ids=[b.id]+[c.id for c in b.candidates]
    assets={a.id:a for a in p.assetReferences};candidates={c.id:c for c in b.candidates};layers={l.id:l for l in p.layers}
    if len(set(ids))!=len(ids):raise ValueError('Duplicate builder IDs')
    for source in b.sourceAssetIds:
        if source not in assets:raise ValueError('Missing builder source')
    for c in b.candidates:
        if c.sourceAssetId not in assets or c.sourceAssetId not in b.sourceAssetIds or c.previewAssetId not in assets:raise ValueError('Missing candidate image')
        source=assets[c.sourceAssetId]
        if c.bbox.x+c.bbox.width>source.width or c.bbox.y+c.bbox.height>source.height:raise ValueError('Candidate exceeds source')
        if c.sourceAssetId not in assets[c.previewAssetId].dependencies:raise ValueError('Missing extraction dependency')
    if b.assembly:
        ids2=[a.candidateId for a in b.assembly.anchors]
        if len(set(ids2))!=len(ids2) or any(id not in candidates for id in ids2):raise ValueError('Invalid anchor candidate')
    extras=b.optionalAttachments or []
    if len({a.kind for a in extras})!=len(extras) or len({a.candidateId for a in extras})!=len(extras):raise ValueError('Duplicate optional attachment')
    for a in extras:
        if a.candidateId not in candidates or candidates[a.candidateId].rejected or a.candidateId in b.selection.model_dump().values() or (a.layerId is not None and a.layerId not in layers):raise ValueError('Invalid optional attachment')
    if any(id not in layers for id in (b.legacyFaceLayerIds or [])):raise ValueError('Missing legacy detail layer')
    if b.aiReview:
        r=b.aiReview
        if any(id not in candidates for id in r.renderOrder+r.needsReviewCandidateIds+[a.candidateId for a in r.assignments]):raise ValueError('Missing AI review candidate')
        if len({a.candidateId for a in r.assignments})!=len(r.assignments) or len({a.slot for a in r.assignments})!=len(r.assignments):raise ValueError('Duplicate AI assignment')
    selected=[v for v in b.selection.model_dump().values() if v is not None]
    if len(selected)!=len(set(selected)):raise ValueError('Duplicate primary selection')
    if any(id not in candidates or candidates[id].rejected for id in selected):raise ValueError('Invalid selected candidate')
    if b.approved and (len(selected)!=7 or len(b.layerMappings)!=7):raise ValueError('Approved builder needs 7 slots')
    if len({m.slot for m in b.layerMappings})!=len(b.layerMappings):raise ValueError('Duplicate mapped slot')
    for m in b.layerMappings:
        if m.layerId not in layers or m.candidateId not in candidates or getattr(b.selection,m.slot)!=m.candidateId:raise ValueError('Invalid assembled mapping')
    return ids
