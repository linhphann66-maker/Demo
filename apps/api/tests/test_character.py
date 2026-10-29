from copy import deepcopy
from uuid import uuid4
import pytest
from test_api import client,document
from test_rig import rig_document
import main

@pytest.fixture
def character_document(rig_document):
    d=main.ProjectDocument.model_validate(rig_document).model_dump(mode='json',by_alias=True)
    layer=d['layers'][0];bone=d['bones'][0];lower=d['bones'][1];jid=str(uuid4())
    d['characterSettings']['characterView']='side_3_4'
    d['characterVariants']=[{'id':str(uuid4()),'name':'Side','view':'side_3_4','rootBoneId':bone['id'],'layerIds':[l['id'] for l in d['layers']],'boneIds':[b['id'] for b in d['bones']],'clipIds':[],'reference':False}]
    d['characterParts']=[{'id':str(uuid4()),'layerId':layer['id'],'sourceAssetId':layer['assetId'],'semantic':'arm','depth':'near','alphaMask':{'width':1,'height':1,'data':[1]},'parentBoneId':bone['id'],'meshId':d['meshes'][0]['id'],'attachmentId':d['attachments'][0]['id'],'renderOrder':0,'jointId':jid,'role':'continuous','overlapAssetId':layer['assetId'],'underlapAssetId':layer['assetId'],'mirrorPolicy':'mirror','leftAssetId':None}]
    d['characterJoints']=[{'id':jid,'name':'Elbow','kind':'elbow','upperBoneId':bone['id'],'lowerBoneId':lower['id'],'layerIds':[layer['id']],'mode':'continuous_mesh','overlapSize':8,'underlapSize':10,'radius':18,'completion':'procedural_neighbor_fill_v1'}]
    d['jointValidation']={'id':str(uuid4()),'createdAt':'2026-10-28T12:00:00Z','sourceRevision':0,'testedAngles':[-90,0,30],'samples':87,'uncoveredSamples':0,'issues':[],'jointIds':[jid]}
    layer.update(pivotX=1,pivotY=2)
    return d

def test_character_roundtrip(client,character_document):
    d=character_document;uri='/api/projects/'+d['projectId'];r=client.put(uri,json=d);assert r.status_code==200,r.text
    loaded=client.get(uri).json()
    for key in ('characterSettings','characterVariants','characterParts','characterJoints','jointValidation','meshes','vertexWeights','layers'):assert loaded[key]==d[key]

def test_legacy_direction_defaults(client,document):
    for version in (0,1,2,3):
        d=deepcopy(document);d.update(schemaVersion=version,ikTargets=[],rigSettings={'mode':'rest'})
        r=client.put('/api/projects/'+d['projectId'],json=d);assert r.status_code==200,r.text
        loaded=client.get('/api/projects/'+d['projectId']).json();assert loaded['schemaVersion']==4;assert loaded['characterSettings']['characterView']=='front';assert loaded['layers']==d['layers']

@pytest.mark.parametrize('case',['view','facing','vertical','mask','missing-asset','missing-bone','bad-mesh','duplicate-part','missing-joint','root','directional','mode','size','limit','report'])
def test_rejects_invalid_character(client,character_document,case):
    d=character_document;p=d['characterParts'][0];j=d['characterJoints'][0]
    if case=='view':d['characterSettings']['characterView']='top_down'
    elif case=='facing':d['characterSettings']['facing']='up'
    elif case=='vertical':d['characterSettings']['enableVerticalFacing']=True
    elif case=='mask':p['alphaMask']['data']=[]
    elif case=='missing-asset':p['sourceAssetId']=str(uuid4())
    elif case=='missing-bone':p['parentBoneId']=str(uuid4())
    elif case=='bad-mesh':p['meshId']=str(uuid4())
    elif case=='duplicate-part':d['characterParts'].append({**deepcopy(p),'id':str(uuid4())})
    elif case=='missing-joint':p['jointId']=str(uuid4())
    elif case=='root':d['characterVariants'][0]['rootBoneId']=d['bones'][1]['id']
    elif case=='directional':p['mirrorPolicy']='directional'
    elif case=='mode':j['mode']='fake_ai'
    elif case=='size':j['underlapSize']=-1
    elif case=='limit':d['jointValidation']['testedAngles']=[200]
    elif case=='report':d['jointValidation']['jointIds']=[str(uuid4())]
    assert client.put('/api/projects/'+d['projectId'],json=d).status_code==422

def test_ai_anatomical_contract_is_honestly_unavailable(client):
    contract=client.get('/api/ai/side-character-contract').json();assert contract['available'] is False;assert contract['preserveOccludedRegions'] is True
    body={'projectId':str(uuid4()),'sourceAssetId':str(uuid4()),'baseRevision':0,'anatomy':'near_arm','preserveSourcePixels':True,'preserveOccludedRegions':True,'overlapPixels':8,'underlapPixels':10,'generation':{}}
    for endpoint in ('segmentation','inpainting'):
        assert client.post('/api/ai/'+endpoint,json=body).status_code==503
        assert client.post('/api/ai/'+endpoint,json={**body,'preserveOccludedRegions':False}).status_code==422
