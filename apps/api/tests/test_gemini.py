"""All Gemini calls are mocked. These tests never use an actual API key."""
import base64,io,json,threading,time
from copy import deepcopy
from uuid import uuid4
from fastapi.testclient import TestClient
from PIL import Image
from pydantic import ValidationError
import pytest
from test_api import client
import main,gemini_api as ai
from gemini_models import AnalyzeRequest,validate_analysis,KeySettings,VISION,IMAGE as IMAGE_MODEL
from gemini_provider import AIError,GeminiProvider,safe_error

KEY='AIza-TEST-KEY-NOT-A-REAL-CREDENTIAL'
SLOTS=['head','hair','torso','left_arm','right_arm','left_leg','right_leg']
def payload():
    output=io.BytesIO();Image.new('RGBA',(16,16),'white').save(output,format='PNG')
    image=dict(id=str(uuid4()),name='test source',width=16,height=16,data='data:image/png;base64,'+base64.b64encode(output.getvalue()).decode())
    return dict(images=[image],overview=dict(image,id=str(uuid4())),candidates=[dict(id=str(uuid4()),sourceAssetId=image['id'],bbox=dict(x=0,y=0,width=16,height=16),image=dict(image,id=str(uuid4()))) for _ in SLOTS],consent=True)
def result(body):
    return dict(viewpoint='side_3_4',facing='right',assignments=[dict(candidateId=str(c.id) if hasattr(c,'id') else c['id'],slot=s,confidence=.93,lateralityCertain=s not in ['left_arm','right_arm'],depth='unknown',warnings=[]) for s,c in zip(SLOTS,body.candidates if hasattr(body,'candidates') else body['candidates'])],ambiguousCandidateIds=[],missingSlots=[],renderOrder=[str(c.id) if hasattr(c,'id') else c['id'] for c in (body.candidates if hasattr(body,'candidates') else body['candidates'])],anchors=[],warnings=[])
class Fake:
    calls=0
    def models(self,key):
        if key=='invalid-test-credential':raise AIError('invalid_key','API key không hợp lệ.',401)
        return [dict(id=m,displayName=m,methods=['generateContent']) for m in (VISION,IMAGE_MODEL)]
    def probe(self,key,model):return dict(inputTokens=1,outputTokens=1)
    def analyze(self,key,model,body):self.calls+=1;return result(body),dict(inputTokens=25,outputTokens=30)
@pytest.fixture(autouse=True)
def isolated(monkeypatch):
    ai.sessions.clear();fake=Fake();monkeypatch.setattr(ai,'provider',fake)
    yield fake
    ai.sessions.clear()
def bootstrap(c):
    r=c.get('/api/ai/settings');assert r.status_code==200
    return {'X-CSRF-Token':r.json()['csrfToken'],'Origin':'http://testserver'}
def configure(c):
    headers=bootstrap(c);body=dict(apiKey=KEY,visionModel=VISION,imageModel=IMAGE_MODEL,persist=False)
    assert c.post('/api/ai/key/test',json=body,headers=headers).status_code==200
    assert c.put('/api/ai/key',json=body,headers=headers).status_code==200
    return headers
def wait(c,id):
    for _ in range(200):
        j=c.get('/api/ai/jobs/'+id).json()
        if j['state'] not in ('queued','running'):return j
        time.sleep(.005)
    raise AssertionError('mock job timed out')

def test_settings_secure_cookie_save_delete_and_no_plaintext(client):
    h=bootstrap(client)
    assert client.get('/api/ai/settings').headers['cache-control']=='no-store'
    cookie=client.get('/api/ai/settings').headers['set-cookie'];assert 'HttpOnly' in cookie and 'SameSite=strict' in cookie
    body=dict(apiKey=KEY,visionModel=VISION,imageModel=IMAGE_MODEL,persist=False)
    test=client.post('/api/ai/key/test',json=body,headers=h);assert test.status_code==200
    assert test.json()['capabilities']==dict(imageUnderstanding=True,structuredOutput=True,imageEditing=False,imageGeneration=False)
    saved=client.put('/api/ai/key',json=body,headers=h);assert saved.json()['configured'];assert KEY not in saved.text
    stored=next(iter(ai.sessions.values()))['key'];assert isinstance(stored,bytes) and KEY.encode() not in stored
    assert client.delete('/api/ai/key',headers=h).json()['configured'] is False
    assert not next(iter(ai.sessions.values()))['key']
    assert KEY not in repr(KeySettings(apiKey=KEY))

