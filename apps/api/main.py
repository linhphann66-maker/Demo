"""Phase 3 local API. No configured external services or AI provider required."""
import base64
import io
import json
import os
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Literal
from uuid import UUID

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from pydantic import Field, model_validator, model_serializer
from PIL import Image, UnidentifiedImageError

MAX_BODY = 28 * 1024 * 1024
DATA = Path(os.getenv('A2DSTUDIO_DATA_DIR', str(Path(__file__).parent / 'data')))
app = FastAPI(title='AI 2D Asset Studio', version='0.5.0')

try:
    from .rig_models import StrictModel, Skeleton, Bone, EditableMesh, VertexWeight, Attachment, EquipmentSlot, IKTarget, RigSettings, validate_rig
except ImportError:
    from rig_models import StrictModel, Skeleton, Bone, EditableMesh, VertexWeight, Attachment, EquipmentSlot, IKTarget, RigSettings, validate_rig

try:
    from .animation_models import AnimationClip, AnimationTrack, AnimationEvent, validate_animations
except ImportError:
    from animation_models import AnimationClip, AnimationTrack, AnimationEvent, validate_animations

try:
    from .character_models import CharacterSettings, CharacterVariant, CharacterPart, CharacterJoint, JointReport, validate_character, AnatomicalEditRequest
except ImportError:
    from character_models import CharacterSettings, CharacterVariant, CharacterPart, CharacterJoint, JointReport, validate_character, AnatomicalEditRequest

try:
    from .vfx_models import VFXEffect, OptionalVFX, effect_ids, validate_vfx
except ImportError:
    from vfx_models import VFXEffect, OptionalVFX, effect_ids, validate_vfx

try:
    from .builder_models import CharacterBuild, validate_builder
except ImportError:
    from builder_models import CharacterBuild, validate_builder

class Asset(StrictModel):
    id: UUID
    name: str = Field(min_length=1, max_length=100)
    provenance: Literal['procedural', 'user-created', 'ai-generated', 'template-based']
    kind: Literal['source', 'derived']
    dependencies: list[UUID] = Field(max_length=128)
    data: str = Field(max_length=12_000_000)
    width: int = Field(ge=1, le=4096)
    height: int = Field(ge=1, le=4096)

    @model_validator(mode='after')
    def image_valid(self):
        try:
            header, encoded = self.data.split(',', 1)
            mime = {'data:image/png;base64': 'PNG', 'data:image/jpeg;base64': 'JPEG', 'data:image/webp;base64': 'WEBP'}[header]
            raw = base64.b64decode(encoded, validate=True)
            if len(raw) > 8 * 1024 * 1024:
                raise ValueError('Ảnh vượt 8 MiB')
            with Image.open(io.BytesIO(raw)) as image:
                if image.format != mime or image.size != (self.width, self.height):
                    raise ValueError('Định dạng hoặc kích thước ảnh không khớp')
                image.verify()
        except (KeyError, ValueError, OSError, UnidentifiedImageError, Image.DecompressionBombError) as exc:
            raise ValueError('Ảnh nguồn không hợp lệ; chỉ hỗ trợ PNG/JPEG/WebP') from exc
        return self

class Layer(StrictModel):
    id: UUID
    assetId: UUID
    parentId: UUID | None
    name: str = Field(min_length=1, max_length=100)
    visible: bool
    locked: bool
    opacity: float = Field(ge=0, le=1)
    x: float = Field(ge=-10000, le=10000)
    y: float = Field(ge=-10000, le=10000)
    rotation: float = Field(ge=-3600, le=3600)
    scaleX: float = Field(ge=0.01, le=20)
    scaleY: float = Field(ge=0.01, le=20)
    pivotX: float | None = Field(default=None,ge=-4096,le=4096)
    pivotY: float | None = Field(default=None,ge=-4096,le=4096)
    @model_serializer(mode='wrap')
    def optional_pivots(self,handler):
        result=handler(self)
        for key in ('pivotX','pivotY'):
            if getattr(self,key) is None:result.pop(key,None)
        return result

