"""Project-owned fixture and mock gateway tests. No real model invocation is claimed."""
from copy import deepcopy
from uuid import uuid4
from pathlib import Path
import base64,io,time,threading,json
import httpx,pytest
from PIL import Image
from pydantic import ValidationError
from test_api import client,document
import main
from builder_provider import RemoteVisionProvider,ModelRequest,BuilderJobs,ModelResult,ProviderUnavailable,InputImage


def request_data():
    image=Image.new('RGBA',(16,16),(255,255,255,255));out=io.BytesIO();image.save(out,format='PNG');source=str(uuid4());candidate=str(uuid4())
    return dict(capability='classification',images=[dict(id=source,name='head',width=16,height=16,data='data:image/png;base64,'+base64.b64encode(out.getvalue()).decode())],candidateIds=[candidate],parts=[dict(candidateId=candidate,sourceAssetId=source,bbox=dict(x=0,y=0,width=16,height=16),mask=dict(width=1,height=1,data=[255]),label='unknown',confidence=.2,orientation='unknown',warnings=[])],consent=True)

def builder_document(document):
    d=deepcopy(document);source=d['assetReferences'][0];preview=deepcopy(source);preview.update(id=str(uuid4()),kind='derived',dependencies=[source['id']]);d['assetReferences'].append(preview);c=dict(id=str(uuid4()),sourceAssetId=source['id'],previewAssetId=preview['id'],label='head',confidence=.45,bbox=dict(x=0,y=0,width=1,height=1),mask=dict(width=1,height=1,data=[255]),orientation='unknown',warnings=['heuristic'],method='manual',rejected=False,material='soft');d['characterBuild']=dict(id=str(uuid4()),version=2,mode='sheet',sourceAssetIds=[source['id']],candidates=[c],selection={s:c['id'] if s=='head' else None for s in ['head','hair','torso','left_arm','right_arm','left_leg','right_leg']},layerMappings=[],method='procedural',provider=None,warnings=[],approved=False);return d

def test_builder_partial_project_roundtrip(client,document):
    d=builder_document(document);uri='/api/projects/'+d['projectId'];r=client.put(uri,json=d);assert r.status_code==200,r.text
    assert client.get(uri).json()['characterBuild']==d['characterBuild']

@pytest.mark.parametrize('case',['source','bounds','mask','duplicate','rejected','approved','mapping','global-id'])
def test_builder_corruption_rejected(client,document,case):
    d=builder_document(document);b=d['characterBuild'];c=b['candidates'][0]
    if case=='source':c['sourceAssetId']=str(uuid4())
    if case=='bounds':c['bbox']['width']=2
    if case=='mask':c['mask']['data']=[]
    if case=='duplicate':b['selection']['hair']=c['id']
    if case=='rejected':c['rejected']=True
    if case=='approved':b['approved']=True
    if case=='mapping':b['layerMappings']=[dict(slot='head',candidateId=c['id'],layerId=str(uuid4()))]
    if case=='global-id':c['id']=d['projectId'];b['selection']['head']=c['id']
    assert client.put('/api/projects/'+d['projectId'],json=d).status_code==422

def test_real_browser_assembled_project_roundtrip(client):
    path=Path(__file__).resolve().parents[3]/'work/phase5ab-real-project.json'
    # This artifact is produced by the separately executed browser test, never a checked-in user asset.
    if not path.exists():pytest.skip('Run browser builder workflow to produce editable artifact')
    d=json.loads(path.read_text());uri='/api/projects/'+d['projectId'];r=client.put(uri,json=d);assert r.status_code==200,r.text
    loaded=client.get(uri).json()
    for field in ['bones','meshes','vertexWeights','characterJoints','animationClips','keyframeTracks','assetReferences']:assert loaded[field]==d[field]
    assert loaded['characterBuild']['version']==2
    assert 'face' not in loaded['characterBuild']['selection']
    from datetime import datetime
    assert datetime.fromisoformat(loaded['jointValidation']['createdAt'])==datetime.fromisoformat(d['jointValidation']['createdAt'])
    assert {k:v for k,v in loaded['jointValidation'].items() if k!='createdAt'}=={k:v for k,v in d['jointValidation'].items() if k!='createdAt'}

