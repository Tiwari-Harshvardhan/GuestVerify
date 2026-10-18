import json
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.services.bedrock_service import BedrockService
from app.services.provider_service import ProviderService

client = TestClient(app)


def test_health():
    response = client.get('/api/health')
    assert response.status_code == 200
    data = response.json()
    assert data['status'] == 'ok'


def test_seeded_delivery_exists():
    response = client.get('/api/deliveries')
    assert response.status_code == 200
    deliveries = response.json()
    assert any(item['company'] == 'Amazon' for item in deliveries)


def test_event_simulation_and_verification():
    response = client.post('/api/events/simulate', json={
        'event_type': 'delivery_arrival',
        'device_id': 'test-doorbell',
        'transcript': 'Amazon delivery for John.',
        'source': 'simulator',
        'event_timestamp': (datetime.utcnow() - timedelta(hours=1)).isoformat(),
    })
    assert response.status_code == 200, response.text
    data = response.json()
    assert 'decision' in data
    assert data['decision']['outcome'] in {'PARTIAL_MATCH', 'NO_EXPECTED_DELIVERY'}


def test_action_requires_approval():
    event_response = client.post('/api/events/simulate', json={
        'event_type': 'delivery_arrival',
        'device_id': 'test-doorbell-2',
        'transcript': 'Amazon delivery for John.',
        'source': 'simulator',
        'event_timestamp': datetime.utcnow().isoformat(),
    })
    event_id = event_response.json()['event_id']
    denied = client.post('/api/actions/simulate', json={'event_id': event_id}, headers={'X-Demo-Owner': 'demo-owner'})
    assert denied.status_code == 403


def test_dashboard_works():
    response = client.get('/api/dashboard')
    assert response.status_code == 200
    data = response.json()
    assert 'total_events' in data


def test_expired_delivery_is_rejected():
    response = client.post('/api/events/simulate', json={
        'event_type': 'delivery_arrival',
        'device_id': 'expired-doorbell',
        'transcript': 'FedEx delivery for Jane.',
        'source': 'simulator',
        'event_timestamp': (datetime.utcnow() - timedelta(days=2)).isoformat(),
    })
    assert response.status_code == 200
    data = response.json()
    assert data['decision']['outcome'] in {'EXPIRED_EXPECTATION', 'MISMATCH'}


def test_unauthorized_approval_is_rejected():
    event_response = client.post('/api/events/simulate', json={
        'event_type': 'delivery_arrival',
        'device_id': 'unauthorized-doorbell',
        'transcript': 'Amazon delivery for John.',
        'source': 'simulator',
        'event_timestamp': datetime.utcnow().isoformat(),
    })
    event_id = event_response.json()['event_id']
    response = client.post(f'/api/events/{event_id}/approve', json={
        'decision': 'approve',
        'requested_action': 'leave_in_porch_box',
        'approver': 'attacker',
    })
    assert response.status_code == 401


def test_delivery_creation_and_revoke():
    payload = {
        'company': 'UPS',
        'recipient': 'Emma',
        'tracking_reference': 'UPS-1234',
        'expected_start': (datetime.utcnow() - timedelta(hours=1)).isoformat(),
        'expected_end': (datetime.utcnow() + timedelta(hours=2)).isoformat(),
        'destination': 'doorstep',
        'status': 'pending',
        'allowed_action': 'handover_only',
        'verification_evidence': 'tracking_reference',
    }
    create_response = client.post('/api/deliveries', json=payload)
    assert create_response.status_code == 200, create_response.text
    data = create_response.json()
    revoke_response = client.post(f"/api/deliveries/{data['id']}/revoke")
    assert revoke_response.status_code == 200
    assert revoke_response.json()['status'] == 'cancelled'


def test_audit_and_event_detail_endpoints():
    event_response = client.post('/api/events/simulate', json={
        'event_type': 'delivery_arrival',
        'device_id': 'audit-doorbell',
        'transcript': 'Amazon delivery for John.',
        'source': 'simulator',
        'event_timestamp': datetime.utcnow().isoformat(),
    })
    event_id = event_response.json()['event_id']
    detail_response = client.get(f'/api/events/{event_id}')
    assert detail_response.status_code == 200
    assert 'decision' in detail_response.json()
    audit_response = client.get('/api/audit')
    assert audit_response.status_code == 200
    assert isinstance(audit_response.json(), list)


