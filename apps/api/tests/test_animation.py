from copy import deepcopy
from uuid import uuid4
import io,json,zipfile
import pytest
from test_api import client,document
from test_rig import rig_document

@pytest.fixture
def animation_document(rig_document):
    d=deepcopy(rig_document);d['schemaVersion']=3
    cid=str(uuid4());tid=str(uuid4());eid=str(uuid4());bone=d['bones'][0]
    clip={'id':cid,'name':'Idle','duration':2,'fps':24,'loopMode':'loop','range':{'start':0,'end':2},'trackIds':[tid],'eventIds':[eid],'baseState':{'bonePoses':[{'boneId':b['id'],**b['pose'],'scaleX':1,'scaleY':1} for b in d['bones']],'layerStates':[{'layerId':l['id'],**{k:l[k] for k in ['x','y','rotation','scaleX','scaleY','opacity','visible']}} for l in d['layers']],'ikStates':[{'targetId':t['id'],'x':t['x'],'y':t['y'],'blend':0,'enabled':False} for t in d['ikTargets']],'attachmentStates':[{'layerId':a['layerId'],'boneId':a['boneId']} for a in d['attachments']]},'metadata':{'origin':'procedural','description':'Test animation','tags':['test']}}
    track={'id':tid,'clipId':cid,'targetId':bone['id'],'type':'bone.rotation','enabled':True,'rotationMode':'shortest','keyframes':[{'id':str(uuid4()),'time':0,'value':0,'interpolation':'bezier','handles':{'x1':.42,'y1':0,'x2':.58,'y2':1}},{'id':str(uuid4()),'time':2,'value':30,'interpolation':'linear'}]}
    event={'id':eid,'clipId':cid,'name':'marker','time':.5,'enabled':True,'payload':{'type':'number','value':2}}
    d['animationClips']=[clip];d['keyframeTracks']=[track];d['animationEvents']=[event]
    return d

def test_animation_persistence_and_export(client,animation_document):
    d=animation_document;uri='/api/projects/'+d['projectId']
    response=client.put(uri,json=d)
    assert response.status_code==200,response.text
    saved=client.get(uri).json()
    for key in ['animationClips','keyframeTracks','animationEvents','bones','meshes','vertexWeights','ikTargets']:assert saved[key]==d[key]
    with zipfile.ZipFile(io.BytesIO(client.get(uri+'/export').content)) as z:
        archive=json.loads(z.read('project.json'))
        assert archive['animationClips']==d['animationClips']
        assert archive['keyframeTracks']==d['keyframeTracks']
        assert archive['animationEvents']==d['animationEvents']

def test_mesh_ik_and_discrete_track_values(client,animation_document):
    d=animation_document;cid=d['animationClips'][0]['id'];mesh=d['meshes'][0];ik=d['ikTargets'][0]
    for kind,target,value,interp in [('mesh.deform',mesh['id'],{mesh['vertices'][0]['id']:{'x':2,'y':-1}},'linear'),('ik.blend',ik['id'],.5,'linear'),('layer.visible',d['layers'][0]['id'],False,'stepped'),('attachment.bone',d['layers'][0]['id'],None,'stepped')]:
        tid=str(uuid4());d['animationClips'][0]['trackIds'].append(tid);d['keyframeTracks'].append({'id':tid,'clipId':cid,'targetId':target,'type':kind,'enabled':True,'rotationMode':'shortest','keyframes':[{'id':str(uuid4()),'time':0,'value':value,'interpolation':interp}]})
    response=client.put('/api/projects/'+d['projectId'],json=d)
    assert response.status_code==200,response.text
    saved=client.get('/api/projects/'+d['projectId']).json()
    assert saved['keyframeTracks']==d['keyframeTracks']

@pytest.mark.parametrize('kind',['wrong-type','bad-target','unknown-clip','negative-time','late-key','duplicate-time','order','bad-easing','bad-opacity','bad-scale','bad-base','base-duplicate','bad-event','late-event','event-payload','clip-refs','discrete-linear','vertex-ref','bad-range','ids','unknown-channel'])
def test_rejects_invalid_animation(client,animation_document,kind):
    d=animation_document;t=d['keyframeTracks'][0];k=t['keyframes'][0];c=d['animationClips'][0];e=d['animationEvents'][0]
    if kind=='wrong-type':k['value']=True
    elif kind=='bad-target':t['targetId']=str(uuid4())
    elif kind=='unknown-clip':t['clipId']=str(uuid4())
    elif kind=='negative-time':k['time']=-1
    elif kind=='late-key':k['time']=10
    elif kind=='duplicate-time':t['keyframes'][1]['time']=0
    elif kind=='order':t['keyframes'].reverse()
    elif kind=='bad-easing':k['handles']['x1']=2
    elif kind=='bad-opacity':t.update(type='layer.opacity',targetId=d['layers'][0]['id']);k['value']=2
    elif kind=='bad-scale':t['type']='bone.scaleX';k['value']=0
    elif kind=='bad-base':c['baseState']['bonePoses'][0]['boneId']=str(uuid4())
    elif kind=='base-duplicate':c['baseState']['bonePoses'].append(deepcopy(c['baseState']['bonePoses'][0]))
    elif kind=='bad-event':e['clipId']=str(uuid4())
    elif kind=='late-event':e['time']=3
    elif kind=='event-payload':e['name']='sword_trail_start'
    elif kind=='clip-refs':c['trackIds']=[]
    elif kind=='discrete-linear':t.update(type='layer.visible',targetId=d['layers'][0]['id']);k['value']=True
    elif kind=='vertex-ref':t.update(type='mesh.deform',targetId=d['meshes'][0]['id']);k['value']={str(uuid4()):{'x':0,'y':0}}
    elif kind=='bad-range':c['range']['start']=2
    elif kind=='ids':k['id']=d['projectId']
    elif kind=='unknown-channel':t['type']='execute.javascript'
    response=client.put('/api/projects/'+d['projectId'],json=d)
    assert response.status_code==422,response.text
    assert 'data:image' not in response.text
