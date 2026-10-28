"""Phase 1 local API. No configured external services or AI provider required."""
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
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from PIL import Image, UnidentifiedImageError

MAX_BODY = 28 * 1024 * 1024
DATA = Path(os.getenv('A2DSTUDIO_DATA_DIR', str(Path(__file__).parent / 'data')))
app = FastAPI(title='AI 2D Asset Studio', version='0.1.0')

class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)

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

class ProjectDocument(StrictModel):
    schemaVersion: Literal[1]
    projectId: UUID
    metadata: Metadata
    characterDefinitions: list[Character] = Field(max_length=10)
    assetReferences: list[Asset] = Field(max_length=128)
    layers: list[Layer] = Field(max_length=1000)
    hierarchy: list[Hierarchy] = Field(max_length=1000)
    skeletons: list = Field(max_length=0)
    bones: list = Field(max_length=0)
    meshes: list = Field(max_length=0)
    vertexWeights: list = Field(max_length=0)
    equipmentSlots: list = Field(max_length=0)
    attachments: list = Field(max_length=0)
    animationClips: list = Field(max_length=0)
    keyframeTracks: list = Field(max_length=0)
    animationEvents: list = Field(max_length=0)
    vfxGraphs: list = Field(max_length=0)
    aiJobReferences: list = Field(max_length=0)
    revisionHistory: list[Revision] = Field(max_length=100)

    @model_validator(mode='after')
    def references_valid(self):
        ids = [self.projectId] + [x.id for x in self.characterDefinitions + self.assetReferences + self.layers + self.revisionHistory]
        if len(ids) != len(set(ids)):
            raise ValueError('ID bị trùng')
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
    return {'status': 'ok', 'version': '0.1.0', 'storage': 'local', 'ai': 'not-configured'}

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