def test_unconfigured_provider_is_explicitly_unavailable(client,monkeypatch):
    jobs=BuilderJobs(RemoteVisionProvider(url=''));monkeypatch.setattr(main,'builder_jobs',jobs)
    try:
        status=client.get('/api/builder/providers').json();assert not status['ready'];assert status['capabilities']==[]
        r=client.post('/api/builder/jobs',json=request_data());assert r.status_code==503;assert not jobs.jobs
        assert client.get('/api/builder/jobs/'+str(uuid4())).status_code==404
        assert client.post('/api/builder/jobs/'+str(uuid4())+'/cancel').status_code==404
    finally:jobs.shutdown()

@pytest.mark.parametrize('case',['consent','mime','dimensions','mask','reference','id'])
def test_request_validation(case):
    d=request_data()
    if case=='consent':d['consent']=False
    if case=='mime':d['images'][0]['data']=d['images'][0]['data'].replace('image/png','image/jpeg')
    if case=='dimensions':d['images'][0]['width']=4096
    if case=='mask':d['parts'][0]['mask']['data']=[]
    if case=='reference':d['parts'][0]['sourceAssetId']=str(uuid4())
    if case=='id':d['parts'][0]['candidateId']=str(uuid4())
    with pytest.raises(ValidationError):ModelRequest.model_validate(d)

def gateway(handler):return RemoteVisionProvider('https://test-model.invalid','server-only-test-secret',httpx.MockTransport(handler))

def test_gateway_contract_passes_stable_ids_and_server_only_auth():
    data=request_data();calls=[]
    def handle(request):
        assert request.headers['Authorization']=='Bearer server-only-test-secret';calls.append(request.url.path)
        if request.url.path=='/capabilities':return httpx.Response(200,json=dict(ready=True,providerId='mock-contract',model='test',capabilities=['classification']))
        body=json.loads(request.content);assert body['parts'][0]['candidateId']==data['candidateIds'][0]
        return httpx.Response(200,json=dict(providerId='mock-contract',model='test',classifications=[dict(candidateId=data['candidateIds'][0],label='head',confidence=.9,orientation='right',warnings=[])]))
    provider=gateway(handle);result=provider.process(ModelRequest.model_validate(data),threading.Event());assert result.classifications[0].label=='head';assert calls==['/capabilities','/process'];assert 'secret' not in json.dumps(provider.status())

@pytest.mark.parametrize('case',['missing-output','bad-ref','raw-error','http-error','timeout','bad-mask'])
def test_provider_errors_are_recoverable_and_sanitized(case):
    data=request_data()
    def handle(request):
        if request.url.path=='/capabilities':return httpx.Response(200,json=dict(ready=True,capabilities=['classification']))
        if case=='http-error':return httpx.Response(500,text='secret-upstream-content')
        if case=='timeout':raise httpx.ReadTimeout('secret-upstream-content',request=request)
        if case=='raw-error':return httpx.Response(200,json=dict(invalid='secret-upstream-content'))
        if case=='bad-mask':return httpx.Response(200,json=dict(providerId='test',model='test',parts=[dict(sourceAssetId=data['images'][0]['id'],bbox=dict(x=0,y=0,width=16,height=16),mask=dict(width=1,height=1,data=[]),label='head',confidence=.9,orientation='right',warnings=[])]))
        return httpx.Response(200,json=dict(providerId='test',model='test',classifications=[] if case=='missing-output' else [dict(candidateId=str(uuid4()),label='head',confidence=.9,orientation='right',warnings=[])]))
    with pytest.raises((ValueError,RuntimeError,TimeoutError)) as error:gateway(handle).process(ModelRequest.model_validate(data),threading.Event())
    assert 'secret-upstream-content' not in str(error.value)