def test_invalid_key_missing_key_and_model_unavailable(client):
    h=bootstrap(client)
    assert client.get('/api/ai/models').json()['code']=='missing_key'
    r=client.post('/api/ai/key/test',json=dict(apiKey='invalid-test-credential'),headers=h);assert r.status_code==401 and 'invalid-test-credential' not in r.text
    r=client.post('/api/ai/key/test',json=dict(apiKey=KEY,visionModel='model-that-does-not-exist'),headers=h)
    assert r.json()['status']=='model_unavailable';assert not r.json()['capabilities']['imageUnderstanding']
    assert r.json()['visionModel']=='model-that-does-not-exist'
    assert client.put('/api/ai/key',json=dict(apiKey=KEY,persist=True),headers=h).status_code==409

def test_unsaved_key_test_cannot_change_the_active_key_model_or_capabilities(client):
    h=configure(client)
    tested=client.post('/api/ai/key/test',json=dict(apiKey=KEY+'replacement',visionModel='unavailable-model'),headers=h)
    assert tested.json()['status']=='model_unavailable'
    current=client.get('/api/ai/settings').json()
    assert current['visionModel']==VISION and current['capabilities']['imageUnderstanding']
    s=next(iter(ai.sessions.values()));assert ai.key(s)==KEY
    saved=client.put('/api/ai/key',json=dict(apiKey=KEY+'replacement',visionModel='unavailable-model'),headers=h)
    assert saved.json()['visionModel']=='unavailable-model' and not saved.json()['capabilities']['imageUnderstanding']
    assert ai.key(s)==KEY+'replacement'

def test_csrf_cors_session_and_untrusted_client_identity(client):
    h=configure(client)
    assert client.delete('/api/ai/key').status_code==403
    assert client.delete('/api/ai/key',headers={**h,'Origin':'https://evil.example'}).status_code==403
    assert client.post('/api/ai/key/test',headers={**h,'Sec-Fetch-Site':'cross-site'},json=dict(apiKey=KEY)).status_code==403
    other=TestClient(main.app)
    assert other.get('/api/ai/models',headers={'oai-authenticated-user-id':'stolen-id'}).status_code==401
    assert other.get('/api/ai/settings').json()['configured'] is False
    ai.sessions[next(iter(ai.sessions))]['expires']=0
    assert client.get('/api/ai/models').json()['code']=='session_expired'
    assert client.get('/api/ai/settings').json()['configured'] is False

def test_analysis_seven_slots_cache_jobs_and_owner_isolation(client,isolated):
    h=configure(client);body=payload()
    job=client.post('/api/ai/character/analyze',json=body,headers=h);assert job.status_code==202,job.text
    done=wait(client,job.json()['id']);assert done['state']=='succeeded';assert len(done['result']['analysis']['assignments'])==7
    other=TestClient(main.app);oh=bootstrap(other)
    assert other.get('/api/ai/jobs/'+done['id']).status_code==404
    assert other.post('/api/ai/jobs/'+done['id']+'/cancel',headers=oh).status_code==404
    cached=client.post('/api/ai/character/analyze',json=body,headers=h).json()
    assert cached['result']['cached'] is True;assert isolated.calls==1
    assert KEY not in json.dumps(done)

@pytest.mark.parametrize('case',['invented-id','reused-part','duplicate-slot','face','missing-mismatch','anchor','render-order'])
def test_model_output_is_strict(case):
    p=AnalyzeRequest.model_validate(payload());r=result(p)
    if case=='invented-id':r['assignments'][0]['candidateId']=str(uuid4())
    if case=='reused-part':r['assignments'][1]['candidateId']=r['assignments'][0]['candidateId']
    if case=='duplicate-slot':r['assignments'][1]['slot']='head'
    if case=='face':r['assignments'][0]['slot']='face'
    if case=='missing-mismatch':r['missingSlots']=['torso']
    if case=='anchor':r['anchors']=[dict(candidateId=str(uuid4()),name='neck_anchor',x=.5,y=.2)]
    if case=='render-order':r['renderOrder']=[r['renderOrder'][0]]*2
    with pytest.raises((ValueError,ValidationError)):validate_analysis(r,p)

@pytest.mark.parametrize('case',['mime','dimensions','duplicate','bounds','consent'])
def test_images_and_request_references(client,case):
    h=configure(client);body=payload()
    if case=='mime':body['overview']['data']=body['overview']['data'].replace('image/png','image/jpeg')
    if case=='dimensions':body['overview']['width']=4096
    if case=='duplicate':body['candidates'][1]['id']=body['candidates'][0]['id']
    if case=='bounds':body['candidates'][0]['bbox']['x']=100
    if case=='consent':body['consent']=False
    r=client.post('/api/ai/character/analyze',json=body,headers=h);assert r.status_code==422;assert 'data:image' not in r.text and KEY not in r.text