class Metadata(StrictModel):
    name: str = Field(min_length=1, max_length=100)
    createdAt: datetime
    updatedAt: datetime
    revision: int = Field(ge=0)

class Character(StrictModel):
    id: UUID
    name: str
    class_: str = Field(alias='class')
    style: str
    description: str
    plannedAnimations: list[str]
    autoRig: bool
    autoMesh: bool
    autoVfx: bool

class Hierarchy(StrictModel):
    layerId: UUID
    parentId: UUID | None

class Revision(StrictModel):
    id: UUID
    at: datetime
    label: str = Field(max_length=120)

class ProjectDocument(OptionalVFX):
    schemaVersion: Literal[4]
    characterBuild: CharacterBuild | None = None
    characterSettings: CharacterSettings
    characterVariants: list[CharacterVariant] = Field(max_length=2)
    characterParts: list[CharacterPart] = Field(max_length=1000)
    characterJoints: list[CharacterJoint] = Field(max_length=128)
    jointValidation: JointReport | None
    projectId: UUID
    metadata: Metadata
    characterDefinitions: list[Character] = Field(max_length=10)
    assetReferences: list[Asset] = Field(max_length=128)
    layers: list[Layer] = Field(max_length=1000)
    hierarchy: list[Hierarchy] = Field(max_length=1000)
    skeletons: list[Skeleton] = Field(max_length=16)
    bones: list[Bone] = Field(max_length=256)
    meshes: list[EditableMesh] = Field(max_length=128)
    vertexWeights: list[VertexWeight] = Field(max_length=16384)
    equipmentSlots: list[EquipmentSlot] = Field(max_length=128)
    attachments: list[Attachment] = Field(max_length=1000)
    ikTargets: list[IKTarget] = Field(max_length=128)
    rigSettings: RigSettings
    animationClips: list[AnimationClip] = Field(max_length=64)
    keyframeTracks: list[AnimationTrack] = Field(max_length=4096)
    animationEvents: list[AnimationEvent] = Field(max_length=8192)
    vfxGraphs: list[VFXEffect] = Field(max_length=32)
    vfxPresets: list[VFXEffect] | None = Field(default=None,max_length=64)
    aiJobReferences: list = Field(max_length=0)
    revisionHistory: list[Revision] = Field(max_length=100)

    @model_validator(mode='before')
    @classmethod
    def migrate(cls, data):
        if not isinstance(data,dict):return data
        data=dict(data)
        if data.get('schemaVersion') in (0,1):data.update(schemaVersion=2,ikTargets=[],rigSettings={'mode':'rest'})
        if data.get('schemaVersion')==2:data['schemaVersion']=3
        if data.get('schemaVersion')==3:
            data.update(schemaVersion=4,characterSettings={'characterView':'front','defaultFacing':'right','facing':'right','movementMode':'horizontal','mirrorForOppositeDirection':True,'enableVerticalFacing':False,'worldPosition':{'x':0,'y':0}},characterVariants=[],characterParts=[],characterJoints=[],jointValidation=None)
        return data

    @model_validator(mode='after')
    def references_valid(self):
        ids = [self.projectId] + [x.id for x in self.characterDefinitions + self.assetReferences + self.layers + self.revisionHistory + self.skeletons + self.bones + self.meshes + self.vertexWeights + self.attachments + self.equipmentSlots + self.ikTargets + self.animationClips + self.keyframeTracks + self.animationEvents + [k for t in self.keyframeTracks for k in t.keyframes] + [v for m in self.meshes for v in m.vertices]]
        ids += [x.id for x in self.characterVariants+self.characterParts+self.characterJoints]
        if self.jointValidation:ids += [self.jointValidation.id]+[i.id for i in self.jointValidation.issues]
        ids += [i for e in self.vfxGraphs+(self.vfxPresets or []) for i in effect_ids(e)]
        validate_vfx(self)
        ids += validate_builder(self)
        if len(ids) != len(set(ids)):
            raise ValueError('ID bị trùng')
        validate_rig(self)
        validate_animations(self)
        validate_character(self)
        assets = {a.id: a for a in self.assetReferences}
        if sum(len(base64.b64decode(a.data.split(',', 1)[1])) for a in assets.values()) > 24 * 1024 * 1024:
            raise ValueError('Tổng ảnh vượt 24 MiB')
        for asset in assets.values():
            seen = set()
            frontier = list(asset.dependencies)
            while frontier:
                node = frontier.pop()
                if node == asset.id or node not in assets:
                    raise ValueError('Tham chiếu tài nguyên không hợp lệ')
                if node not in seen:
                    seen.add(node)
                    frontier.extend(assets[node].dependencies)
        layers = {l.id: l for l in self.layers}
        for layer in self.layers:
            if layer.assetId not in assets:
                raise ValueError('Không tìm thấy ảnh nguồn')
            seen = {layer.id}
            parent = layer.parentId
            while parent:
                if parent in seen or parent not in layers:
                    raise ValueError('Cấu trúc lớp không hợp lệ')
                seen.add(parent)
                parent = layers[parent].parentId
        if len(self.hierarchy) != len(self.layers) or len({h.layerId for h in self.hierarchy}) != len(self.layers) or any(h.layerId not in layers or layers[h.layerId].parentId != h.parentId for h in self.hierarchy):
            raise ValueError('Cấu trúc lớp không đồng bộ')
        return self