def test_provider_rejects_insecure_url(monkeypatch):
    monkeypatch.delenv('A2DSTUDIO_BUILDER_ALLOW_LOCAL',raising=False);assert not RemoteVisionProvider('http://example.org').status()['ready'];assert not RemoteVisionProvider('https://user:password@example.org').status()['ready']

class TestProvider:
    __test__=False
    def __init__(self,block=False,fail=False):self.block=block;self.fail=fail;self.started=threading.Event();self.release=threading.Event()
    def status(self):return dict(ready=True,capabilities=['classification'],reason=None)
    def process(self,request,cancel):
        self.started.set()
        if self.block:self.release.wait(timeout=3)
        if self.fail:raise TimeoutError('Test timeout')
        return ModelResult(providerId='test',model='mock',classifications=[dict(candidateId=request.candidateIds[0],label='head',confidence=.9,orientation='right',warnings=[])])

def terminal(jobs,id):
    deadline=time.monotonic()+3
    while time.monotonic()<deadline:
        j=jobs.view(id)
        if j['state'] in ['succeeded','failed','cancelled']:return j
        time.sleep(.005)
    raise AssertionError('job did not terminate')

def test_jobs_cancel_discard_late_output_and_bound_resource_queue():
    provider=TestProvider(block=True);jobs=BuilderJobs(provider);request=ModelRequest.model_validate(request_data())
    try:
        ids=[jobs.submit(request)['id'] for _ in range(8)];assert provider.started.wait(1)
        with pytest.raises(OverflowError):jobs.submit(request)
        jobs.cancel(ids[0]);assert jobs.view(ids[0])['state']=='cancelled'
        with pytest.raises(OverflowError):jobs.submit(request)
        provider.release.set()
        for id in ids[1:]:assert terminal(jobs,id)['state']=='succeeded'
        assert jobs.view(ids[0])['result'] is None
        assert 'request' not in jobs.view(ids[1]);assert 'future' not in jobs.view(ids[1])
    finally:provider.release.set();jobs.shutdown()

def test_failed_job_can_be_retried_once_and_progress_is_real():
    provider=TestProvider(fail=True);jobs=BuilderJobs(provider);request=ModelRequest.model_validate(request_data())
    try:
        first=jobs.submit(request);assert terminal(jobs,first['id'])['state']=='failed';retry=jobs.retry(first['id']);assert terminal(jobs,retry['id'])['state']=='failed'
        with pytest.raises(ValueError):jobs.retry(retry['id'])
        with pytest.raises(ValueError):jobs.retry(first['id'])
    finally:jobs.shutdown()

@pytest.mark.parametrize('capability',['segmentation','background_removal','inpainting','landmarks','assembly'])
def test_other_provider_capabilities_use_validated_real_http_contracts(capability):
    data=request_data();data['capability']=capability
    def handle(request):
        if request.url.path=='/capabilities':return httpx.Response(200,json=dict(ready=True,providerId='contract-only',model='mock',capabilities=[capability]))
        output=dict(providerId='contract-only',model='mock')
        if capability=='segmentation':output['parts']=[{k:v for k,v in data['parts'][0].items() if k!='candidateId'}]
        if capability in ['background_removal','inpainting']:output['image']=data['images'][0]
        if capability=='landmarks':output['landmarks']=[dict(sourceAssetId=data['images'][0]['id'],name='Head',x=8,y=8,confidence=.9)]
        if capability=='assembly':output['assembly']=[dict(candidateId=data['candidateIds'][0],slot='head',x=400,y=200,rotation=5,scale=1)]
        return httpx.Response(200,json=output)
    result=gateway(handle).process(ModelRequest.model_validate(data),threading.Event());assert result.providerId=='contract-only'

