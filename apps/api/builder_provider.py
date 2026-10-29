"""Real HTTP model gateway adapter. No fallback responses or fabricated AI jobs."""
import os,time,base64,io,threading,json
from urllib.parse import urlsplit
from concurrent.futures import ThreadPoolExecutor
from typing import Literal,Annotated
from uuid import UUID,uuid4
import httpx
from PIL import Image,UnidentifiedImageError
from pydantic import Field,model_validator,ValidationError
try:
    from .rig_models import StrictModel
    from .builder_models import CandidateBox,CandidateMask,Slot
except ImportError:
    from rig_models import StrictModel
    from builder_models import CandidateBox,CandidateMask,Slot
Capability=Literal['classification','segmentation','background_removal','inpainting','landmarks','assembly']
CAPABILITIES=['classification','segmentation','background_removal','inpainting','landmarks','assembly']
class InputImage(StrictModel):
    id:UUID
    name:str=Field(min_length=1,max_length=100)
    width:int=Field(ge=1,le=4096)
    height:int=Field(ge=1,le=4096)
    data:str=Field(max_length=12_000_000)
    @model_validator(mode='after')
    def image_valid(self):
        try:
            header,value=self.data.split(',',1);expected={'data:image/png;base64':'PNG','data:image/jpeg;base64':'JPEG','data:image/webp;base64':'WEBP'}[header];raw=base64.b64decode(value,validate=True)
            if len(raw)>8*1024*1024:raise ValueError('Image exceeds 8 MiB')
            with Image.open(io.BytesIO(raw)) as image:
                if image.format!=expected or image.size!=(self.width,self.height):raise ValueError('Image metadata mismatch')
                image.verify()
            with Image.open(io.BytesIO(raw)) as decoded:decoded.load()
        except (KeyError,ValueError,OSError,UnidentifiedImageError,Image.DecompressionBombError) as error:raise ValueError('Invalid PNG/JPEG/WebP source') from error
        return self
class ModelPart(StrictModel):
    sourceAssetId:UUID
    bbox:CandidateBox
    mask:CandidateMask
    label:Literal['head','hair','torso','left_arm','right_arm','left_leg','right_leg','unknown']
    confidence:float=Field(ge=0,le=1)
    orientation:Literal['right','left','unknown']
    warnings:list[Annotated[str,Field(max_length=300)]]=Field(max_length=16)
class InputPart(ModelPart):
    candidateId:UUID

class ClassifiedPart(StrictModel):
    candidateId:UUID
    label:Literal['head','hair','torso','left_arm','right_arm','left_leg','right_leg','unknown']
    confidence:float=Field(ge=0,le=1)
    orientation:Literal['right','left','unknown']
    warnings:list[Annotated[str,Field(max_length=300)]]=Field(max_length=16)
class Landmark(StrictModel):
    sourceAssetId:UUID
    name:str=Field(min_length=1,max_length=100)
    x:float=Field(ge=0,le=4096)
    y:float=Field(ge=0,le=4096)
    confidence:float=Field(ge=0,le=1)
class AssemblyPlacement(StrictModel):
    candidateId:UUID
    slot:Slot
    x:float=Field(ge=-10000,le=10000)
    y:float=Field(ge=-10000,le=10000)
    rotation:float=Field(ge=-3600,le=3600)
    scale:float=Field(ge=.01,le=20)
class ModelResult(StrictModel):
    providerId:str=Field(min_length=1,max_length=100)
    model:str=Field(min_length=1,max_length=100)
    parts:list[ModelPart]=Field(default_factory=list,max_length=64)
    classifications:list[ClassifiedPart]=Field(default_factory=list,max_length=64)
    image:InputImage|None=None
    landmarks:list[Landmark]=Field(default_factory=list,max_length=64)
    assembly:list[AssemblyPlacement]=Field(default_factory=list,max_length=7)
