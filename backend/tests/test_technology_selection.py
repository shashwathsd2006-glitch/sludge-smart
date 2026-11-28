import json

import pytest

from app import db


def sample_settings():
    from pathlib import Path
    path = Path(__file__).resolve().parents[2] / 'shared' / 'sample-data.json'
    return json.loads(path.read_text(encoding='utf-8'))['technology']


def test_technology_defaults_have_nine_criteria_and_ten_technologies(client):
    settings = client.get('/api/technology').json()
    assert len(settings['weights']) == 9
    assert len(settings['scores']) == 10
    assert sum(settings['weights'].values()) == 100
    assert all(1 <= score <= 5 for scores in settings['scores'].values() for score in scores.values())


def test_technology_matrix_persists_through_get(client):
    payload = sample_settings()
    payload['weights']['feasibility'] = 25
    payload['weights']['environmental'] = 0
    payload['scores']['solar-drying']['feasibility'] = 5

    saved = client.put('/api/technology', json=payload)
    assert saved.status_code == 200
    assert saved.json()['weights'] == payload['weights']
    assert saved.json()['scores'] == payload['scores']

    reloaded = client.get('/api/technology').json()
    assert reloaded['weights'] == payload['weights']
    assert reloaded['scores'] == payload['scores']
    assert reloaded['updated_at'] is not None

    row = db.fetch_one('SELECT weights, scores FROM technology_settings WHERE id = 1')
    assert json.loads(row['weights']) == payload['weights']
    assert json.loads(row['scores']) == payload['scores']


@pytest.mark.parametrize('invalid', [
    {'weights': {'feasibility': -1}, 'scores': sample_settings()['scores']},
    {'weights': {'feasibility': 1001}, 'scores': sample_settings()['scores']},
    {'weights': {'feasibility': 'not-a-number'}, 'scores': sample_settings()['scores']},
    {'weights': {'feasibility': None}, 'scores': sample_settings()['scores']},
    {'weights': sample_settings()['weights'], 'scores': {'solar-drying': {'feasibility': 0}}},
    {'weights': sample_settings()['weights'], 'scores': {'solar-drying': {'feasibility': 6}}},
    {'weights': sample_settings()['weights'], 'scores': {'solar-drying': {'feasibility': -1}}},
    {'weights': sample_settings()['weights'], 'scores': {'solar-drying': {'feasibility': 'not-a-number'}}},
])
def test_technology_rejects_invalid_weights_and_scores(client, invalid):
    response = client.put('/api/technology', json=invalid)
    assert response.status_code == 422


def test_technology_save_and_reload_reflects_recommendation_inputs(client):
    payload = sample_settings()
    for key in payload['weights']:
        payload['weights'][key] = 0
    payload['weights']['capex'] = 100
    for key in payload['scores']['gravity-thickener']:
        payload['scores']['gravity-thickener'][key] = 5
        payload['scores']['solar-drying'][key] = 1

    saved = client.put('/api/technology', json=payload)
    assert saved.status_code == 200
    body = saved.json()
    assert body['weights']['capex'] == 100
    assert body['updated_at'] is not None

    reloaded = client.get('/api/technology').json()
    assert reloaded['weights'] == body['weights']
    assert reloaded['scores'] == body['scores']
    assert reloaded['updated_at'] == body['updated_at']