@pytest.mark.parametrize('case',['segmentation-bounds','image-rgb','image-size','duplicate-slot','landmark-bounds'])
def test_provider_rejects_invalid_resources_before_output_approval(case):
    data=request_data();cap='segmentation' if case=='segmentation-bounds' else 'assembly' if case=='duplicate-slot' else 'landmarks' if case=='landmark-bounds' else 'inpainting';data['capability']=cap
    def handle(request):
        if request.url.path=='/capabilities':return httpx.Response(200,json=dict(ready=True,capabilities=[cap]))
        output=dict(providerId='contract-only',model='mock')
        if case=='segmentation-bounds':
            part={k:v for k,v in data['parts'][0].items() if k!='candidateId'};part['bbox']['width']=17;output['parts']=[part]
        if case=='duplicate-slot':output['assembly']=[dict(candidateId=data['candidateIds'][0],slot='head',x=400,y=200,rotation=0,scale=1)]*2
        if case=='landmark-bounds':output['landmarks']=[dict(sourceAssetId=data['images'][0]['id'],name='Head',x=100,y=8,confidence=.9)]
        if case in ['image-rgb','image-size']:
            size=8 if case=='image-size' else 16;image=Image.new('RGB' if case=='image-rgb' else 'RGBA',(size,size),'white');stream=io.BytesIO();image.save(stream,format='PNG');output['image']=dict(id=str(uuid4()),name='generated',width=size,height=size,data='data:image/png;base64,'+base64.b64encode(stream.getvalue()).decode())
        return httpx.Response(200,json=output)
    with pytest.raises(ValueError):gateway(handle).process(ModelRequest.model_validate(data),threading.Event())

def test_legacy_face_slot_migrates_without_deleting_old_artwork(client,document):
    d=builder_document(document);b=d['characterBuild'];b['version']=1;c=deepcopy(b['candidates'][0]);c.update(id=str(uuid4()),label='face');b['candidates'].append(c);b['selection']['face']=c['id'];layer=deepcopy(d['layers'][0]);layer['id']=str(uuid4());d['layers'].append(layer);d['hierarchy'].append(dict(layerId=layer['id'],parentId=None));b['layerMappings'].append(dict(slot='face',candidateId=c['id'],layerId=layer['id']));uri='/api/projects/'+d['projectId'];r=client.put(uri,json=d);assert r.status_code==200,r.text
    loaded=client.get(uri).json();assert loaded['characterBuild']['version']==2;assert 'face' not in loaded['characterBuild']['selection'];assert loaded['characterBuild']['legacyFaceLayerIds']==[layer['id']];assert loaded['layers']==d['layers'];assert loaded['assetReferences']==d['assetReferences']

@pytest.mark.parametrize('case',['face','anchor-value','anchor-ref','anchor-duplicate','optional-primary','scale-zero'])
def test_seven_slot_settings_reject_invalid_values(client,document,case):
    d=builder_document(document);b=d['characterBuild'];c=b['candidates'][0]
    b['assembly']=dict(normalized=True,scales={'head':1},anchors=[],warnings=[])
    if case=='face':b['selection']['face']=c['id']
    if case=='anchor-value':b['assembly']['anchors']=[dict(candidateId=c['id'],points={'neck_base':{'x':1.2,'y':0}})]
    if case=='anchor-ref':b['assembly']['anchors']=[dict(candidateId=str(uuid4()),points={})]
    if case=='anchor-duplicate':b['assembly']['anchors']=[dict(candidateId=c['id'],points={})]*2
    if case=='optional-primary':b['optionalAttachments']=[dict(kind='sword',candidateId=c['id'],layerId=None)]
    if case=='scale-zero':b['assembly']['scales']['head']=0
    assert client.put('/api/projects/'+d['projectId'],json=d).status_code==422

def test_seven_slot_provider_rejects_face_label():
    d=request_data();d['parts'][0]['label']='face'
    with pytest.raises(ValidationError):ModelRequest.model_validate(d)

def test_malformed_legacy_builder_rejects_without_server_error(client,document):
    d=builder_document(document);d['characterBuild']['version']=1;d['characterBuild']['layerMappings']=[None]
    assert client.put('/api/projects/'+d['projectId'],json=d).status_code==422
