"""Same-origin, temporary server sessions. No account identity is assumed by FastAPI.

The session key is AES-GCM encrypted in bounded RAM with an ephemeral process key.
There is deliberately no disk credential persistence until account auth is supplied.
"""
import base64, hashlib, json, secrets, threading, time
from concurrent.futures import ThreadPoolExecutor
from uuid import UUID, uuid4
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse
try:
    from .gemini_models import KeySettings, AnalyzeRequest, VISION, IMAGE
    from .gemini_provider import GeminiProvider, AIError, safe_error
except ImportError:
    from gemini_models import KeySettings, AnalyzeRequest, VISION, IMAGE
    from gemini_provider import GeminiProvider, AIError, safe_error

router=APIRouter(prefix='/api/ai')
provider=GeminiProvider()
sessions={}
active=set()
lock=threading.RLock()
cipher=AESGCM(AESGCM.generate_key(bit_length=256))
pool=ThreadPoolExecutor(max_workers=2,thread_name_prefix='gemini')
TTL=3600
COOKIE='a2d_ai_session'
EMPTY_CAPS=dict(imageUnderstanding=False,structuredOutput=False,imageEditing=False,imageGeneration=False)

def now():return time.time()
def session(request,create=False):
    # Never trust user IDs supplied in headers/body on this unauthenticated local API.
    origin=request.headers.get('origin')
    expected=str(request.base_url).rstrip('/')
    if origin and origin!=expected:raise AIError('forbidden_origin','Origin không được phép.',403)
    if request.headers.get('sec-fetch-site') in ('cross-site','same-site'):raise AIError('forbidden_origin','Chỉ hỗ trợ yêu cầu cùng origin.',403)
    with lock:
        for sid in list(sessions):
            if sessions[sid]['expires']<=now():sessions.pop(sid,None)
        sid=request.cookies.get(COOKIE)
        s=sessions.get(sid)
        if not s:
            if not create:raise AIError('session_expired','Phiên AI hết hạn. Mở lại AI Settings và nhập key.',401)
            if len(sessions)>=128:raise AIError('rate_limited','Server đã đủ phiên; thử lại sau.',429)
            sid=secrets.token_urlsafe(32)
            s=dict(id=sid,csrf=secrets.token_urlsafe(32),expires=now()+TTL,key=None,visionModel=VISION,imageModel=IMAGE,models=[],caps=EMPTY_CAPS.copy(),availability=dict(vision=False,image=False),status='not_configured',jobs={},cache={},usage=[],calls=[],fingerprint=None,tested=None)
            sessions[sid]=s
        if request.method not in ('GET','HEAD'):
            if not secrets.compare_digest(request.headers.get('x-csrf-token',''),s['csrf']):raise AIError('csrf_rejected','Phiên hoặc CSRF token không hợp lệ.',403)
        return s

def rate(s):
    with lock:
        s['calls']=[t for t in s['calls'] if now()-t<60]
        if len(s['calls'])>=10:raise AIError('rate_limited','Tối đa 10 yêu cầu AI/phút/phiên.',429)
        s['calls'].append(now())
def encrypt(s,value):
    nonce=secrets.token_bytes(12)
    return nonce+cipher.encrypt(nonce,value.encode(),s['id'].encode())
def key(s):
    if not s['key']:raise AIError('missing_key','Chưa cấu hình Gemini API key.',400)
    value=s['key']
    return cipher.decrypt(value[:12],value[12:],s['id'].encode()).decode()
def settings(s):
    return dict(configured=bool(s['key']),csrfToken=s['csrf'],visionModel=s['visionModel'],imageModel=s['imageModel'],persistenceSupported=False,storageMode='temporary-session',expiresAt=int(s['expires']*1000),status=s['status'],models=s['models'],modelAvailability=s['availability'],capabilities=s['caps'],usage=s['usage'][-50:],reason='Key chỉ được mã hóa trong RAM của server, tối đa một giờ. Restart server sẽ kết thúc phiên. Chưa có account auth để lưu qua nhiều phiên.')

def cookie(response,s,request):
    response.headers['Cache-Control']='no-store'
    response.set_cookie(COOKIE,s['id'],max_age=TTL,httponly=True,secure=request.url.scheme=='https',samesite='strict',path='/api/ai')
def record(s,operation,model,usage,cached=False):
    s['usage']=(s['usage']+[dict(operation=operation,model=model,at=int(now()*1000),cached=cached,**usage)])[-50:]
@router.get('/settings')
def get_settings(request:Request,response:Response):
    s=session(request,True);cookie(response,s,request)
    return settings(s)
@router.post('/key/test')
def test_key(body:KeySettings,request:Request):
    s=session(request);rate(s)
    value=body.apiKey.get_secret_value() if body.apiKey else key(s)
    models=provider.models(value)
    available={m['id'] for m in models}
    availability=dict(vision=body.visionModel in available,image=body.imageModel in available)
    caps=EMPTY_CAPS.copy()
    if availability['vision']:
        usage=provider.probe(value,body.visionModel)
        caps.update(imageUnderstanding=True,structuredOutput=True)
        record(s,'connection_probe',body.visionModel,usage)
    s['tested']=dict(models=models,visionModel=body.visionModel,imageModel=body.imageModel,availability=availability,caps=caps,status='connected' if availability['vision'] else 'model_unavailable',fingerprint=hashlib.sha256(value.encode()).hexdigest())
    return settings(dict(s,**s['tested']))
