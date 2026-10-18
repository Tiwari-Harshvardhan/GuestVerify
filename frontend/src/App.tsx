import { useEffect, useMemo, useState } from 'react';

type Delivery = {
  id: string;
  company: string;
  recipient: string;
  tracking_reference?: string | null;
  expected_start: string;
  expected_end: string;
  destination: string;
  status: string;
  allowed_action: string;
  verification_evidence?: string | null;
};

type EventItem = {
  id: string;
  event_type: string;
  device_id: string;
  event_timestamp: string;
  transcript?: string;
  processing_status: string;
  correlation_id: string;
  delivery_id?: string | null;
};

type DashboardSummary = {
  total_events: number;
  pending_approvals: number;
  pending_deliveries: number;
  partial_matches: number;
  warnings: number;
};

type AuditItem = {
  id: string;
  event_id: string;
  actor: string;
  event_type: string;
  details: Record<string, unknown> | string;
  timestamp: string;
};

type EventDetail = {
  event: {
    id: string;
    event_type: string;
    device_id: string;
    event_timestamp: string;
    transcript?: string;
    processing_status: string;
    correlation_id: string;
  };
  decision: {
    outcome: string;
    matching_fields: string[];
    conflicting_fields: string[];
    missing_evidence: string[];
    explanation: string;
    recommended_action: string;
    policy_decision: string;
  } | null;
  evidence: Array<{
    id: string;
    evidence_type: string;
    source: string;
    value?: string | null;
    external_reference?: string | null;
    timestamp: string;
    verification_status: string;
    independent_authentication: boolean;
  }>;
  approvals: Array<{
    id: string;
    requested_action: string;
    decision: string;
    approver: string;
    timestamp: string;
    expires_at?: string | null;
  }>;
};

const API = '';

const emptyForm = {
  company: 'Amazon',
  recipient: 'John',
  tracking_reference: 'AMZ-2048',
  expected_start: new Date(Date.now() - 60 * 60 * 1000).toISOString().slice(0, 16),
  expected_end: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 16),
  destination: 'porch_box',
  status: 'pending',
  allowed_action: 'leave_in_porch_box',
  verification_evidence: 'simulated_delivery_reference',
};

