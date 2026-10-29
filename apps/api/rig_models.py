"""Validated editable Phase 2 records. No AI provider dependency."""
from typing import Literal
from math import hypot
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_serializer

class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)

class Transform(StrictModel):
    x: float = Field(ge=-10000, le=10000)
    y: float = Field(ge=-10000, le=10000)
    rotation: float = Field(ge=-3600, le=3600)
    scaleX: float | None = Field(default=None,ge=.05,le=10)
    scaleY: float | None = Field(default=None,ge=.05,le=10)
    @model_serializer(mode='wrap')
    def optional_scale(self,handler):
        result=handler(self)
        for key in ('scaleX','scaleY'):
            if getattr(self,key) is None:result.pop(key,None)
        return result

class JointConstraints(StrictModel):
    minRotation: float = Field(ge=-180, le=180)
    maxRotation: float = Field(ge=-180, le=180)

class Skeleton(StrictModel):
    id: UUID
    name: str = Field(min_length=1, max_length=100)
    provenance: Literal['procedural', 'user-created']
    template: str | None = Field(max_length=100)

class Bone(StrictModel):
    id: UUID
    skeletonId: UUID
    parentId: UUID | None
    name: str = Field(min_length=1, max_length=100)
    rest: Transform
    pose: Transform
    length: float = Field(ge=1, le=5000)
    constraints: JointConstraints

class Attachment(StrictModel):
    id: UUID
    layerId: UUID
    boneId: UUID

class EquipmentSlot(StrictModel):
    id: UUID
    name: str = Field(min_length=1, max_length=100)
    boneId: UUID

class IKTarget(StrictModel):
    id: UUID
    rootBoneId: UUID
    midBoneId: UUID
    endBoneId: UUID
    x: float = Field(ge=-10000, le=10000)
    y: float = Field(ge=-10000, le=10000)
    bend: Literal[-1, 1]
    enabled: bool
    blend: float | None = Field(default=None,ge=0,le=1)
    @model_serializer(mode='wrap')
    def optional_blend(self,handler):
        result=handler(self)
        if self.blend is None:result.pop('blend',None)
        return result

class Vertex(StrictModel):
    id: UUID
    x: float = Field(ge=-10000, le=10000)
    y: float = Field(ge=-10000, le=10000)
    u: float = Field(ge=0, le=1)
    v: float = Field(ge=0, le=1)

class BindMatrix(StrictModel):
    a: float
    b: float
    c: float
    d: float
    tx: float = Field(ge=-10000, le=10000)
    ty: float = Field(ge=-10000, le=10000)

class AlphaMask(StrictModel):
    width: int = Field(ge=1, le=128)
    height: int = Field(ge=1, le=128)
    data: list[Literal[0, 1]] = Field(max_length=16384)

class EditableMesh(StrictModel):
    id: UUID
    layerId: UUID
    sourceAssetId: UUID
    vertices: list[Vertex] = Field(min_length=3, max_length=512)
    triangles: list[int] = Field(min_length=3, max_length=6000)
    boneIds: list[UUID] = Field(max_length=128)
    bindMatrix: BindMatrix
    alphaMask: AlphaMask

class Influence(StrictModel):
    boneId: UUID
    weight: float = Field(gt=0, le=1)

class VertexWeight(StrictModel):
    id: UUID
    meshId: UUID
    vertexId: UUID
    influences: list[Influence] = Field(min_length=1, max_length=4)

class RigSettings(StrictModel):
    mode: Literal['rest', 'pose']

