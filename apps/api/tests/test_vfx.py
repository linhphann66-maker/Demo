from copy import deepcopy
from uuid import uuid4
import pytest
from test_api import client, document

def effect():
    return dict(version=1,id=str(uuid4()),name='Fire',enabled=True,duration=2,loopMode='loop',seed=42,intensity=1,
      metadata=dict(provenance='procedural',description='Editable particles'),
      nodes=[dict(id=str(uuid4()),type='ParticleEmitter',name='Fire',enabled=True,position=dict(x=0,y=0),rotation=-90,rate=90,burst=8,maxParticles=256,lifetime=.65,speed=65,spread=55,acceleration=dict(x=0,y=-35),drag=1,size=9,endScale=.05,angularVelocity=90,color='#ff6600',endColor='#ffff77',opacity=.9,shape='line',radius=18,blendMode='add',space='local',attachment=dict(boneId=None,offset=dict(x=0,y=0),rotation=0,scale=1,followRotation=True,followScale=True))])

def test_editable_vfx_api_roundtrip(client,document):
    d=deepcopy(document);d['vfxGraphs']=[effect()];uri='/api/projects/'+d['projectId']
    r=client.put(uri,json=d);assert r.status_code==200,r.text
    assert client.get(uri).json()['vfxGraphs']==d['vfxGraphs']

@pytest.mark.parametrize('case',['missing-bone','unknown-node','nan-range','duplicate','over-budget','unknown-version'])
def test_invalid_vfx_rejected(client,document,case):
    d=deepcopy(document);e=effect();n=e['nodes'][0];d['vfxGraphs']=[e]
    if case=='missing-bone':n['attachment']['boneId']=str(uuid4())
    if case=='unknown-node':n['type']='TrailRenderer'
    if case=='nan-range':n['rate']=-1
    if case=='duplicate':n['id']=e['id']
    if case=='over-budget':e['nodes']=[{**deepcopy(n),'id':str(uuid4()),'maxParticles':1024} for _ in range(3)]
    if case=='unknown-version':e['version']=2
    assert client.put('/api/projects/'+d['projectId'],json=d).status_code==422