class ModelRequest(StrictModel):
    capability:Capability
    images:list[InputImage]=Field(min_length=1,max_length=16)
    candidateIds:list[UUID]=Field(default_factory=list,max_length=64)
    parts:list[InputPart]=Field(default_factory=list,max_length=64)
    consent:bool
    @model_validator(mode='after')
    def limits(self):
        if not self.consent:raise ValueError('Explicit image/provider consent is required')
        if len({a.id for a in self.images})!=len(self.images):raise ValueError('Duplicate image IDs')
        if sum(a.width*a.height for a in self.images)>32*1024*1024:raise ValueError('Images exceed 32 megapixels')
        if sum(len(a.data.split(',',1)[1])*3//4 for a in self.images)>8*1024*1024:raise ValueError('Total images exceed 8 MiB')
        sources={a.id:a for a in self.images}
        if len(set(self.candidateIds))!=len(self.candidateIds):raise ValueError('Duplicate candidate IDs')
        for p in self.parts:
            if p.candidateId not in self.candidateIds:raise ValueError('Input part ID missing')
            a=sources.get(p.sourceAssetId)
            if not a or p.bbox.x+p.bbox.width>a.width or p.bbox.y+p.bbox.height>a.height:raise ValueError('Part exceeds source')
        return self
class ProviderUnavailable(Exception):pass
class RemoteVisionProvider:
    """Gateway protocol: GET /capabilities; POST /process validated JSON request.
    The owner configures the actual model gateway; this class never substitutes heuristics.
    """
    def __init__(self,url=None,token=None,transport=None):
        self.url=(url if url is not None else os.getenv('A2DSTUDIO_BUILDER_PROVIDER_URL','')).rstrip('/')
        self.token=token if token is not None else os.getenv('A2DSTUDIO_BUILDER_PROVIDER_TOKEN','')
        self.transport=transport
    def client(self):return httpx.Client(timeout=httpx.Timeout(60,connect=5),transport=self.transport,headers={'Authorization':'Bearer '+self.token} if self.token else {})
    def status(self):
        if not self.url:return dict(configured=False,ready=False,capabilities=[],providerId=None,model=None,reason='Chưa cấu hình segmentation/classification/inpainting provider thật')
        parsed=urlsplit(self.url)
        if not parsed.hostname or parsed.username or parsed.password or (parsed.scheme!='https' and not (os.getenv('A2DSTUDIO_BUILDER_ALLOW_LOCAL')=='1' and parsed.scheme=='http' and parsed.hostname in ['127.0.0.1','localhost','::1'])):return dict(configured=True,ready=False,capabilities=[],providerId=None,model=None,reason='Provider URL cần HTTPS (localhost chỉ khi cho phép rõ ràng)')
        try:
            with self.client() as client:r=client.get(self.url+'/capabilities',timeout=5);r.raise_for_status();data=r.json()
            if not isinstance(data,dict) or not isinstance(data.get('capabilities'),list):raise ValueError('Invalid provider capabilities')
            capabilities=[c for c in data.get('capabilities',[]) if c in CAPABILITIES]
            return dict(configured=True,ready=bool(data.get('ready') and capabilities),capabilities=capabilities,providerId=str(data.get('providerId','configured-provider'))[:100],model=str(data.get('model',''))[:100],reason=None if capabilities else 'Gateway chưa công bố capability được hỗ trợ')
        except (httpx.HTTPError,ValueError):return dict(configured=True,ready=False,capabilities=[],providerId=None,model=None,reason='Không kết nối được model gateway; kiểm tra cấu hình server')
    def process(self,request:ModelRequest,cancel:threading.Event):
        if cancel.is_set():raise InterruptedError()
        status=self.status()
        if not status['ready'] or request.capability not in status['capabilities']:raise ProviderUnavailable('Capability chưa khả dụng ở provider thật')
        try:
            with self.client() as client:
                with client.stream('POST',self.url+'/process',json=request.model_dump(mode='json')) as response:
                    response.raise_for_status();chunks=[];total=0
                    for chunk in response.iter_bytes():
                        if cancel.is_set():raise InterruptedError()
                        total+=len(chunk)
                        if total>24*1024*1024:raise ValueError('Provider response too large')
                        chunks.append(chunk)
                    result=ModelResult.model_validate(json.loads(b''.join(chunks)))
        except ValidationError as error:raise ValueError('Provider result failed schema validation; no output applied') from error
        except httpx.TimeoutException as error:raise TimeoutError('Provider timeout (60s)') from error
        except httpx.HTTPError as error:raise RuntimeError('Provider HTTP error; không công bố nội dung/credential upstream') from error
        if cancel.is_set():raise InterruptedError()
        sources={a.id:a for a in request.images}
        for p in result.parts:
            a=sources.get(p.sourceAssetId)
            if not a or p.bbox.x+p.bbox.width>a.width or p.bbox.y+p.bbox.height>a.height:raise ValueError('Provider mask reference/bounds invalid')
        if any(c.candidateId not in request.candidateIds for c in result.classifications):raise ValueError('Provider classification target invalid')
        for landmark in result.landmarks:
            a=sources.get(landmark.sourceAssetId)
            if not a or landmark.x>a.width or landmark.y>a.height:raise ValueError('Provider landmark invalid')
        if any(p.candidateId not in request.candidateIds for p in result.assembly):raise ValueError('Provider assembly target invalid')
        if len({p.slot for p in result.assembly})!=len(result.assembly):raise ValueError('Duplicate primary assembly slot')
        required={'classification':bool(result.classifications),'segmentation':bool(result.parts),'background_removal':result.image is not None,'inpainting':result.image is not None,'landmarks':bool(result.landmarks),'assembly':bool(result.assembly)}
        if not required[request.capability]:raise ValueError('Provider did not return the requested output')
        if result.image:
            if (result.image.width,result.image.height)!=(request.images[0].width,request.images[0].height):raise ValueError('Generated texture dimensions changed unexpectedly')
            raw=base64.b64decode(result.image.data.split(',',1)[1]);image=Image.open(io.BytesIO(raw))
            if image.format!='PNG' or 'A' not in image.getbands():raise ValueError('Generated texture must be PNG with alpha')
        return result
class BuilderJobs:
    def __init__(self,provider=None):self.provider=provider or RemoteVisionProvider();self.pool=ThreadPoolExecutor(max_workers=2);self.jobs={};self.lock=threading.RLock();self.capacity=threading.BoundedSemaphore(8)
    def submit(self,request:ModelRequest,attempt=1):
        status=self.provider.status()
        if not status['ready'] or request.capability not in status['capabilities']:raise ProviderUnavailable(status.get('reason') or 'Capability unavailable')
        with self.lock:
            if sum(j['state'] in ['queued','running','validating'] for j in self.jobs.values())>=8:raise OverflowError('Tối đa 8 job đang chờ/chạy')
            if len(self.jobs)>=16:
                for key in list(self.jobs):
                    if self.jobs[key]['state'] not in ['queued','running','validating']:del self.jobs[key];break
            if not self.capacity.acquire(blocking=False):raise OverflowError('Tối đa 8 job trong executor, kể cả job hủy đang dọn dẹp')
            id=str(uuid4());cancel=threading.Event();job=dict(id=id,state='queued',progress=0,result=None,error=None,capability=request.capability,createdAt=time.time(),attempt=attempt,cancel=cancel,request=request);self.jobs[id]=job
            job['future']=self.pool.submit(self._run,id);job['future'].add_done_callback(lambda _:self.capacity.release());return self.view(id)
    def _run(self,id):
        with self.lock:job=self.jobs.get(id)
        if not job:return
        try:
            with self.lock:
                if job['cancel'].is_set():return
                job.update(state='running',progress=.15)
            result=self.provider.process(job['request'],job['cancel'])
            with self.lock:
                if job['cancel'].is_set():return
                job.update(state='validating',progress=.9)
                job.update(state='succeeded',progress=1,result=result.model_dump(mode='json'))
        except InterruptedError:job.update(state='cancelled',error='Đã hủy; kết quả muộn sẽ bị bỏ')
        except Exception as error:
            if not job['cancel'].is_set():job.update(state='failed',error=type(error).__name__+': '+str(error)[:300])
    def view(self,id):
        with self.lock:
            job=self.jobs.get(id)
            if not job:raise KeyError(id)
            return {k:v for k,v in job.items() if k not in ['cancel','request','future','retryUsed']}
    def cancel(self,id):
        with self.lock:
            job=self.jobs[id];job['cancel'].set();job.update(state='cancelled',result=None,error='Đã hủy; không áp dụng kết quả muộn');return self.view(id)
    def retry(self,id):
        with self.lock:
            job=self.jobs[id]
            if job['state']!='failed' or job['attempt']>=2 or job.get('retryUsed',False):raise ValueError('Chỉ retry job lỗi một lần, theo yêu cầu người dùng')
            followup=self.submit(job['request'],job['attempt']+1)
            job['retryUsed']=True
            return followup
    def shutdown(self):self.pool.shutdown(wait=False,cancel_futures=True)