@app.middleware('http')
async def limit_request(request: Request, call_next):
    # Count actual streamed bytes, independent of an untrusted Content-Length.
    if request.method in ('POST', 'PUT', 'PATCH'):
        data = bytearray()
        async for chunk in request.stream():
            data.extend(chunk)
            if len(data) > MAX_BODY:
                return JSONResponse(status_code=413, content={'detail': 'Tệp vượt giới hạn cho phép'})
        request._body = bytes(data)
    return await call_next(request)

@app.exception_handler(RequestValidationError)
async def invalid_request(request, exc):
    # Never echo uploaded data URLs in validation errors.
    return JSONResponse(status_code=422, content={'detail': 'Dữ liệu dự án không hợp lệ', 'errors': [{'path': '.'.join(map(str, e['loc'])), 'message': e['msg']} for e in exc.errors()]})

def path_for(project_id: UUID):
    return DATA / f'{project_id}.json'

def atomic_save(path: Path, data: bytes):
    DATA.mkdir(parents=True, exist_ok=True)
    temp = None
    try:
        with tempfile.NamedTemporaryFile(dir=DATA, delete=False) as f:
            temp = f.name
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp, path)
    finally:
        if temp and os.path.exists(temp):
            os.unlink(temp)

def read_project(project_id: UUID):
    try:
        return ProjectDocument.model_validate_json(path_for(project_id).read_bytes())
    except FileNotFoundError:
        raise HTTPException(404, 'Không tìm thấy dự án')
    except ValueError:
        raise HTTPException(422, 'Bản lưu dự án bị lỗi')

@app.get('/api/health')
def health():
    return {'status': 'ok', 'version': '0.4.0', 'storage': 'local', 'ai': 'not-configured'}

@app.get('/api/projects')
def list_projects():
    if not DATA.exists():
        return []
    result = []
    for path in DATA.glob('*.json'):
        try:
            d = ProjectDocument.model_validate_json(path.read_bytes())
            result.append({'projectId': str(d.projectId), 'metadata': d.metadata.model_dump(mode='json')})
        except ValueError:
            continue
    return result

@app.put('/api/projects/{project_id}')
def save_project(project_id: UUID, document: ProjectDocument):
    if project_id != document.projectId:
        raise HTTPException(409, 'ID dự án không khớp')
    try:
        atomic_save(path_for(project_id), document.model_dump_json(by_alias=True).encode())
    except OSError:
        raise HTTPException(507, 'Không thể ghi dự án vào ổ đĩa')
    return {'projectId': str(project_id), 'revision': document.metadata.revision, 'saved': True}