@router.put('/key')
def save_key(body:KeySettings,request:Request):
    s=session(request);rate(s)
    if body.persist:raise AIError('persistence_unavailable','Chưa có account auth và database vault; chỉ hỗ trợ phiên server tạm thời.',409)
    value=body.apiKey.get_secret_value() if body.apiKey else key(s)
    fingerprint=hashlib.sha256(value.encode()).hexdigest()
    tested=s['tested']
    if tested and tested['fingerprint']==fingerprint and tested['visionModel']==body.visionModel and tested['imageModel']==body.imageModel:s.update(tested)
    elif s['fingerprint']!=fingerprint or s['visionModel']!=body.visionModel:
        s.update(caps=EMPTY_CAPS.copy(),models=[],availability=dict(vision=False,image=False),status='not_tested')
    elif s['imageModel']!=body.imageModel:s['availability']['image']=False
    with lock:
        for job in s['jobs'].values():
            if job['state'] in ('queued','running'):job.update(state='cancelled',progress=1)
        s.update(key=encrypt(s,value),visionModel=body.visionModel,imageModel=body.imageModel,cache={},fingerprint=fingerprint)
    return settings(s)
@router.delete('/key')
def delete_key(request:Request):
    s=session(request)
    for job in s['jobs'].values():
        if job['state'] in ('queued','running'):job.update(state='cancelled',progress=1)
    s.update(key=None,models=[],caps=EMPTY_CAPS.copy(),availability=dict(vision=False,image=False),cache={},fingerprint=None,tested=None,status='not_configured')
    return settings(s)
@router.get('/models')
def models(request:Request):
    s=session(request);rate(s)
    s['models']=provider.models(key(s))
    available={m['id'] for m in s['models']}
    s['availability']=dict(vision=s['visionModel'] in available,image=s['imageModel'] in available)
    return settings(s)

def job_for(s,job_id):
    job=s['jobs'].get(str(job_id))
    if not job:raise AIError('job_not_found','Job không tồn tại trong phiên này.',404)
    return job
def work(s,job,body,cache_id,model):
    with lock:
        if job['state']=='cancelled':return
        job.update(state='running',progress=.15)
    try:
        result,usage=provider.analyze(key(s),model,body)
        with lock:
            if job['state']=='cancelled' or s['expires']<=now() or not s['key']:return
            s['cache'][cache_id]=(now(),result)
            if len(s['cache'])>8:s['cache'].pop(next(iter(s['cache'])))
            record(s,'character_analysis',model,usage)
            job.update(state='succeeded',progress=1,result=dict(analysis=result,model=model,cached=False))
    except Exception as error:
        safe=safe_error(error)
        with lock:
            if job['state']!='cancelled':job.update(state='failed',progress=1,error=safe.message,errorCode=safe.code)
@router.post('/character/analyze',status_code=202)
@router.post('/character/assemble-plan',status_code=202)
def analyze(body:AnalyzeRequest,request:Request):
    s=session(request);rate(s);key(s)
    if not s['caps']['imageUnderstanding'] or not s['caps']['structuredOutput']:raise AIError('not_tested','Kiểm tra kết nối vision và structured output trước.',409)
    cache_id=hashlib.sha256((s['visionModel']+body.model_dump_json()).encode()).hexdigest()
    with lock:
        if any(owner==s['id'] for owner,id in active):raise AIError('busy','Một job đang chạy trong phiên này.',429)
        if len(active)>=2:raise AIError('busy','Server đang đủ 2 job đồng thời.',429)
        job=dict(id=str(uuid4()),state='queued',progress=0,result=None,error=None)
        s['jobs'][job['id']]=job
        if len(s['jobs'])>16:s['jobs'].pop(next(iter(s['jobs'])))
        cached=s['cache'].get(cache_id)
        if cached and now()-cached[0]<900:
            job.update(state='succeeded',progress=1,result=dict(analysis=cached[1],model=s['visionModel'],cached=True))
            record(s,'character_analysis',s['visionModel'],dict(inputTokens=0,outputTokens=0),True)
        else:
            marker=(s['id'],job['id']);active.add(marker)
            future=pool.submit(work,s,job,body,cache_id,s['visionModel'])
            def release(future):
                with lock:active.discard(marker)
            future.add_done_callback(release)
        return dict(job)
@router.get('/jobs/{job_id}')
def get_job(job_id:UUID,request:Request):return dict(job_for(session(request),job_id))
@router.post('/jobs/{job_id}/run')
def run_job(job_id:UUID,request:Request):return dict(job_for(session(request),job_id))
@router.post('/jobs/{job_id}/cancel')
def cancel_job(job_id:UUID,request:Request):
    s=session(request)
    with lock:
        job=job_for(s,job_id)
        if job['state'] in ('queued','running'):job.update(state='cancelled',progress=1)
        return dict(job)
@router.post('/joint/repair')
def repair_not_ready(request:Request):
    session(request)
    raise AIError('not_implemented','Luồng duyệt patch/ảnh-mask cho AI vẽ bù khớp chưa hoàn tất; chưa phát sinh lệnh tạo ảnh trả phí.',501)

async def ai_error_handler(request,error:AIError):
    return JSONResponse(status_code=error.status,content=dict(code=error.code,detail=error.message),headers={'Cache-Control':'no-store'})
