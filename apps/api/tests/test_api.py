import base64
import io
import json
import sys
import zipfile
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main
from fastapi.testclient import TestClient
from PIL import Image
import pytest

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, 'DATA', tmp_path)
    return TestClient(main.app)

@pytest.fixture
def document():
    image = Image.new('RGBA', (1, 1), (255, 0, 0, 255))
    stream = io.BytesIO()
    image.save(stream, format='PNG')
    asset_id, layer_id = str(uuid4()), str(uuid4())
    result = {k: [] for k in ['characterDefinitions', 'skeletons', 'bones', 'meshes', 'vertexWeights', 'equipmentSlots', 'attachments', 'animationClips', 'keyframeTracks', 'animationEvents', 'vfxGraphs', 'aiJobReferences', 'revisionHistory']}
    result.update(schemaVersion=1, projectId=str(uuid4()), metadata={'name': 'Test', 'createdAt': '2026-01-01T00:00:00Z', 'updatedAt': '2026-01-01T00:00:00Z', 'revision': 0}, assetReferences=[{'id': asset_id, 'name': 'pixel', 'provenance': 'user-created', 'kind': 'source', 'dependencies': [], 'data': 'data:image/png;base64,' + base64.b64encode(stream.getvalue()).decode(), 'width': 1, 'height': 1}], layers=[{'id': layer_id, 'assetId': asset_id, 'parentId': None, 'name': 'Layer', 'visible': True, 'locked': False, 'opacity': 1, 'x': 20, 'y': 30, 'rotation': 0, 'scaleX': 1, 'scaleY': 1}], hierarchy=[{'layerId': layer_id, 'parentId': None}])
    return result

def test_health_and_no_fake_ai(client):
    assert client.get('/api/health').json()['status'] == 'ok'
    assert client.get('/api/ai/capabilities').json()['available'] is False
    assert client.post('/api/ai/jobs').status_code == 503

def test_save_load_assets_and_export(client, document):
    uri = '/api/projects/' + document['projectId']
    assert client.put(uri, json=document).status_code == 200
    loaded = client.get(uri).json()
    assert loaded['layers'] == document['layers']
    assert len(client.get('/api/projects').json()) == 1
    asset = client.get(uri + '/assets/' + document['assetReferences'][0]['id'])
    assert asset.status_code == 200
    assert asset.json()['data'] == document['assetReferences'][0]['data']
    response = client.get(uri + '/export')
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        assert archive.namelist() == ['project.json']
        assert json.loads(archive.read('project.json'))['layers'] == document['layers']

def test_missing_conflict_and_path_validation(client, document):
    assert client.get('/api/projects/' + str(uuid4())).status_code == 404
    assert client.put('/api/projects/' + str(uuid4()), json=document).status_code == 409
    assert client.get('/api/projects/not-a-uuid').status_code == 422

def test_rejects_cycles_bad_refs_and_unknown_properties(client, document):
    document['layers'][0]['parentId'] = document['layers'][0]['id']
    document['hierarchy'][0]['parentId'] = document['layers'][0]['id']
    assert client.put('/api/projects/' + document['projectId'], json=document).status_code == 422
    document['layers'][0]['parentId'] = None
    document['hierarchy'][0]['parentId'] = None
    document['layers'][0]['assetId'] = str(uuid4())
    assert client.put('/api/projects/' + document['projectId'], json=document).status_code == 422
    document['script'] = 'evil'
    assert client.put('/api/projects/' + document['projectId'], json=document).status_code == 422

def test_rejects_svg_and_metadata_spoofing(client, document):
    document['assetReferences'][0]['data'] = 'data:image/svg+xml;base64,' + base64.b64encode(b'<svg/>').decode()
    response = client.put('/api/projects/' + document['projectId'], json=document)
    assert response.status_code == 422
    assert 'data:image' not in response.text

def test_body_limit_counts_actual_bytes(client, monkeypatch):
    monkeypatch.setattr(main, 'MAX_BODY', 10)
    assert client.put('/api/projects/' + str(uuid4()), content=b'x' * 11).status_code == 413
