from copy import deepcopy
from uuid import uuid4
import io
import json
import zipfile
import pytest
from test_api import client, document

@pytest.fixture
def rig_document(document):
    d=deepcopy(document)
    d.update(schemaVersion=2,ikTargets=[],rigSettings={'mode':'pose'})
    sid=str(uuid4())
    d['skeletons']=[{'id':sid,'name':'Test rig','provenance':'procedural','template':'humanoid-v1'}]
    ids=[str(uuid4()) for _ in range(3)]
    d['bones']=[{'id':bid,'skeletonId':sid,'parentId':ids[i-1] if i else None,'name':str(i),'rest':{'x':30 if i else 0,'y':0,'rotation':0},'pose':{'x':0,'y':0,'rotation':10 if i==0 else 0},'length':30,'constraints':{'minRotation':-180,'maxRotation':180}} for i,bid in enumerate(ids)]
    d['attachments']=[{'id':str(uuid4()),'layerId':d['layers'][0]['id'],'boneId':ids[-1]}]
    d['equipmentSlots']=[{'id':str(uuid4()),'name':'Weapon Socket','boneId':ids[-1]}]
    d['ikTargets']=[{'id':str(uuid4()),'rootBoneId':ids[0],'midBoneId':ids[1],'endBoneId':ids[2],'x':50,'y':20,'bend':1,'enabled':True}]
    mid=str(uuid4())
    vertices=[{'id':str(uuid4()),'x':x,'y':y,'u':x,'v':y} for x,y in [(0,0),(1,0),(1,1),(0,1)]]
    d['meshes']=[{'id':mid,'layerId':d['layers'][0]['id'],'sourceAssetId':d['assetReferences'][0]['id'],'vertices':vertices,'triangles':[0,1,2,0,2,3],'boneIds':ids,'bindMatrix':{'a':1,'b':0,'c':0,'d':1,'tx':20,'ty':30},'alphaMask':{'width':2,'height':2,'data':[1,1,1,1]}}]
    d['vertexWeights']=[{'id':str(uuid4()),'meshId':mid,'vertexId':v['id'],'influences':[{'boneId':ids[0],'weight':.25},{'boneId':ids[1],'weight':.75}]} for v in vertices]
    return d

def test_rig_save_reload_and_archive(client,rig_document):
    d=rig_document
    uri='/api/projects/'+d['projectId']
    assert client.put(uri,json=d).status_code==200
    saved=client.get(uri).json()
    for key in ['bones','skeletons','meshes','vertexWeights','attachments','equipmentSlots','ikTargets','rigSettings']:
        assert saved[key]==d[key]
    with zipfile.ZipFile(io.BytesIO(client.get(uri+'/export').content)) as z:
        exported=json.loads(z.read('project.json'))
        assert exported['bones']==d['bones']
        assert exported['meshes']==d['meshes']
        assert exported['schemaVersion']==4

def test_phase1_migration_keeps_original_layers(client,document):
    uri='/api/projects/'+document['projectId']
    assert client.put(uri,json=document).status_code==200
    d=client.get(uri).json()
    assert d['schemaVersion']==4
    assert d['rigSettings']=={'mode':'rest'}
    assert d['layers']==document['layers']

@pytest.mark.parametrize('kind',['cycle','parent','missing-skeleton','ik-chain','bad-index','bad-uv','degenerate','flipped','bad-weights','missing-weights','duplicate-weights','wrong-source','mask','bind','duplicate-id','constraints','zero-ik'])
def test_rejects_invalid_rig(client,rig_document,kind):
    d=rig_document
    if kind=='cycle':d['bones'][0]['parentId']=d['bones'][-1]['id']
    elif kind=='parent':d['bones'][1]['parentId']=str(uuid4())
    elif kind=='missing-skeleton':d['bones'][0]['skeletonId']=str(uuid4())
    elif kind=='ik-chain':d['ikTargets'][0]['midBoneId']=d['bones'][-1]['id']
    elif kind=='bad-index':d['meshes'][0]['triangles'][0]=50
    elif kind=='bad-uv':d['meshes'][0]['vertices'][0]['u']=-1
    elif kind=='degenerate':d['meshes'][0]['vertices'][1]['x']=0
    elif kind=='flipped':d['meshes'][0]['vertices'][2]['x']=-1
    elif kind=='bad-weights':d['vertexWeights'][0]['influences'][0]['weight']=.1
    elif kind=='missing-weights':d['vertexWeights'].pop()
    elif kind=='duplicate-weights':d['vertexWeights'].append({**deepcopy(d['vertexWeights'][0]),'id':str(uuid4())})
    elif kind=='wrong-source':d['meshes'][0]['sourceAssetId']=str(uuid4())
    elif kind=='mask':d['meshes'][0]['alphaMask']['data']=[]
    elif kind=='bind':d['meshes'][0]['bindMatrix']['a']=0
    elif kind=='duplicate-id':d['bones'][0]['id']=d['projectId']
    elif kind=='constraints':d['bones'][0]['pose']['rotation']=190
    elif kind=='zero-ik':d['bones'][1]['rest']['x']=0
    response=client.put('/api/projects/'+d['projectId'],json=d)
    assert response.status_code==422, response.text
    assert 'data:image' not in response.text