def test_cancellation_discards_results_and_resets_capabilities_on_key_change(client,monkeypatch):
    entered=threading.Event();release=threading.Event()
    fake=Fake()
    def block(key,model,body):entered.set();release.wait(2);return result(body),dict(inputTokens=0,outputTokens=0)
    monkeypatch.setattr(fake,'analyze',block);monkeypatch.setattr(ai,'provider',fake)
    h=configure(client)
    id=client.post('/api/ai/character/analyze',json=payload(),headers=h).json()['id'];assert entered.wait(1)
    assert client.post('/api/ai/character/analyze',json=payload(),headers=h).status_code==429
    assert client.post('/api/ai/jobs/'+id+'/cancel',headers=h).json()['state']=='cancelled'
    release.set();assert wait(client,id)['result'] is None
    changed=client.put('/api/ai/key',json=dict(apiKey=KEY+'different'),headers=h).json()
    assert changed['capabilities']['imageUnderstanding'] is False

def test_rate_limit_and_unfinished_image_generation_is_honest(client):
    h=bootstrap(client)
    for _ in range(10):assert client.post('/api/ai/key/test',headers=h,json=dict(apiKey=KEY)).status_code==200
    assert client.post('/api/ai/key/test',headers=h,json=dict(apiKey=KEY)).status_code==429
    assert client.post('/api/ai/joint/repair',headers=h).status_code==501

@pytest.mark.parametrize('code,expected',[(401,'invalid_key'),(404,'model_unavailable'),(429,'quota_exceeded'),(402,'billing_required'),(503,'server_error')])
def test_provider_errors_are_sanitized(code,expected):
    error=Exception('raw upstream '+KEY);error.code=code
    safe=safe_error(error);assert safe.code==expected;assert KEY not in safe.message

def test_official_sdk_adapter_receives_images_ids_and_pydantic_schema(monkeypatch):
    from types import SimpleNamespace
    p=AnalyzeRequest.model_validate(payload());calls=[]
    class Client:
        def __enter__(self):return self
        def __exit__(self,*args):pass
        @property
        def models(self):return self
        def generate_content(self,**kwargs):
            calls.append(kwargs)
            return SimpleNamespace(text=json.dumps(result(p)),usage_metadata=SimpleNamespace(prompt_token_count=11,candidates_token_count=22))
    provider=GeminiProvider();monkeypatch.setattr(provider,'client',lambda k:Client())
    r,usage=provider.analyze(KEY,VISION,p)
    assert len(r['assignments'])==7 and usage['inputTokens']==11
    call=calls[0];assert call['model']==VISION;assert call['config'].response_json_schema['properties']['assignments']
    assert str(p.candidates[0].id) in ' '.join(x for x in call['contents'] if isinstance(x,str))
    assert sum(not isinstance(x,str) for x in call['contents'])==9

def test_connection_probe_contains_a_decodable_png_and_does_not_mark_image_generation_ready(monkeypatch):
    from types import SimpleNamespace
    seen=[]
    class Client:
        def __enter__(self):return self
        def __exit__(self,*args):pass
        @property
        def models(self):return self
        def generate_content(self,**kwargs):
            part=kwargs['contents'][1]
            with Image.open(io.BytesIO(part.inline_data.data)) as image:image.verify()
            seen.append(kwargs['model'])
            return SimpleNamespace(text='{"imageSeen":true}',usage_metadata=SimpleNamespace(prompt_token_count=2,candidates_token_count=3))
    provider=GeminiProvider();monkeypatch.setattr(provider,'client',lambda key:Client())
    assert provider.probe(KEY,VISION)==dict(inputTokens=2,outputTokens=3)
    assert seen==[VISION]

def test_real_browser_ai_character_project_preserves_review_masks_rig_and_meshes(client):
    from pathlib import Path
    artifact=Path(__file__).resolve().parents[3]/'work/gemini/ai-character.json'
    if not artifact.exists():pytest.skip('Run tests/gemini.spec.ts to create browser artifact')
    d=json.loads(artifact.read_text());uri='/api/projects/'+d['projectId']
    response=client.put(uri,json=d);assert response.status_code==200,response.text
    loaded=client.get(uri).json()
    for field in ['characterBuild','layers','assetReferences','bones','meshes','vertexWeights','keyframeTracks']:assert loaded[field]==d[field]
    assert loaded['characterBuild']['aiReview']['model']==VISION
    assert len(loaded['characterBuild']['selection'])==7
    assert KEY not in json.dumps(loaded)