def test_local_demo_mode_without_aws_credentials(monkeypatch):
    monkeypatch.delenv('AWS_ACCESS_KEY_ID', raising=False)
    monkeypatch.delenv('AWS_SECRET_ACCESS_KEY', raising=False)
    monkeypatch.delenv('AWS_PROFILE', raising=False)
    status = ProviderService().get_provider_status()
    assert status['provider_mode'] == 'local_demo'
    assert status['configured'] is True
    assert status['fallback_active'] is True


def test_bedrock_diagnostics_report_missing_credentials(monkeypatch):
    monkeypatch.delenv('AWS_ACCESS_KEY_ID', raising=False)
    monkeypatch.delenv('AWS_SECRET_ACCESS_KEY', raising=False)
    monkeypatch.delenv('AWS_PROFILE', raising=False)
    diag = BedrockService().diagnose()
    assert diag['status'] == 'missing_credentials'
    assert diag['configured'] is False


def test_bedrock_extract_claim_with_mocked_success(monkeypatch):
    monkeypatch.setenv('AWS_ACCESS_KEY_ID', 'test-key')
    monkeypatch.setenv('AWS_SECRET_ACCESS_KEY', 'test-secret')
    fake_client = MagicMock()
    fake_response = {'body': MagicMock(read=MagicMock(return_value=json.dumps({'output': {'company': 'Amazon', 'recipient': 'John'}})))}
    fake_client.invoke_model.return_value = fake_response
    with patch('app.services.bedrock_service.boto3.client', return_value=fake_client):
        result = BedrockService().extract_claim('Amazon delivery for John.')
    assert result['company'] == 'Amazon'
    assert result['source'] == 'bedrock'


def test_provider_service_uses_local_fallback_when_bedrock_is_unavailable(monkeypatch):
    import app.services.provider_service as provider_module
    monkeypatch.setattr(provider_module, 'AI_PROVIDER', 'bedrock')
    monkeypatch.setattr(provider_module.BedrockService, 'is_configured', lambda self: False)
    result = provider_module.ProviderService().extract_visitor_claim('Amazon delivery for John.')
    assert result['source'] == 'demo-fallback'
    assert result['provider_mode'] == 'local_demo'


def test_dashboard_review_count_and_event_action_history():
    pending_before = client.get('/api/dashboard').json()['pending_approvals']
    event_response = client.post('/api/events/simulate', json={
        'event_type': 'delivery_arrival',
        'device_id': 'action-history-doorbell',
        'transcript': 'Amazon delivery for John.',
        'source': 'simulator',
        'event_timestamp': datetime.utcnow().isoformat(),
    })
    assert event_response.status_code == 200, event_response.text
    event_id = event_response.json()['event_id']
    listed_event = next(item for item in client.get('/api/events').json() if item['id'] == event_id)
    assert listed_event['outcome'] == event_response.json()['decision']['outcome']
    assert listed_event['recommended_action'] == event_response.json()['decision']['recommended_action']
    assert client.get('/api/dashboard').json()['pending_approvals'] == pending_before + 1

    approval_response = client.post(f'/api/events/{event_id}/approve', json={
        'decision': 'approve',
        'requested_action': 'leave_in_porch_box',
        'approver': 'demo-owner',
    }, headers={'X-Demo-Owner': 'demo-owner'})
    assert approval_response.status_code == 200
    action_response = client.post('/api/actions/simulate', json={
        'event_id': event_id,
        'requested_by': 'demo-owner',
    }, headers={'X-Demo-Owner': 'demo-owner'})
    assert action_response.status_code == 200

    detail = client.get(f'/api/events/{event_id}').json()
    assert len(detail['actions']) == 1
    assert detail['actions'][0]['execution_mode'] == 'simulated'
    assert 'no_physical_lock_touched' in detail['actions'][0]['result']
    assert client.get('/api/dashboard').json()['pending_approvals'] == pending_before