export default function App() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
  const [eventDetail, setEventDetail] = useState<EventDetail | null>(null);
  const [providerStatus, setProviderStatus] = useState<{ provider_mode?: string; provider_summary?: string; fallback_active?: boolean; provider_configured?: boolean } | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [transcript, setTranscript] = useState('Amazon delivery for John.');
  const [assistantInput, setAssistantInput] = useState('What happened at the door?');
  const [assistantResponse, setAssistantResponse] = useState('');
  const [status, setStatus] = useState('');

  const loadData = async () => {
    const [deliveryRes, eventRes, summaryRes, auditRes, providerRes] = await Promise.all([
      fetch(`${API}/api/deliveries`),
      fetch(`${API}/api/events`),
      fetch(`${API}/api/dashboard`),
      fetch(`${API}/api/audit`),
      fetch(`${API}/api/integrations/status`),
    ]);
    const deliveryData = await deliveryRes.json();
    const eventData = await eventRes.json();
    const summaryData = await summaryRes.json();
    const auditData = await auditRes.json();
    const providerData = await providerRes.json();
    setDeliveries(deliveryData);
    setEvents(eventData);
    setSummary(summaryData);
    setAuditItems(auditData);
    setProviderStatus(providerData);

    if (!selectedEventId && eventData.length > 0) {
      setSelectedEventId(eventData[0].id);
    }
  };

  const loadEventDetail = async (eventId: string) => {
    const response = await fetch(`${API}/api/events/${eventId}`);
    if (!response.ok) return;
    const data = await response.json();
    setEventDetail(data);
  };

  useEffect(() => { void loadData(); }, []);

  useEffect(() => {
    if (selectedEventId) {
      void loadEventDetail(selectedEventId);
    }
  }, [selectedEventId]);

  const selectedEvent = useMemo(() => events.find((event) => event.id === selectedEventId) ?? null, [events, selectedEventId]);

  const simulateEvent = async () => {
    setStatus('Simulating event...');
    const response = await fetch(`${API}/api/events/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'delivery_arrival',
        device_id: 'ring-doorbell-demo',
        transcript,
        source: 'simulator',
        event_timestamp: new Date().toISOString(),
      }),
    });
    const result = await response.json();
    setStatus(JSON.stringify(result, null, 2));
    await loadData();
    if (result.event_id) {
      setSelectedEventId(result.event_id);
    }
  };

  const createDelivery = async () => {
    const payload = {
      ...form,
      expected_start: new Date(form.expected_start).toISOString(),
      expected_end: new Date(form.expected_end).toISOString(),
    };
    const response = await fetch(`${API}/api/deliveries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      setForm(emptyForm);
      await loadData();
    }
  };

  const revokeDelivery = async (deliveryId: string) => {
    await fetch(`${API}/api/deliveries/${deliveryId}/revoke`, { method: 'POST' });
    await loadData();
  };

  const approveEvent = async (eventId: string) => {
    await fetch(`${API}/api/events/${eventId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Demo-Owner': 'demo-owner' },
      body: JSON.stringify({ decision: 'approve', requested_action: 'leave_in_porch_box', approver: 'demo-owner' }),
    });
    await fetch(`${API}/api/actions/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Demo-Owner': 'demo-owner' },
      body: JSON.stringify({ event_id: eventId, action_type: 'simulated_porch_box', requested_by: 'demo-owner' }),
    });
    await loadData();
  };

  const requestEvidence = async (eventId: string) => {
    await fetch(`${API}/api/events/${eventId}/request-evidence`, {
      method: 'POST',
      headers: { 'X-Demo-Owner': 'demo-owner' },
    });
    await loadData();
  };

  const askAssistant = async () => {
    const response = await fetch(`${API}/api/assistant/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: assistantInput }),
    });
    const data = await response.json();
    setAssistantResponse(data.response || 'No response');
    await loadData();
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">GuestVerify</div>
          <h1>Verify the delivery, not just the visitor’s story.</h1>
        </div>
        <div className="status-pill">{providerStatus?.provider_mode ?? 'local_demo'} / simulated Ring</div>
      </header>

      <section className="summary-grid">
        <div className="card"><span>Events</span><strong>{summary?.total_events ?? 0}</strong></div>
        <div className="card"><span>Pending approvals</span><strong>{summary?.pending_approvals ?? 0}</strong></div>
        <div className="card"><span>Live deliveries</span><strong>{summary?.pending_deliveries ?? 0}</strong></div>
        <div className="card"><span>Partial matches</span><strong>{summary?.partial_matches ?? 0}</strong></div>
      </section>

      <section className="panel provider-panel">
        <h3>AI / integration status</h3>
        <div className="muted">Mode: {providerStatus?.provider_mode ?? 'local_demo'}</div>
        <div className="muted">Configured: {providerStatus?.provider_configured === false ? 'No' : 'Yes'}</div>
        <div className="muted">Fallback active: {providerStatus?.fallback_active ? 'Yes' : 'No'}</div>
        <div className="muted">{providerStatus?.provider_summary ?? 'Local demo mode is active.'}</div>
      </section>

      <section className="content-grid">
        <div className="panel">
          <h3>Delivery management</h3>
          <div className="form-grid">
            <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Company" />
            <input value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} placeholder="Recipient" />
            <input value={form.tracking_reference} onChange={(e) => setForm({ ...form, tracking_reference: e.target.value })} placeholder="Tracking reference" />
            <input type="datetime-local" value={form.expected_start} onChange={(e) => setForm({ ...form, expected_start: e.target.value })} />
            <input type="datetime-local" value={form.expected_end} onChange={(e) => setForm({ ...form, expected_end: e.target.value })} />
            <input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} placeholder="Destination" />
            <input value={form.allowed_action} onChange={(e) => setForm({ ...form, allowed_action: e.target.value })} placeholder="Allowed action" />
            <input value={form.verification_evidence} onChange={(e) => setForm({ ...form, verification_evidence: e.target.value })} placeholder="Verification evidence" />
          </div>
          <button onClick={createDelivery}>Add delivery expectation</button>
          <div className="stack-list">
            {deliveries.map((item) => (
              <div key={item.id} className="row-card">
                <div>
                  <strong>{item.company}</strong> for {item.recipient}
                  <div className="muted">{item.destination} · {item.status}</div>
                </div>
                <div className="row-actions">
                  <span className="badge">{item.allowed_action}</span>
                  <button className="secondary" onClick={() => revokeDelivery(item.id)}>Revoke</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h3>Live event simulator</h3>
          <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={5} />
          <button onClick={simulateEvent}>Trigger simulated visitor event</button>
          <pre>{status}</pre>
        </div>
      </section>

      <section className="panel">
        <h3>Evidence verification and decision detail</h3>
        {selectedEvent ? (
          <div className="detail-grid">
            <div>
              <div className="detail-header">
                <strong>{selectedEvent.event_type}</strong>
                <span className="badge">{selectedEvent.processing_status}</span>
              </div>
              <div className="muted">Device: {selectedEvent.device_id}</div>
              <div className="muted">Timestamp: {new Date(selectedEvent.event_timestamp).toLocaleString()}</div>
              <div className="muted">Transcript: {selectedEvent.transcript}</div>
            </div>
            <div>
              {eventDetail?.decision ? (
                <div>
                  <div className="decision">Outcome: {eventDetail.decision.outcome}</div>
                  <div className="muted">Recommended action: {eventDetail.decision.recommended_action}</div>
                  <div className="muted">Policy: {eventDetail.decision.policy_decision}</div>
                  <div className="muted">Explanation: {eventDetail.decision.explanation}</div>
                </div>
              ) : <div className="muted">No verification decision recorded yet</div>}
            </div>
          </div>
        ) : <div className="muted">No event selected</div>}
        {eventDetail?.evidence.length ? (
          <div className="mini-list">
            {eventDetail.evidence.map((item) => (
              <div key={item.id} className="mini-item">
                <strong>{item.evidence_type}</strong> · {item.verification_status}
                <div className="muted">{item.source} · {new Date(item.timestamp).toLocaleString()}</div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="content-grid">
        <div className="panel">
          <h3>Recent events</h3>
          <div className="event-list">
            {events.map((event) => (
              <div key={event.id} className={`event-row ${selectedEventId === event.id ? 'selected' : ''}`}>
                <button className="link-button" onClick={() => setSelectedEventId(event.id)}>
                  <strong>{event.event_type}</strong> · {event.processing_status}
                </button>
                <small>{new Date(event.event_timestamp).toLocaleString()}</small>
                <div className="row-actions">
                  <button onClick={() => approveEvent(event.id)}>Approve</button>
                  <button className="secondary" onClick={() => requestEvidence(event.id)}>Evidence</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h3>Audit trail</h3>
          <div className="audit-list">
            {auditItems.map((item) => (
              <div key={item.id} className="audit-item">
                <div className="detail-header">
                  <strong>{item.event_type}</strong>
                  <span className="badge">{item.actor}</span>
                </div>
                <div className="muted">{new Date(item.timestamp).toLocaleString()}</div>
                <div className="muted">{typeof item.details === 'string' ? item.details : JSON.stringify(item.details)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel assistant-panel">
        <h3>Homeowner assistant</h3>
        <div className="assistant-row">
          <input value={assistantInput} onChange={(e) => setAssistantInput(e.target.value)} placeholder="Ask about the current event" />
          <button onClick={askAssistant}>Ask</button>
        </div>
        <div className="assistant-output">{assistantResponse || 'Awaiting a question...'}</div>
      </section>
    </div>
  );
}