def validate_rig(doc):
    bones = {b.id: b for b in doc.bones}
    skeletons = {s.id for s in doc.skeletons}
    layers = {l.id: l for l in doc.layers}
    meshes = {m.id: m for m in doc.meshes}
    for b in doc.bones:
        if b.skeletonId not in skeletons:
            raise ValueError('Skeleton không tồn tại')
        if b.constraints.minRotation > b.constraints.maxRotation or not b.constraints.minRotation-1e-6 <= b.pose.rotation <= b.constraints.maxRotation+1e-6:
            raise ValueError('Pose vượt giới hạn góc khớp')
        parent, seen = b.parentId, {b.id}
        while parent:
            node = bones.get(parent)
            if node is None or node.skeletonId != b.skeletonId or parent in seen:
                raise ValueError('Xương cha không hợp lệ hoặc có vòng lặp')
            seen.add(parent)
            parent = node.parentId
    if len({a.layerId for a in doc.attachments}) != len(doc.attachments):
        raise ValueError('Một layer chỉ gắn vào một xương')
    for a in doc.attachments:
        if a.layerId not in layers or a.boneId not in bones:
            raise ValueError('Attachment không hợp lệ')
    for slot in doc.equipmentSlots:
        if slot.boneId not in bones:
            raise ValueError('Socket không hợp lệ')
    if len({t.endBoneId for t in doc.ikTargets}) != len(doc.ikTargets):
        raise ValueError('IK effector bị trùng')
    for t in doc.ikTargets:
        root, mid, end = (bones.get(i) for i in (t.rootBoneId, t.midBoneId, t.endBoneId))
        if not root or not mid or not end or mid.parentId != root.id or end.parentId != mid.id:
            raise ValueError('Chuỗi IK không hợp lệ')
        if min(hypot(mid.rest.x,mid.rest.y),hypot(end.rest.x,end.rest.y),hypot(mid.rest.x+mid.pose.x,mid.rest.y+mid.pose.y),hypot(end.rest.x+end.pose.x,end.rest.y+end.pose.y)) < 1e-5:
            raise ValueError('IK cần hai đoạn có độ dài lớn hơn 0')
    if len({m.layerId for m in doc.meshes}) != len(doc.meshes) or sum(len(m.vertices) for m in doc.meshes) > 16384:
        raise ValueError('Mesh bị trùng hoặc vượt giới hạn')
    for m in doc.meshes:
        if m.layerId not in layers or layers[m.layerId].assetId != m.sourceAssetId:
            raise ValueError('Mesh source không khớp')
        if len(m.alphaMask.data) != m.alphaMask.width*m.alphaMask.height:
            raise ValueError('Alpha mask không khớp')
        bind = m.bindMatrix
        if abs(bind.a*bind.d-bind.b*bind.c) < 1e-8:
            raise ValueError('Bind matrix suy biến')
        if len(set(m.boneIds)) != len(m.boneIds) or any(i not in bones for i in m.boneIds) or len({bones[i].skeletonId for i in m.boneIds}) > 1:
            raise ValueError('Mesh bone không hợp lệ')
        if len(m.triangles) % 3:
            raise ValueError('Indices phải là bộ ba')
        seen = set()
        for offset in range(0, len(m.triangles), 3):
            tri = m.triangles[offset:offset+3]
            if len(set(tri)) != 3 or any(i < 0 or i >= len(m.vertices) for i in tri) or tuple(sorted(tri)) in seen:
                raise ValueError('Triangle indices không hợp lệ')
            seen.add(tuple(sorted(tri)))
            a, b, c = (m.vertices[i] for i in tri)
            area = (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)
            uv = (b.u-a.u)*(c.v-a.v)-(b.v-a.v)*(c.u-a.u)
            if abs(area) < 1e-5 or abs(uv) < 1e-10 or area*uv <= 0:
                raise ValueError('Tam giác lật hoặc suy biến')
    pairs = set()
    for w in doc.vertexWeights:
        m = meshes.get(w.meshId)
        key = (w.meshId, w.vertexId)
        if key in pairs or not m or not any(v.id == w.vertexId for v in m.vertices) or any(i.boneId not in m.boneIds for i in w.influences) or len({i.boneId for i in w.influences}) != len(w.influences) or abs(sum(i.weight for i in w.influences)-1) > 1e-5:
            raise ValueError('Weights không hợp lệ hoặc tổng khác 1')
        pairs.add(key)
    for m in doc.meshes:
        if m.boneIds and any((m.id, v.id) not in pairs for v in m.vertices):
            raise ValueError('Vertex thiếu weights')