@app.get('/api/projects/{project_id}')
def get_project(project_id: UUID):
    return JSONResponse(content=read_project(project_id).model_dump(mode='json', by_alias=True))

@app.get('/api/projects/{project_id}/assets/{asset_id}')
def get_asset(project_id: UUID, asset_id: UUID):
    document = read_project(project_id)
    asset = next((a for a in document.assetReferences if a.id == asset_id), None)
    if asset is None:
        raise HTTPException(404, 'Không tìm thấy tài nguyên')
    return asset

@app.get('/api/projects/{project_id}/export')
def export_project(project_id: UUID):
    doc = read_project(project_id)
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('project.json', doc.model_dump_json(by_alias=True))
    return Response(stream.getvalue(), media_type='application/zip', headers={'Content-Disposition': f'attachment; filename="{project_id}.a2dstudio"'})

@app.get('/api/ai/capabilities')
def capabilities():
    return {'providers': [], 'capabilities': [], 'available': False, 'reason': 'AI chưa được cấu hình. Tích hợp nhà cung cấp thuộc Phase 05.'}

@app.post('/api/ai/jobs')
def create_job():
    raise HTTPException(503, 'Chưa có nhà cung cấp AI. Không tạo công việc giả lập.')

@app.get('/api/ai/side-character-contract')
def side_character_contract():
    return {'available':False,'provider':None,'canonicalFacing':'right','characterView':'side_3_4','movementMode':'horizontal','preserveOccludedRegions':True,'requestSchema':AnatomicalEditRequest.model_json_schema(),'reason':'Contract only; no AI provider configured.'}

@app.post('/api/ai/segmentation')
@app.post('/api/ai/inpainting')
def anatomical_edit(request: AnatomicalEditRequest):
    raise HTTPException(503,'Chưa có AI provider. Procedural joint completion chạy riêng trong editor; không giả lập job AI.')


# Optional real model gateway. Browser procedural operations do not require this API.
try:
    from .builder_provider import BuilderJobs, ModelRequest, ProviderUnavailable
except ImportError:
    from builder_provider import BuilderJobs, ModelRequest, ProviderUnavailable
builder_jobs=BuilderJobs()
@app.get('/api/builder/providers')
def builder_provider_status():return builder_jobs.provider.status()
@app.post('/api/builder/jobs',status_code=202)
def create_builder_job(request:ModelRequest):
    try:return builder_jobs.submit(request)
    except ProviderUnavailable as error:raise HTTPException(503,str(error))
    except OverflowError as error:raise HTTPException(429,str(error))
@app.get('/api/builder/jobs/{job_id}')
def get_builder_job(job_id:UUID):
    try:return builder_jobs.view(str(job_id))
    except KeyError:raise HTTPException(404,'Job không tồn tại hoặc đã hết hạn')
@app.post('/api/builder/jobs/{job_id}/cancel')
def cancel_builder_job(job_id:UUID):
    try:return builder_jobs.cancel(str(job_id))
    except KeyError:raise HTTPException(404,'Job không tồn tại')
@app.post('/api/builder/jobs/{job_id}/retry',status_code=202)
def retry_builder_job(job_id:UUID):
    try:return builder_jobs.retry(str(job_id))
    except KeyError:raise HTTPException(404,'Job không tồn tại')
    except ValueError as error:raise HTTPException(409,str(error))
    except ProviderUnavailable as error:raise HTTPException(503,str(error))
    except OverflowError as error:raise HTTPException(429,str(error))
app.add_event_handler('shutdown',builder_jobs.shutdown)

# BYOK is isolated from the legacy project/gateway API; no browser-provided user ID is trusted.
try:
    from .gemini_api import router as gemini_router, AIError, ai_error_handler
except ImportError:
    from gemini_api import router as gemini_router, AIError, ai_error_handler
app.include_router(gemini_router)
app.add_exception_handler(AIError,ai_error_handler)
