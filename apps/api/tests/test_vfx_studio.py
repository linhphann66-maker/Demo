from copy import deepcopy
from uuid import uuid4
import pytest
from test_api import client,document
from test_vfx import effect

def extended(document):
    e=effect();a=deepcopy(e['nodes'][0]['attachment']);a.update(followPosition=True,fixedPosition={'x':0,'y':0})
    e['trails']=[dict(id=str(uuid4()),type='TrailRenderer',name='Ribbon',enabled=True,base=deepcopy(a),tip={**deepcopy(a),'offset':{'x':100,'y':0}},width=100,lifetime=.2,sampleRate=60,segmentLimit=64,color='#ffaa00',endColor='#ff3300',opacity=1,taper=.9,smoothing=True,blendMode='add',textureId=None)]
    e['flipbooks']=[dict(id=str(uuid4()),type='FlipbookAnimation',name='Frame',enabled=True,assetId=document['assetReferences'][0]['id'],frames=[dict(x=0,y=0,w=1,h=1)],fps=12,loop=True,frameOffset=0,opacity=1,scale=1,rotation=0,attachment=deepcopy(a),blendMode='normal')]
    e['filters']=[dict(id=str(uuid4()),type='GlowEffect',enabled=True,intensity=3,color='#ffffff',opacity=1,position={'x':0,'y':0},rotation=0,scale=1)]
    e['tracks']=[dict(id=str(uuid4()),targetId=e['id'],channel='intensity',keys=[dict(id=str(uuid4()),time=0,value=1,interpolation='bezier',handles=dict(x1=.2,y1=0,x2=.8,y2=1)),dict(id=str(uuid4()),time=1,value=3,interpolation='linear')])]
    e['nodes'][0]['scaleOverLife']=[dict(id=str(uuid4()),time=0,value=1,interpolation='linear'),dict(id=str(uuid4()),time=1,value=0,interpolation='linear')]
    return e

def test_extended_vfx_roundtrip_with_textures_and_presets(client,document):
    d=deepcopy(document);d['vfxGraphs']=[extended(document)];p=effect();p['name']='Library preset';d['vfxPresets']=[p];uri='/api/projects/'+d['projectId'];r=client.put(uri,json=d);assert r.status_code==200,r.text
    loaded=client.get(uri).json()
    assert loaded['vfxGraphs']==d['vfxGraphs'];assert loaded['vfxPresets']==d['vfxPresets'];assert loaded['assetReferences']==d['assetReferences']

@pytest.mark.parametrize('case',['duplicate-trail','missing-tip-bone','missing-texture','outside-frame','duplicate-key','key-time','key-range','key-reference','curve-time','curve-value','trigger','unknown-field','frame-offset','sprite-texture'])
def test_invalid_studio_data_rejected(client,document,case):
    d=deepcopy(document);e=extended(document);d['vfxGraphs']=[e]
    if case=='duplicate-trail':e['trails'][0]['id']=e['id']
    if case=='missing-tip-bone':e['trails'][0]['tip']['boneId']=str(uuid4())
    if case=='missing-texture':e['trails'][0]['textureId']=str(uuid4())
    if case=='outside-frame':e['flipbooks'][0]['frames'][0]['w']=2
    if case=='duplicate-key':e['tracks'][0]['keys'][1]['id']=e['tracks'][0]['keys'][0]['id']
    if case=='key-time':e['tracks'][0]['keys'][1]['time']=0
    if case=='key-range':e['tracks'][0]['keys'][1]['value']=-1
    if case=='key-reference':e['tracks'][0]['targetId']=str(uuid4())
    if case=='curve-time':e['nodes'][0]['scaleOverLife'][1]['time']=2
    if case=='curve-value':e['nodes'][0]['scaleOverLife'][1]['value']=-1
    if case=='trigger':e['trigger']=dict(clipId=str(uuid4()),startEventId=None,stopEventId=None,delay=0,mode='continuous')
    if case=='unknown-field':e['trails'][0]['script']='bad'
    if case=='frame-offset':e['flipbooks'][0]['frameOffset']=2
    if case=='sprite-texture':e['nodes'][0]['type']='SpriteEmitter'
    assert client.put('/api/projects/'+d['projectId'],json=d).status_code==422
