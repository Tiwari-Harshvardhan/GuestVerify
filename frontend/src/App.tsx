import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createSpeechRecognition, playLocalDoorbell, speakLocally, stopLocalSpeech, supportsSpeechRecognition, supportsSpeechSynthesis, type SpeechRecognitionLike } from './speech';

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
  source?: string;
  processing_status: string;
  correlation_id: string;
  delivery_id?: string | null;
  outcome?: string | null;
  recommended_action?: string | null;
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
  correlation_id: string;
  actor: string;
  event_type: string;
  details: Record<string, unknown> | string;
  timestamp: string;
};

type EventDetail = {
  event: EventItem;
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
  actions: Array<{
    id: string;
    action_type: string;
    authorization_check_result: string;
    execution_mode: string;
    result: string;
    timestamp: string;
  }>;
};

type ProviderStatus = {
  ring: string;
  bedrock: string;
  simulated_actions: string;
  provider_mode: string;
  provider_configured: boolean;
  fallback_active: boolean;
  provider_summary: string;
};

type Section = 'overview' | 'events' | 'deliveries' | 'audio' | 'perimeter' | 'audit' | 'integrations';
type AudioLogEntry = { id: string; timestamp: string; title: string; detail: string; source: 'simulated event' | 'homeowner action' | 'browser audio' };

const API = '';
const emptyForm = () => ({
  company: '',
  recipient: '',
  tracking_reference: '',
  expected_start: new Date(Date.now() - 60 * 60 * 1000).toISOString().slice(0, 16),
  expected_end: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 16),
  destination: 'porch_box',
  allowed_action: 'leave_in_porch_box',
  verification_evidence: '',
});

const scenarios = [
  { label: 'Matching claim', text: 'Amazon delivery for John.' },
  { label: 'Wrong recipient', text: 'Amazon delivery for Alex.' },
  { label: 'Expired delivery', text: 'FedEx delivery for Jane.' },
  { label: 'Insufficient evidence', text: 'I have a package for someone here.' },
];

const navItems: Array<{ id: Section; label: string; icon: string }> = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'events', label: 'Visitor events', icon: 'activity' },
  { id: 'deliveries', label: 'Deliveries', icon: 'box' },
  { id: 'audio', label: 'Audio & responses', icon: 'speaker' },
  { id: 'perimeter', label: 'Perimeter awareness', icon: 'home' },
  { id: 'audit', label: 'Audit history', icon: 'list' },
  { id: 'integrations', label: 'Integrations', icon: 'nodes' },
];

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const shared = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const };
  const paths: Record<string, JSX.Element> = {
    shield: <><path d="M12 3 19 6v5c0 4.7-2.8 8-7 10-4.2-2-7-5.3-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></>,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    box: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4.5 7.7 7.5 4.2 7.5-4.2M12 12v9" /></>,
    activity: <><path d="M3 12h4l3-8 4 16 3-8h4" /></>,
    list: <><path d="M8 6h12M8 12h12M8 18h12" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>,
    nodes: <><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="m8.3 10.8 7.4-3.6M8.3 13.2l7.4 3.6" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    alert: <><path d="M12 3 2.8 19h18.4L12 3Z" /><path d="M12 9v4m0 3h.01" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.5 9A7 7 0 0 1 18 6.5L20 12M4 12l2 5.5A7 7 0 0 0 18.5 15" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4 4" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>,
    spark: <><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" /><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" /></>,
    mic: <><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0m-7 7v3m-4 0h8" /></>,
    speaker: <><path d="M4 10v4h4l5 4V6l-5 4H4Z" /><path d="M17 9a5 5 0 0 1 0 6m2-9a9 9 0 0 1 0 12" /></>,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
    play: <path d="m8 5 11 7-11 7V5Z" />,
    home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z" /><path d="M7 11h.01M17 11h.01" /></>,
    car: <><path d="m5 11 1.5-5h11L19 11l2 2v5h-2v-2H5v2H3v-5l2-2Z" /><path d="M6.5 6 5 11h14l-1.5-5M6 13h.01M18 13h.01" /></>,
    door: <><path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17M3 21h18M14 12h.01" /></>,
    porch: <><path d="M3 11 12 4l9 7M5 10v10h14V10M3 20h18M9 20v-6h6v6" /></>,
    dot: <circle cx="12" cy="12" r="3" />,
  };
  return <svg {...shared}>{paths[name] ?? paths.alert}</svg>;
}

function formatDate(value?: string, options?: Intl.DateTimeFormatOptions) {
  if (!value) return '—';
  const date = new Date(asUtc(value));
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, options ?? { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function asUtc(value: string) {
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`;
}

function outcomeClass(value?: string | null) {
  const outcome = value?.toUpperCase() ?? '';
  if (['MATCH', 'VERIFIED', 'COMPLETED', 'APPROVE'].some((part) => outcome.includes(part))) return 'positive';
  if (['MISMATCH', 'CONFLICT', 'EXPIRED', 'ELAPSED', 'NO_EXPECTED', 'DENIED', 'BLOCK'].some((part) => outcome.includes(part))) return 'negative';
  if (['PARTIAL', 'REVIEW', 'MISSING', 'PENDING'].some((part) => outcome.includes(part))) return 'warning';
  return 'neutral';
}

function titleCase(value?: string | null) {
  return (value ?? 'unknown').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter: string) => letter.toUpperCase());
}

function StatusBadge({ value, label }: { value?: string | null; label?: string }) {
  return <span className={`status-badge ${outcomeClass(value)}`}><span className="status-dot" />{label ?? titleCase(value)}</span>;
}

function App() {
  const [section, setSection] = useState<Section>('overview');
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [backendConnected, setBackendConnected] = useState<boolean | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [eventDetail, setEventDetail] = useState<EventDetail | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [transcript, setTranscript] = useState(scenarios[0].text);
  const [assistantInput, setAssistantInput] = useState('What happened at the door?');
  const [assistantResponse, setAssistantResponse] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [showDeliveryForm, setShowDeliveryForm] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [visitorResponse, setVisitorResponse] = useState('Please wait while I check the expected delivery.');
  const [voiceQuestion, setVoiceQuestion] = useState('');
  const [audioLog, setAudioLog] = useState<AudioLogEntry[]>([]);
  const [listening, setListening] = useState(false);
  const [microphoneState, setMicrophoneState] = useState<'idle' | 'requesting' | 'listening' | 'denied' | 'error' | 'unsupported'>('idle');
  const [microphonePermission, setMicrophonePermission] = useState<'not-requested' | 'granted' | 'denied' | 'unknown'>('not-requested');
  const [audioBusy, setAudioBusy] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const addAudioLog = useCallback((title: string, detail: string, source: AudioLogEntry['source']) => {
    setAudioLog((current) => [{
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: new Date().toISOString(),
      title,
      detail,
      source,
    }, ...current].slice(0, 20));
  }, []);

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const response = await fetch(`${API}${path}`, init);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const message = typeof body?.detail === 'string' ? body.detail : `Request failed (${response.status})`;
      throw new Error(message);
    }
    return response.json();
  }, []);

  const loadData = useCallback(async () => {
    const [deliveryData, eventData, summaryData, auditData, integrationData, healthData] = await Promise.all([
      request('/api/deliveries'),
      request('/api/events'),
      request('/api/dashboard'),
      request('/api/audit'),
      request('/api/integrations/status'),
      request('/api/health'),
    ]);
    setDeliveries(deliveryData);
    setEvents(eventData);
    setSummary(summaryData);
    setAuditItems(auditData);
    setProviderStatus(integrationData);
    setBackendConnected(healthData.status === 'ok');
    setSelectedEventId((current) => current ?? eventData[0]?.id ?? null);
  }, [request]);

  const loadEventDetail = useCallback(async (eventId: string) => {
    try {
      const data = await request(`/api/events/${eventId}`);
      setEventDetail(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load event details.');
    }
  }, [request]);

  useEffect(() => {
    loadData().catch((loadError: unknown) => {
      setBackendConnected(false);
      setError(loadError instanceof Error ? loadError.message : 'Unable to connect to GuestVerify.');
    });
  }, [loadData]);

  useEffect(() => {
    if (selectedEventId) void loadEventDetail(selectedEventId);
    else setEventDetail(null);
  }, [selectedEventId, loadEventDetail]);

  useEffect(() => () => {
    recognitionRef.current?.abort();
    stopLocalSpeech();
  }, []);

  const selectedEvent = useMemo(() => events.find((event) => event.id === selectedEventId) ?? null, [events, selectedEventId]);
  const selectedDelivery = useMemo(() => {
    const id = eventDetail?.event.delivery_id ?? selectedEvent?.delivery_id;
    return deliveries.find((delivery) => delivery.id === id) ?? null;
  }, [deliveries, eventDetail, selectedEvent]);
  const activeDeliveries = useMemo(() => deliveries.filter((delivery) => delivery.status.toLowerCase() === 'pending' && new Date(asUtc(delivery.expected_end)).getTime() >= Date.now()), [deliveries]);
  const readinessDeliveries = useMemo(() => deliveries
    .filter((delivery) => ['pending', 'expired'].includes(delivery.status.toLowerCase()))
    .sort((a, b) => new Date(asUtc(a.expected_start)).getTime() - new Date(asUtc(b.expected_start)).getTime())
    .slice(0, 5), [deliveries]);
  const recentEvents = events.slice(0, 6);
  const pageTitle = navItems.find((item) => item.id === section)?.label ?? 'Overview';
  const speechRecognitionSupported = supportsSpeechRecognition();
  const speechSynthesisSupported = supportsSpeechSynthesis();
  const audioContextSupported = typeof window.AudioContext !== 'undefined';
  const perimeterEvents = events.filter((item) => item.source === 'perimeter_simulator' || item.device_id === 'perimeter-front-door-demo');

  const clearFeedback = () => {
    setError('');
    setNotice('');
  };

  const simulateEvent = async (event?: FormEvent) => {
    event?.preventDefault();
    clearFeedback();
    if (!transcript.trim()) {
      setError('Enter the visitor’s claim before analyzing the event.');
      return;
    }
    setLoading(true);
    try {
      const result = await request('/api/events/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'delivery_arrival',
          device_id: 'ring-doorbell-demo',
          transcript: transcript.trim(),
          source: 'simulator',
          event_timestamp: new Date().toISOString(),
        }),
      });
      await loadData();
      if (result.event_id) {
        setSelectedEventId(result.event_id);
        addAudioLog('Visitor claim received', transcript.trim(), 'simulated event');
        addAudioLog('Verification completed', titleCase(result.decision?.outcome), 'simulated event');
      }
      setNotice('Event analyzed. Review the evidence and recommendation below; a visitor’s claim is not identity proof.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The event could not be analyzed.');
    } finally {
      setLoading(false);
    }
  };

  const createDelivery = async (event: FormEvent) => {
    event.preventDefault();
    clearFeedback();
    if (!form.company.trim() || !form.recipient.trim()) {
      setError('Carrier and recipient are required.');
      return;
    }
    if (new Date(form.expected_end) <= new Date(form.expected_start)) {
      setError('The expected end must be later than the expected start.');
      return;
    }
    setSavingDelivery(true);
    try {
      await request('/api/deliveries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          company: form.company.trim(),
          recipient: form.recipient.trim(),
          tracking_reference: form.tracking_reference.trim() || null,
          verification_evidence: form.verification_evidence.trim() || null,
          expected_start: new Date(form.expected_start).toISOString(),
          expected_end: new Date(form.expected_end).toISOString(),
        }),
      });
      setForm(emptyForm());
      setShowDeliveryForm(false);
      setNotice('Delivery expectation added.');
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The delivery could not be saved.');
    } finally {
      setSavingDelivery(false);
    }
  };

  const revokeDelivery = async (deliveryId: string) => {
    clearFeedback();
    try {
      await request(`/api/deliveries/${deliveryId}/revoke`, { method: 'POST' });
      setNotice('Delivery expectation revoked.');
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The delivery could not be revoked.');
    }
  };

  const approveEvent = async (eventId: string) => {
    clearFeedback();
    try {
      await request(`/api/events/${eventId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Demo-Owner': 'demo-owner' },
        body: JSON.stringify({ decision: 'approve', requested_action: 'leave_in_porch_box', approver: 'demo-owner' }),
      });
      await request('/api/actions/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Demo-Owner': 'demo-owner' },
        body: JSON.stringify({ event_id: eventId, action_type: 'simulated_porch_box', requested_by: 'demo-owner' }),
      });
      setNotice('Homeowner approval recorded and simulated action completed. No physical device was operated.');
      await loadData();
      await loadEventDetail(eventId);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The simulated action could not be completed.');
    }
  };

  const requestEvidence = async (eventId: string) => {
    clearFeedback();
    try {
      await request(`/api/events/${eventId}/request-evidence`, { method: 'POST', headers: { 'X-Demo-Owner': 'demo-owner' } });
      setNotice('Evidence request recorded in the audit trail.');
      await loadData();
      await loadEventDetail(eventId);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The evidence request could not be recorded.');
    }
  };

  const askAssistant = async (event: FormEvent, messageInput = assistantInput) => {
    event.preventDefault();
    if (!messageInput.trim()) return;
    clearFeedback();
    setAssistantLoading(true);
    try {
      const data = await request('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageInput.trim() }),
      });
      setAssistantResponse(data.response || 'No response was returned.');
      addAudioLog('Assistant response received', data.response || 'No response was returned.', 'homeowner action');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The assistant is unavailable.');
    } finally {
      setAssistantLoading(false);
    }
  };

  const startMicrophone = () => {
    clearFeedback();
    if (!supportsSpeechRecognition()) {
      setMicrophoneState('unsupported');
      setMicrophonePermission('unknown');
      setError('Speech recognition is not supported in this browser. You can still type your question.');
      return;
    }
    const recognition = createSpeechRecognition();
    if (!recognition) {
      setMicrophoneState('unsupported');
      return;
    }
    recognitionRef.current?.abort();
    recognitionRef.current = recognition;
    setMicrophoneState('requesting');
    recognition.onstart = () => {
      setListening(true);
      setMicrophoneState('listening');
      setMicrophonePermission('granted');
    };
    recognition.onresult = (event) => {
      const parts: string[] = [];
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) parts.push(result[0].transcript.trim());
      }
      if (parts.length) {
        const transcriptText = parts.join(' ');
        setVoiceQuestion((current) => `${current}${current ? ' ' : ''}${transcriptText}`);
        addAudioLog('Speech transcribed', transcriptText, 'homeowner action');
      }
    };
    recognition.onerror = (event) => {
      setListening(false);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setMicrophoneState('denied');
        setMicrophonePermission('denied');
        setError('Microphone permission was denied. Enable microphone access in your browser settings or type your question.');
      } else if (event.error === 'audio-capture') {
        setMicrophoneState('error');
        setMicrophonePermission('unknown');
        setError('No microphone is available. Connect a microphone or type your question.');
      } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
        setMicrophoneState('error');
        setError(`Speech recognition stopped: ${event.error}. You can type your question instead.`);
      }
    };
    recognition.onend = () => {
      setListening(false);
      setMicrophoneState((current) => current === 'listening' || current === 'requesting' ? 'idle' : current);
    };
    try {
      recognition.start();
    } catch {
      setListening(false);
      setMicrophoneState('error');
      setError('The microphone could not be started. Try again or type your question.');
    }
  };

  const stopMicrophone = () => {
    recognitionRef.current?.stop();
    setListening(false);
    setMicrophoneState('idle');
  };

  const askVoiceQuestion = async (event: FormEvent) => {
    event.preventDefault();
    const message = voiceQuestion.trim();
    if (!message) return;
    setAssistantInput(message);
    await askAssistant(event, message);
  };

  const previewSpeech = (text: string, kind: 'response' | 'summary' = 'response') => {
    clearFeedback();
    if (!text.trim()) {
      setError('Enter a message before previewing speech.');
      return;
    }
    const started = speakLocally(text, {
      onEnd: () => addAudioLog(kind === 'response' ? 'Speech preview completed' : 'Summary read aloud', text, 'browser audio'),
      onError: (message) => setError(message),
    });
    if (!started) return;
    addAudioLog(kind === 'response' ? 'Speech preview started' : 'Summary playback started', text, 'browser audio');
  };

  const previewVisitorResponse = async () => {
    if (!selectedEventId) {
      setError('Select a visitor event before preparing a visitor response.');
      return;
    }
    const message = visitorResponse.trim();
    if (!message) {
      setError('Write a response before playing the local preview.');
      return;
    }
    clearFeedback();
    const started = speakLocally(message, { onError: (message) => setError(message) });
    if (!started) return;
    addAudioLog('Response preview started', message, 'browser audio');
    try {
      await request(`/api/events/${selectedEventId}/response-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Demo-Owner': 'demo-owner' },
        body: JSON.stringify({ message }),
      });
      setNotice('Local audio preview started on this device; no sound was sent to the doorbell.');
      await loadData();
    } catch (requestError) {
      stopLocalSpeech();
      setError(requestError instanceof Error ? requestError.message : 'The response preview could not be audited.');
    }
  };

  const playDoorbellSample = async () => {
    clearFeedback();
    setAudioBusy(true);
    try {
      await playLocalDoorbell();
      addAudioLog('Doorbell sample played', 'Two-tone sample generated locally in this browser.', 'browser audio');
      setNotice('Doorbell sample played locally. This did not represent a real sensor event.');
    } catch (playbackError) {
      setError(playbackError instanceof Error ? playbackError.message : 'The doorbell sample could not be played.');
    } finally {
      setAudioBusy(false);
    }
  };

  const simulatePerimeterEvent = async () => {
    clearFeedback();
    setLoading(true);
    try {
      const result = await request('/api/events/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'manual_simulation',
          device_id: 'perimeter-front-door-demo',
          transcript: 'Visitor approached front door.',
          source: 'perimeter_simulator',
          event_timestamp: new Date().toISOString(),
        }),
      });
      await loadData();
      if (result.event_id) setSelectedEventId(result.event_id);
      addAudioLog('Perimeter event simulated', 'Visitor approached front door. No connected sensor was used.', 'simulated event');
      setNotice('Simulated front-door activity was added to the visitor event history.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The perimeter event could not be simulated.');
    } finally {
      setLoading(false);
    }
  };

  const navigate = (next: Section) => {
    setSection(next);
    setMobileNavOpen(false);
    clearFeedback();
  };

  const nav = (
    <>
      <div className="brand-lockup">
        <span className="brand-mark"><Icon name="shield" size={23} /></span>
        <span className="brand-name">Guest<span>Verify</span></span>
      </div>
      <div className="nav-caption">WORKSPACE</div>
      <nav className="side-nav" aria-label="Main navigation">
        {navItems.map((item) => (
          <button key={item.id} className={`nav-item ${section === item.id ? 'active' : ''}`} onClick={() => navigate(item.id)} aria-current={section === item.id ? 'page' : undefined}>
            <Icon name={item.icon} size={18} /><span>{item.label}</span>
            {item.id === 'events' && summary?.pending_approvals ? <span className="nav-count">{summary.pending_approvals}</span> : null}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="mode-card">
          <span className="mode-indicator" />
          <div><strong>Local demo mode</strong><span>Deterministic verification</span></div>
        </div>
        <div className="sidebar-footnote"><Icon name="alert" size={14} /> Ring activity is simulated</div>
      </div>
    </>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">{nav}</aside>
      {mobileNavOpen ? <div className="mobile-scrim" onClick={() => setMobileNavOpen(false)} /> : null}
      <aside className={`mobile-sidebar ${mobileNavOpen ? 'open' : ''}`}>{nav}</aside>
      <div className="app-main">
        <header className="app-header">
          <div className="header-leading">
            <button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><Icon name="list" /></button>
            <div className="breadcrumb"><span>GuestVerify</span><Icon name="chevron" size={14} /><strong>{pageTitle}</strong></div>
          </div>
          <div className="header-status">
            <span className="demo-label"><span className="demo-dot" />Demo environment</span>
            <span className={`connection-label ${backendConnected === false ? 'offline' : ''}`}><span className="connection-dot" />{backendConnected === null ? 'Connecting' : backendConnected ? 'API connected' : 'API unavailable'}</span>
          </div>
        </header>

        <main className="page-content">
          {(error || notice) ? <div className={`feedback ${error ? 'feedback-error' : 'feedback-success'}`} role={error ? 'alert' : 'status'}><Icon name={error ? 'alert' : 'check'} size={17} /><span>{error || notice}</span><button className="feedback-close" aria-label="Dismiss message" onClick={clearFeedback}><Icon name="close" size={16} /></button></div> : null}
          {section === 'overview' ? (
            <Overview
              summary={summary}
              activeDeliveries={activeDeliveries}
              readinessDeliveries={readinessDeliveries}
              events={recentEvents}
              deliveries={deliveries}
              assistantInput={assistantInput}
              assistantResponse={assistantResponse}
              assistantLoading={assistantLoading}
              onAssistantInput={setAssistantInput}
              onAskAssistant={askAssistant}
              onNavigate={navigate}
              onSelectEvent={(id) => { setSelectedEventId(id); navigate('events'); }}
              onSimulate={() => navigate('events')}
              perimeterEvents={perimeterEvents}
            />
          ) : null}
          {section === 'deliveries' ? (
            <DeliveriesPage
              deliveries={deliveries}
              showForm={showDeliveryForm}
              form={form}
              saving={savingDelivery}
              onShowForm={() => { setForm(emptyForm()); setShowDeliveryForm(true); }}
              onCloseForm={() => { setShowDeliveryForm(false); clearFeedback(); }}
              onChange={(next) => setForm(next)}
              onSubmit={createDelivery}
              onRevoke={revokeDelivery}
            />
          ) : null}
          {section === 'events' ? (
            <EventsPage
              events={events}
              selectedEvent={selectedEvent}
              detail={eventDetail}
              delivery={selectedDelivery}
              transcript={transcript}
              busy={loading}
              onTranscript={setTranscript}
              onScenario={setTranscript}
              onSimulate={simulateEvent}
              onSelect={setSelectedEventId}
              onApprove={approveEvent}
              onRequestEvidence={requestEvidence}
            />
          ) : null}
          {section === 'audio' ? (
            <AudioPage
              selectedEvent={selectedEvent}
              detail={eventDetail}
              response={visitorResponse}
              onResponse={setVisitorResponse}
              onResponseComposed={(text) => addAudioLog('Visitor response composed', text, 'homeowner action')}
              onPreviewResponse={previewVisitorResponse}
              onPlayDoorbell={playDoorbellSample}
              audioBusy={audioBusy}
              microphoneState={microphoneState}
              microphonePermission={microphonePermission}
              listening={listening}
              speechRecognitionSupported={speechRecognitionSupported}
              speechSynthesisSupported={speechSynthesisSupported}
              question={voiceQuestion}
              onQuestion={setVoiceQuestion}
              onStartMicrophone={startMicrophone}
              onStopMicrophone={stopMicrophone}
              onAskAssistant={askVoiceQuestion}
              assistantLoading={assistantLoading}
              assistantResponse={assistantResponse}
              onReadSummary={() => previewSpeech(assistantResponse || 'No assistant response is available yet.', 'summary')}
              onReadEventSummary={() => previewSpeech(eventDetail?.decision ? `${eventDetail.decision.outcome}. ${eventDetail.decision.explanation} Recommended action: ${titleCase(eventDetail.decision.recommended_action)}.` : 'No visitor summary is available yet.', 'summary')}
              log={audioLog}
              onOpenEvents={() => navigate('events')}
            />
          ) : null}
          {section === 'perimeter' ? (
            <PerimeterPage
              events={events}
              loading={loading}
              onSimulate={simulatePerimeterEvent}
              onSelectEvent={(id) => { setSelectedEventId(id); navigate('events'); }}
            />
          ) : null}
          {section === 'audit' ? (
            <AuditPage events={events} auditItems={auditItems} selectedEventId={selectedEventId} detail={eventDetail} onSelect={setSelectedEventId} />
          ) : null}
          {section === 'integrations' ? <IntegrationsPage provider={providerStatus} connected={backendConnected} speechRecognitionSupported={speechRecognitionSupported} speechSynthesisSupported={speechSynthesisSupported} audioContextSupported={audioContextSupported} onRefresh={() => loadData().catch((e: unknown) => setError(e instanceof Error ? e.message : 'Refresh failed.'))} /> : null}
        </main>
      </div>
    </div>
  );
}

function PageHeading({ title, description, action }: { title: string; description: string; action?: JSX.Element }) {
  return <div className="page-heading"><div><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function Overview({ summary, activeDeliveries, readinessDeliveries, events, deliveries, assistantInput, assistantResponse, assistantLoading, onAssistantInput, onAskAssistant, onNavigate, onSelectEvent, onSimulate, perimeterEvents }: {
  summary: DashboardSummary | null;
  activeDeliveries: Delivery[];
  readinessDeliveries: Delivery[];
  events: EventItem[];
  deliveries: Delivery[];
  assistantInput: string;
  assistantResponse: string;
  assistantLoading: boolean;
  onAssistantInput: (value: string) => void;
  onAskAssistant: (event: FormEvent) => void;
  onNavigate: (section: Section) => void;
  onSelectEvent: (id: string) => void;
  onSimulate: () => void;
  perimeterEvents: EventItem[];
}) {
  const metrics = [
    { label: 'Visitor events', value: summary?.total_events ?? '—', tone: 'blue', note: 'Recorded activity' },
    { label: 'Pending reviews', value: summary?.pending_approvals ?? '—', tone: 'amber', note: 'Homeowner attention' },
    { label: 'Active deliveries', value: summary ? activeDeliveries.length : '—', tone: 'green', note: 'Expected now or soon' },
    { label: 'Needs attention', value: summary ? summary.partial_matches + summary.warnings : '—', tone: 'red', note: 'Partial or conflicting' },
  ];
  return (
    <>
      <PageHeading title="Overview" description="Monitor expected deliveries and verify visitor claims." action={<button className="button button-secondary" onClick={() => onNavigate('events')}><Icon name="activity" size={16} /> Simulate event</button>} />
      <section className="metric-row" aria-label="Delivery and visitor activity summary">
        {metrics.map((metric) => <div className="metric" key={metric.label}><span className={`metric-marker ${metric.tone}`} /><div className="metric-copy"><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.note}</small></div></div>)}
      </section>
      <div className="overview-grid">
        <section className="surface activity-panel">
          <div className="section-heading"><div><h2>Recent visitor activity</h2><p>Claims, verification outcomes, and next steps</p></div><button className="text-button" onClick={() => onNavigate('events')}>All events <Icon name="arrow" size={15} /></button></div>
          {events.length === 0 ? <EmptyState icon="activity" title="No visitor events yet" text="Simulate an arrival to review a claim against your delivery expectations." action={<button className="button button-primary" onClick={onSimulate}>Simulate visitor event</button>} /> : (
            <div className="activity-list">
              {events.map((event) => {
                const delivery = deliveries.find((item) => item.id === event.delivery_id);
                return <button className="activity-row" key={event.id} onClick={() => onSelectEvent(event.id)}>
                  <span className={`activity-icon ${outcomeClass(event.outcome || event.processing_status)}`}><Icon name="activity" size={17} /></span>
                      <span className="activity-main"><span className="activity-title">{event.transcript || titleCase(event.event_type)}</span><span className="activity-sub">{delivery ? `${delivery.company} · ${delivery.recipient}` : 'No delivery linked'} <span className="separator">·</span> {event.device_id}</span><span className="activity-recommendation">Recommends: {titleCase(event.recommended_action)}</span></span>
                      <span className="activity-meta"><StatusBadge value={event.outcome || event.processing_status} /><time>{formatDate(event.event_timestamp, { hour: 'numeric', minute: '2-digit' })}</time></span>
                  <Icon name="chevron" size={16} />
                </button>;
              })}
            </div>
          )}
          <div className="activity-foot"><span>Visitor statements are claims, not identity evidence.</span><button className="text-button" onClick={() => onNavigate('audit')}>Review evidence & audit <Icon name="arrow" size={15} /></button></div>
        </section>
        <section className="surface readiness-panel">
          <div className="section-heading"><div><h2>Delivery readiness</h2><p>Current expectations and time windows</p></div><button className="icon-button" aria-label="View all deliveries" onClick={() => onNavigate('deliveries')}><Icon name="arrow" size={17} /></button></div>
          {readinessDeliveries.length === 0 ? <EmptyState icon="box" title="No active expectations" text="Add a delivery so incoming claims can be compared against known details." action={<button className="button button-secondary" onClick={() => onNavigate('deliveries')}>Manage deliveries</button>} /> : (
            <div className="readiness-list">
              {readinessDeliveries.map((delivery) => <div className="readiness-row" key={delivery.id}>
                <span className="carrier-avatar">{delivery.company.slice(0, 1).toUpperCase()}</span>
                <span className="readiness-copy"><strong>{delivery.company} <span>for</span> {delivery.recipient}</strong><small>{delivery.tracking_reference || 'No reference provided'} · {deliveryState(delivery)}</small></span>
                <span className="readiness-time"><strong>{formatDate(delivery.expected_start, { month: 'short', day: 'numeric' })}</strong><small>{formatDate(delivery.expected_start, { hour: 'numeric', minute: '2-digit' })}–{formatDate(delivery.expected_end, { hour: 'numeric', minute: '2-digit' })}</small></span>
              </div>)}
            </div>
          )}
          <button className="readiness-add" onClick={() => onNavigate('deliveries')}><Icon name="plus" size={16} /> Add delivery expectation</button>
        </section>
      </div>
      <section className="surface assistant-panel">
        <div className="section-heading"><div><h2>Ask GuestVerify</h2><p>Get a summary of the latest visitor event.</p></div><span className="assistant-mode"><Icon name="spark" size={13} /> Demo assistant</span></div>
        <form className="assistant-form" onSubmit={onAskAssistant}>
          <label className="sr-only" htmlFor="assistant-question">Ask about visitor activity</label>
          <input id="assistant-question" value={assistantInput} onChange={(event) => onAssistantInput(event.target.value)} placeholder="Ask about the current event…" />
          <button className="button button-secondary" type="submit" disabled={assistantLoading}>{assistantLoading ? 'Asking…' : 'Ask'}</button>
        </form>
        {assistantResponse ? <p className="assistant-response">{assistantResponse}</p> : <p className="assistant-disclaimer">Answers summarize recorded demo data. They do not authorize an action.</p>}
      </section>
      <section className="surface overview-perimeter">
        <div className="section-heading"><div><h2>Perimeter awareness</h2><p>Simulated events only · no connected sensors</p></div><button className="text-button" onClick={() => onNavigate('perimeter')}>View zones <Icon name="arrow" size={15} /></button></div>
        <div className="overview-perimeter-row">
          <span className="zone-mini-icon"><Icon name="home" size={17} /></span>
          <span><strong>{perimeterEvents.length ? `${perimeterEvents.length} simulated front-door ${perimeterEvents.length === 1 ? 'event' : 'events'}` : 'No recent simulated activity'}</strong><small>Front door · illustrative zone</small></span>
          {perimeterEvents[0] ? <StatusBadge value={perimeterEvents[0].processing_status} /> : <StatusBadge value="neutral" label="No sensor connected" />}
        </div>
      </section>
      <section className="principle-strip"><Icon name="shield" size={19} /><span><strong>Verify the delivery, not just the visitor’s story.</strong> A matching claim may inform a decision, but it does not prove identity or authorize physical access.</span></section>
    </>
  );
}

function EmptyState({ icon, title, text, action }: { icon: string; title: string; text: string; action?: JSX.Element }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name={icon} size={21} /></span><strong>{title}</strong><p>{text}</p>{action}</div>;
}

function DeliveriesPage({ deliveries, showForm, form, saving, onShowForm, onCloseForm, onChange, onSubmit, onRevoke }: {
  deliveries: Delivery[];
  showForm: boolean;
  form: ReturnType<typeof emptyForm>;
  saving: boolean;
  onShowForm: () => void;
  onCloseForm: () => void;
  onChange: (form: ReturnType<typeof emptyForm>) => void;
  onSubmit: (event: FormEvent) => void;
  onRevoke: (id: string) => void;
}) {
  const activeCount = deliveries.filter((delivery) => delivery.status.toLowerCase() === 'pending').length;
  return <>
    <PageHeading title="Deliveries" description="Manage expected arrivals and the evidence used to review them." action={<button className="button button-primary" onClick={onShowForm}><Icon name="plus" size={16} /> Add expectation</button>} />
    <div className="page-toolbar"><span><strong>{deliveries.length}</strong> expectations <span className="toolbar-divider">·</span> <strong>{activeCount}</strong> active</span><span className="toolbar-note"><Icon name="clock" size={15} /> Time windows shown in your local timezone</span></div>
    {showForm ? <section className="surface delivery-form">
      <div className="form-heading"><div><h2>New delivery expectation</h2><p>Use details from a trusted order or tracking source where available.</p></div><button className="icon-button" aria-label="Close form" onClick={onCloseForm}><Icon name="close" /></button></div>
      <form onSubmit={onSubmit}>
        <div className="form-section-label">DELIVERY DETAILS</div>
        <div className="form-grid">
          <Field label="Carrier" required><input autoFocus value={form.company} onChange={(event) => onChange({ ...form, company: event.target.value })} placeholder="e.g. Amazon, UPS, FedEx" required /></Field>
          <Field label="Recipient" required><input value={form.recipient} onChange={(event) => onChange({ ...form, recipient: event.target.value })} placeholder="Name on the order" required /></Field>
          <Field label="Tracking or reference ID" optional><input value={form.tracking_reference} onChange={(event) => onChange({ ...form, tracking_reference: event.target.value })} placeholder="e.g. 1Z… or order reference" /></Field>
          <Field label="Destination"><select value={form.destination} onChange={(event) => onChange({ ...form, destination: event.target.value })}><option value="porch_box">Porch box</option><option value="doorstep">Doorstep</option><option value="mailroom">Mailroom</option><option value="handover">Hand to recipient</option></select></Field>
        </div>
        <div className="form-section-label form-section-spaced">EXPECTED TIME WINDOW</div>
        <div className="form-grid form-grid-two">
          <Field label="Expected from" required><input type="datetime-local" value={form.expected_start} onChange={(event) => onChange({ ...form, expected_start: event.target.value })} required /></Field>
          <Field label="Expected until" required><input type="datetime-local" value={form.expected_end} onChange={(event) => onChange({ ...form, expected_end: event.target.value })} required /></Field>
        </div>
        <details className="advanced-fields"><summary>Verification and action policy <span>Optional</span></summary><div className="form-grid advanced-grid">
          <Field label="Allowed simulated action"><select value={form.allowed_action} onChange={(event) => onChange({ ...form, allowed_action: event.target.value })}><option value="leave_in_porch_box">Leave in porch box</option><option value="handover_only">Handover only</option><option value="no_action">No action</option></select></Field>
          <Field label="Expected verification evidence" optional><input value={form.verification_evidence} onChange={(event) => onChange({ ...form, verification_evidence: event.target.value })} placeholder="e.g. tracking reference" /></Field>
        </div></details>
        <div className="form-actions"><button type="button" className="button button-secondary" onClick={onCloseForm}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? <><span className="spinner" /> Saving…</> : 'Save expectation'}</button></div>
      </form>
    </section> : null}
    <section className="surface delivery-table-surface">
      <div className="section-heading"><div><h2>Expected deliveries</h2><p>Revoke an expectation when plans change.</p></div></div>
      {deliveries.length === 0 ? <EmptyState icon="box" title="No delivery expectations" text="Add a delivery to help evaluate future visitor claims." action={<button className="button button-primary" onClick={onShowForm}>Add first delivery</button>} /> : (
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Carrier & recipient</th><th>Reference</th><th>Expected arrival</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
          {deliveries.map((delivery) => <tr key={delivery.id}>
            <td><span className="table-primary">{delivery.company}</span><span className="table-secondary">{delivery.recipient}</span></td>
            <td><span className="table-reference">{delivery.tracking_reference || '—'}</span></td>
            <td><span className="table-primary">{formatDate(delivery.expected_start, { dateStyle: 'medium' })}</span><span className="table-secondary">{formatDate(delivery.expected_start, { hour: 'numeric', minute: '2-digit' })} – {formatDate(delivery.expected_end, { hour: 'numeric', minute: '2-digit' })}</span></td>
            <td><StatusBadge value={delivery.status === 'pending' ? deliveryState(delivery) : delivery.status} /></td>
            <td className="table-actions">{delivery.status.toLowerCase() === 'pending' ? <button className="button button-quiet button-small" onClick={() => onRevoke(delivery.id)}>Revoke</button> : <span className="muted-action">No actions</span>}</td>
          </tr>)}
        </tbody></table></div>
      )}
    </section>
  </>;
}

function Field({ label, required, optional, children }: { label: string; required?: boolean; optional?: boolean; children: JSX.Element }) {
  return <label className="field"><span>{label}{required ? <em>Required</em> : optional ? <small>Optional</small> : null}</span>{children}</label>;
}

function deliveryState(delivery: Delivery) {
  const now = Date.now();
  const start = new Date(asUtc(delivery.expected_start)).getTime();
  const end = new Date(asUtc(delivery.expected_end)).getTime();
  if (delivery.status.toLowerCase() !== 'pending') return titleCase(delivery.status);
  if (end < now) return 'window elapsed';
  if (start > now) return 'scheduled';
  return 'expected now';
}

function EventsPage({ events, selectedEvent, detail, delivery, transcript, busy, onTranscript, onScenario, onSimulate, onSelect, onApprove, onRequestEvidence }: {
  events: EventItem[];
  selectedEvent: EventItem | null;
  detail: EventDetail | null;
  delivery: Delivery | null;
  transcript: string;
  busy: boolean;
  onTranscript: (value: string) => void;
  onScenario: (value: string) => void;
  onSimulate: (event?: FormEvent) => void;
  onSelect: (id: string) => void;
  onApprove: (id: string) => void;
  onRequestEvidence: (id: string) => void;
}) {
  const claim = detail?.event.transcript || selectedEvent?.transcript || '';
  return <>
    <PageHeading title="Visitor events" description="Simulate arrivals, inspect verification decisions, and review next steps." />
    <div className="event-workspace">
      <div className="event-main-column">
        <section className="surface simulator">
          <div className="section-heading"><div className="simulator-title"><span className="simulator-icon"><Icon name="activity" size={18} /></span><div><h2>Simulate visitor event</h2><p>Test the verification workflow with a visitor’s stated claim.</p></div></div><span className="simulation-tag"><span />Simulated</span></div>
          <form onSubmit={(event) => onSimulate(event)}>
            <label className="field"><span>Visitor claim</span><textarea value={transcript} onChange={(event) => onTranscript(event.target.value)} rows={3} placeholder="Enter what the visitor says…" /></label>
            <div className="scenario-row"><span>Try a scenario</span>{scenarios.map((scenario) => <button key={scenario.label} type="button" className={`scenario-chip ${transcript === scenario.text ? 'chosen' : ''}`} onClick={() => onScenario(scenario.text)}>{scenario.label}</button>)}</div>
            <div className="simulator-footer"><span><Icon name="alert" size={15} /> A spoken claim is not proof of identity.</span><button className="button button-primary" type="submit" disabled={busy}>{busy ? <><span className="spinner" /> Analyzing…</> : <><Icon name="spark" size={16} /> Analyze event</>}</button></div>
          </form>
        </section>
        {selectedEvent && detail ? <EventResult event={selectedEvent} detail={detail} delivery={delivery} onApprove={onApprove} onRequestEvidence={onRequestEvidence} /> : <section className="surface event-placeholder"><EmptyState icon="shield" title="Verification results appear here" text="Analyze a simulated event to see the evidence reviewed, field comparisons, outcome, and recommendation." /></section>}
      </div>
      <aside className="surface event-history">
        <div className="section-heading"><div><h2>Event history</h2><p>{events.length} recorded {events.length === 1 ? 'event' : 'events'}</p></div></div>
        {events.length === 0 ? <EmptyState icon="activity" title="No events recorded" text="Simulated visitor activity will appear here." /> : <div className="history-list">{events.map((event) => <button key={event.id} className={`history-item ${selectedEvent?.id === event.id ? 'selected' : ''}`} onClick={() => onSelect(event.id)}>
          <span className={`history-mark ${outcomeClass(event.processing_status)}`}><Icon name="activity" size={15} /></span><span className="history-copy"><strong>{event.transcript || titleCase(event.event_type)}</strong><small>{formatDate(event.event_timestamp)}</small><StatusBadge value={event.processing_status} /></span><Icon name="chevron" size={15} />
        </button>)}</div>}
      </aside>
    </div>
  </>;
}

function EventResult({ event, detail, delivery, onApprove, onRequestEvidence }: { event: EventItem; detail: EventDetail; delivery: Delivery | null; onApprove: (id: string) => void; onRequestEvidence: (id: string) => void }) {
  const decision = detail.decision;
  const auditRelated = detail.evidence.length > 0 || detail.approvals.length > 0;
  return <section className="surface result-panel">
    <div className="result-header"><div><div className="result-eyebrow">VERIFICATION RESULT <span>·</span> {formatDate(event.event_timestamp)}</div><h2>{decision?.outcome ? titleCase(decision.outcome) : 'No decision recorded'}</h2></div><StatusBadge value={decision?.outcome || event.processing_status} /></div>
    <div className="result-claim"><span>VISITOR CLAIM</span><p>“{event.transcript || 'No transcript provided'}”</p><small>Claimed by visitor · not independently authenticated</small></div>
    <div className="result-facts">
      <Fact label="Related expectation" value={delivery ? `${delivery.company} · ${delivery.recipient}` : 'No delivery linked'} detail={delivery?.tracking_reference || 'No reference'} />
      <Fact label="Recommendation" value={titleCase(decision?.recommended_action)} detail={decision?.policy_decision ? `Policy: ${titleCase(decision.policy_decision)}` : 'No recommendation available'} />
    </div>
    <div className="comparison-grid">
      <Comparison title="Matched fields" icon="check" tone="positive" items={decision?.matching_fields ?? []} empty="No matching fields returned." />
      <Comparison title="Conflicts" icon="alert" tone="negative" items={decision?.conflicting_fields ?? []} empty="No conflicts returned." />
      <Comparison title="Missing evidence" icon="search" tone="warning" items={decision?.missing_evidence ?? []} empty="No missing evidence reported." />
    </div>
    {decision?.explanation ? <div className="reasoning"><strong>Reasoning</strong><p>{decision.explanation}</p></div> : null}
    <div className="evidence-reviewed"><div className="subsection-heading"><h3>Evidence reviewed</h3><span>{detail.evidence.length} items</span></div>
      {detail.evidence.length ? <div className="evidence-list">{detail.evidence.map((item) => <div className="evidence-row" key={item.id}><span className={`evidence-icon ${item.independent_authentication ? 'verified' : 'claim'}`}><Icon name={item.independent_authentication ? 'check' : 'alert'} size={15} /></span><div><strong>{titleCase(item.evidence_type)}</strong><small>{item.value || item.external_reference || item.source} · {item.source}</small></div><StatusBadge value={item.verification_status} label={item.independent_authentication ? 'Independent source' : 'Claim only'} /></div>)}</div> : <p className="empty-inline">No evidence records are available for this event.</p>}
    </div>
    {detail.approvals.length ? <div className="approval-record"><div className="subsection-heading"><h3>Homeowner approval</h3><span>{detail.approvals.length} record{detail.approvals.length === 1 ? '' : 's'}</span></div>{detail.approvals.map((approval) => <div className="approval-row" key={approval.id}><StatusBadge value={approval.decision} /><span>{approval.approver} · {titleCase(approval.requested_action)}</span><time>{formatDate(approval.timestamp)}</time></div>)}</div> : null}
    {detail.actions.length ? <div className="approval-record"><div className="subsection-heading"><h3>Recorded simulated action</h3><span>{detail.actions.length} record{detail.actions.length === 1 ? '' : 's'}</span></div>{detail.actions.map((action) => <div className="action-record" key={action.id}><StatusBadge value={action.execution_mode} label={titleCase(action.execution_mode)} /><div><strong>{titleCase(action.action_type)}</strong><small>{titleCase(action.authorization_check_result)} · {action.result.replace(/_/g, ' ')}</small></div><time>{formatDate(action.timestamp)}</time></div>)}</div> : null}
    {auditRelated ? <p className="audit-hint"><Icon name="list" size={15} /> Related evidence and approval records are reflected in Evidence & audit.</p> : null}
    <div className="result-footer"><span><Icon name="shield" size={16} /> No physical access device is controlled by this demo.</span><div>{(decision?.missing_evidence.length || decision?.conflicting_fields.length) ? <button className="button button-secondary" onClick={() => onRequestEvidence(event.id)}><Icon name="search" size={15} /> Request evidence</button> : null}{decision?.policy_decision === 'allow_only_designated_delivery_area' && !detail.actions.length ? <button className="button button-primary" onClick={() => onApprove(event.id)}><Icon name="check" size={15} /> Approve & simulate</button> : null}</div></div>
  </section>;
}

function Fact({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="fact"><span>{label}</span><strong>{value || 'Not provided'}</strong>{detail ? <small>{detail}</small> : null}</div>;
}

function Comparison({ title, icon, tone, items, empty }: { title: string; icon: string; tone: string; items: string[]; empty: string }) {
  return <div className={`comparison ${tone}`}><div className="comparison-title"><Icon name={icon} size={15} /><strong>{title}</strong><span>{items.length}</span></div>{items.length ? <ul>{items.map((item) => <li key={item}>{titleCase(item)}</li>)}</ul> : <p>{empty}</p>}</div>;
}

function AuditPage({ events, auditItems, selectedEventId, detail, onSelect }: { events: EventItem[]; auditItems: AuditItem[]; selectedEventId: string | null; detail: EventDetail | null; onSelect: (id: string) => void }) {
  const selected = events.find((event) => event.id === selectedEventId) ?? null;
  const relatedAudit = auditItems.filter((item) => item.event_id === selectedEventId);
  const allAudit = selectedEventId ? relatedAudit : auditItems;
  return <>
    <PageHeading title="Audit history" description="Review recorded evidence and the actions documented by the verification workflow." />
    <div className="audit-layout">
      <section className="surface audit-events">
        <div className="section-heading"><div><h2>Events</h2><p>Select an event to inspect its records.</p></div></div>
        {events.length ? <div className="history-list">{events.map((event) => <button key={event.id} className={`history-item ${event.id === selectedEventId ? 'selected' : ''}`} onClick={() => onSelect(event.id)}><span className={`history-mark ${outcomeClass(event.processing_status)}`}><Icon name="activity" size={15} /></span><span className="history-copy"><strong>{event.transcript || titleCase(event.event_type)}</strong><small>{formatDate(event.event_timestamp)}</small><StatusBadge value={event.processing_status} /></span><Icon name="chevron" size={15} /></button>)}</div> : <EmptyState icon="activity" title="No event records" text="Run a simulated event to create the first verification record." />}
      </section>
      <section className="audit-detail-column">
        {selected && detail ? <>
          <div className="surface audit-evidence">
            <div className="section-heading"><div><h2>Evidence records</h2><p>{formatDate(selected.event_timestamp)}</p></div><StatusBadge value={detail.decision?.outcome || selected.processing_status} /></div>
            <div className="audit-claim"><span>ORIGINAL VISITOR CLAIM</span><p>{selected.transcript || 'No transcript provided'}</p></div>
            {detail.evidence.length ? <div className="evidence-list">{detail.evidence.map((item) => <div className="evidence-row" key={item.id}><span className={`evidence-icon ${item.independent_authentication ? 'verified' : 'claim'}`}><Icon name={item.independent_authentication ? 'check' : 'alert'} size={15} /></span><div><strong>{titleCase(item.evidence_type)}</strong><small>{item.value || item.external_reference || 'No value recorded'}</small><small>{item.source} · {formatDate(item.timestamp)}</small></div><StatusBadge value={item.verification_status} label={item.independent_authentication ? 'Independent source' : 'Claim only'} /></div>)}</div> : <p className="empty-inline">No evidence rows are available for this event.</p>}
            <div className="field-comparison"><Comparison title="Matched" icon="check" tone="positive" items={detail.decision?.matching_fields ?? []} empty="None recorded" /><Comparison title="Conflicts" icon="alert" tone="negative" items={detail.decision?.conflicting_fields ?? []} empty="None recorded" /><Comparison title="Missing" icon="search" tone="warning" items={detail.decision?.missing_evidence ?? []} empty="None reported" /></div>
            {detail.approvals.length ? <div className="approval-record"><div className="subsection-heading"><h3>Approvals</h3></div>{detail.approvals.map((approval) => <div className="approval-row" key={approval.id}><StatusBadge value={approval.decision} /><span>{approval.approver} · {titleCase(approval.requested_action)}</span><time>{formatDate(approval.timestamp)}</time></div>)}</div> : null}
            {detail.actions.length ? <div className="approval-record"><div className="subsection-heading"><h3>Recorded simulated action</h3></div>{detail.actions.map((action) => <div className="action-record" key={action.id}><StatusBadge value={action.execution_mode} label={titleCase(action.execution_mode)} /><div><strong>{titleCase(action.action_type)}</strong><small>{titleCase(action.authorization_check_result)} · {action.result.replace(/_/g, ' ')}</small></div><time>{formatDate(action.timestamp)}</time></div>)}</div> : null}
          </div>
          <div className="surface audit-trail">
            <div className="section-heading"><div><h2>Audit history</h2><p>Recorded events for this visitor event.</p></div></div>
            {allAudit.length ? <div className="timeline">{allAudit.map((item) => <div className="timeline-item" key={item.id}><span className="timeline-marker" /><div className="timeline-copy"><strong>{titleCase(item.event_type)}</strong><p>{typeof item.details === 'string' ? item.details : Object.entries(item.details).map(([key, value]) => `${titleCase(key)}: ${String(value)}`).join(' · ')}</p><small>{item.actor} · {formatDate(item.timestamp)}</small></div></div>)}</div> : <EmptyState icon="list" title="No audit entries for this event" text="Only actions recorded by the backend appear here." />}
          </div>
        </> : <section className="surface"><EmptyState icon="list" title="Select a visitor event" text="Evidence details and audit history are loaded from the backend for each event." /></section>}
      </section>
    </div>
  </>;
}

const responseSuggestions = [
  'Please state the delivery company and tracking reference.',
  'Please wait while I check the expected delivery.',
  'I cannot confirm this delivery yet. Please leave the package at the designated location.',
  'Thank you. Your delivery details are being checked.',
];

function AudioPage({ selectedEvent, detail, response, onResponse, onResponseComposed, onPreviewResponse, onPlayDoorbell, audioBusy, microphoneState, microphonePermission, listening, speechRecognitionSupported, speechSynthesisSupported, question, onQuestion, onStartMicrophone, onStopMicrophone, onAskAssistant, assistantLoading, assistantResponse, onReadSummary, onReadEventSummary, log, onOpenEvents }: {
  selectedEvent: EventItem | null;
  detail: EventDetail | null;
  response: string;
  onResponse: (text: string) => void;
  onResponseComposed: (text: string) => void;
  onPreviewResponse: () => void;
  onPlayDoorbell: () => void;
  audioBusy: boolean;
  microphoneState: 'idle' | 'requesting' | 'listening' | 'denied' | 'error' | 'unsupported';
  microphonePermission: 'not-requested' | 'granted' | 'denied' | 'unknown';
  listening: boolean;
  speechRecognitionSupported: boolean;
  speechSynthesisSupported: boolean;
  question: string;
  onQuestion: (text: string) => void;
  onStartMicrophone: () => void;
  onStopMicrophone: () => void;
  onAskAssistant: (event: FormEvent) => void;
  assistantLoading: boolean;
  assistantResponse: string;
  onReadSummary: () => void;
  onReadEventSummary: () => void;
  log: AudioLogEntry[];
  onOpenEvents: () => void;
}) {
  const microphoneMessage = microphoneState === 'denied'
    ? 'Microphone permission denied. You can change this in your browser site settings.'
    : microphoneState === 'error'
      ? 'Microphone could not be started. Check the connected device or type your question.'
      : microphoneState === 'unsupported' || !speechRecognitionSupported
        ? 'Speech-to-text is not supported in this browser. Typing remains available.'
        : 'Speech recognition is provided by your browser and may use an online service. GuestVerify does not receive microphone audio.';
  const permissionLabel = microphonePermission === 'not-requested'
    ? 'Permission not requested'
    : microphonePermission === 'granted'
      ? 'Browser granted microphone access'
      : microphonePermission === 'denied'
        ? 'Microphone permission denied'
        : 'Permission state unavailable';
  return <>
    <PageHeading title="Audio & responses" description="Speak with the assistant, prepare a response, or preview sounds locally." />
    <section className="audio-disclosure"><Icon name="shield" size={17} /><span>Microphone use starts only when you press Listen. Speech recognition may be processed by your browser’s online service. Audio is not uploaded to GuestVerify; playback uses this device, never a doorbell speaker.</span></section>
    <div className="audio-grid">
      <div className="audio-main-column">
        <section className="surface voice-assistant">
          <div className="section-heading"><div className="simulator-title"><span className="simulator-icon"><Icon name="mic" size={18} /></span><div><h2>Voice assistant</h2><p>Ask about the latest recorded visitor activity.</p></div></div><StatusBadge value={speechRecognitionSupported ? 'ready' : 'warning'} label={speechRecognitionSupported ? 'Browser speech input available' : 'Type to speak'} /></div>
          <div className={`microphone-state ${listening ? 'is-listening' : ''}`} aria-live="polite"><span className="microphone-state-dot" /><strong>{permissionLabel}</strong><span>{listening ? 'Listening… speak now, then stop when finished.' : microphoneMessage}</span></div>
          <form onSubmit={onAskAssistant}>
            <label className="field" htmlFor="voice-question"><span>Your question</span><textarea id="voice-question" rows={3} value={question} onChange={(event) => onQuestion(event.target.value)} placeholder="Ask what happened, what matched, or what evidence is missing…" /></label>
            <div className="audio-controls">
              {listening ? <button type="button" className="button button-danger" onClick={onStopMicrophone}><Icon name="stop" size={15} /> Stop listening</button> : <button type="button" className="button button-secondary" onClick={onStartMicrophone} disabled={!speechRecognitionSupported}><Icon name="mic" size={15} /> {microphoneState === 'requesting' ? 'Requesting permission…' : 'Listen'}</button>}
              <button className="button button-primary" type="submit" disabled={assistantLoading || !question.trim()}>{assistantLoading ? <><span className="spinner" /> Asking…</> : 'Ask GuestVerify'}</button>
            </div>
          </form>
          {assistantResponse ? <div className="spoken-summary"><div><span className="subsection-heading"><h3>Assistant response</h3></span><p>{assistantResponse}</p></div><button type="button" className="button button-secondary" onClick={onReadSummary} disabled={!speechSynthesisSupported}><Icon name="speaker" size={15} /> Read aloud</button></div> : null}
        </section>
        <section className="surface visitor-communication">
          <div className="section-heading"><div><h2>Speak to the visitor</h2><p>Prepare a polite verification prompt for local playback.</p></div><StatusBadge value={selectedEvent ? 'ready' : 'neutral'} label={selectedEvent ? 'Event selected' : 'Select an event'} /></div>
          {selectedEvent ? <div className="visitor-claim-strip"><span className="claim-icon"><Icon name="activity" size={16} /></span><div><small>VISITOR CLAIM</small><strong>{selectedEvent.transcript || 'No transcript provided'}</strong></div><button type="button" className="text-button" onClick={onOpenEvents}>View event <Icon name="arrow" size={14} /></button></div> : <div className="audio-empty-link"><span>No visitor event selected.</span><button className="text-button" onClick={onOpenEvents}>Open visitor events <Icon name="arrow" size={14} /></button></div>}
          <label className="field visitor-message-field"><span>Response message <small>Editable before playback</small></span><textarea rows={3} value={response} onChange={(event) => onResponse(event.target.value)} onBlur={() => { if (response.trim()) onResponseComposed(response.trim()); }} placeholder="Write a calm response…" /></label>
          <div className="response-suggestions"><span>Suggested responses</span>{responseSuggestions.map((suggestion) => <button key={suggestion} type="button" className={`response-suggestion ${response === suggestion ? 'selected' : ''}`} onClick={() => { onResponse(suggestion); onResponseComposed(suggestion); }}>{suggestion}</button>)}</div>
          <div className="visitor-response-footer"><span><Icon name="speaker" size={15} /> Local preview only · plays through this device</span><button className="button button-primary" onClick={onPreviewResponse} disabled={!selectedEvent || !speechSynthesisSupported || !response.trim()}><Icon name="play" size={14} /> Preview spoken response</button></div>
        </section>
      </div>
      <aside className="audio-side-column">
        <section className="surface sound-sample">
          <div className="section-heading"><div><h2>Doorbell sound sample</h2><p>Generated in your browser</p></div><span className="sample-icon"><Icon name="speaker" size={17} /></span></div>
          <p>A short two-tone sample. Playing it does not create a sensor event or record audio.</p>
          <button className="button button-secondary sound-button" onClick={onPlayDoorbell} disabled={audioBusy}><Icon name="play" size={14} />{audioBusy ? 'Playing sample…' : 'Play local sample'}</button>
        </section>
        <section className="surface current-event-audio">
          <div className="section-heading"><div><h2>Current event summary</h2><p>Backend verification result</p></div></div>
          {selectedEvent && detail?.decision ? <><StatusBadge value={detail.decision.outcome} /><p>{detail.decision.explanation}</p><small>Recommended: {titleCase(detail.decision.recommended_action)}</small><button type="button" className="text-button" onClick={onReadEventSummary} disabled={!speechSynthesisSupported}><Icon name="speaker" size={14} /> Read this summary aloud</button></> : <div className="audio-empty-link"><span>No verification result available yet.</span><button className="text-button" onClick={onOpenEvents}>Analyze an event <Icon name="arrow" size={14} /></button></div>}
        </section>
      </aside>
    </div>
    <section className="surface audio-history">
      <div className="section-heading"><div><h2>Interaction history</h2><p>Actions performed during this browser session · not a stored audio recording</p></div><span className="history-count">{log.length}</span></div>
      {log.length ? <div className="audio-log-list">{log.map((entry) => <div className="audio-log-row" key={entry.id}><span className={`log-kind ${entry.source.replace(/ /g, '-')}`}><Icon name={entry.source === 'browser audio' ? 'speaker' : entry.source === 'homeowner action' ? 'mic' : 'activity'} size={15} /></span><div><strong>{entry.title}</strong><p>{entry.detail}</p><small>{entry.source} · {formatDate(entry.timestamp)}</small></div></div>)}</div> : <EmptyState icon="speaker" title="No audio interactions yet" text="Audio previews, speech input, and simulated event actions you initiate will appear here." />}
    </section>
  </>;
}

function PerimeterPage({ events, loading, onSimulate, onSelectEvent }: { events: EventItem[]; loading: boolean; onSimulate: () => void; onSelectEvent: (id: string) => void }) {
  const perimeterEvents = events.filter((event) => event.source === 'perimeter_simulator' || event.device_id === 'perimeter-front-door-demo');
  const frontEvent = perimeterEvents[0];
  const porchEvent = events.find((event) => event.device_id === 'ring-doorbell-demo');
  const zones: Array<{ name: string; icon: string; event?: EventItem; connected: boolean; location: string }> = [
    { name: 'Front door', icon: 'door', event: frontEvent, connected: false, location: 'Front entry' },
    { name: 'Porch', icon: 'porch', event: porchEvent, connected: false, location: 'Delivery area' },
    { name: 'Driveway', icon: 'car', connected: false, location: 'Vehicle approach' },
    { name: 'Side entrance', icon: 'door', connected: false, location: 'Side access' },
  ];
  const recentActivity = events.filter((event) => event.source === 'perimeter_simulator' || event.source === 'simulator').slice(0, 6);
  return <>
    <PageHeading title="Perimeter awareness" description="A home-oriented view of simulated visitor activity. No sensors are connected." action={<button className="button button-primary" onClick={onSimulate} disabled={loading}><Icon name="plus" size={15} />{loading ? 'Creating event…' : 'Simulate front-door event'}</button>} />
    <section className="perimeter-disclosure"><Icon name="alert" size={17} /><span><strong>Illustrative zones only.</strong> GuestVerify does not monitor a real perimeter, receive camera feeds, or detect threats. Events are generated only when you use the simulator.</span></section>
    <div className="perimeter-layout">
      <section className="surface property-panel">
        <div className="section-heading"><div><h2>Home zones</h2><p>Click a zone with an event to open its verification detail.</p></div><span className="simulation-tag"><span />Simulated activity</span></div>
        <div className="property-illustration" aria-label="Illustrative house and four activity zones">
          <svg viewBox="0 0 420 220" role="img" aria-labelledby="home-outline-title">
            <title id="home-outline-title">Illustration of a house with front door, porch, driveway, and side entrance zones</title>
            <path d="M119 101 210 35l92 66v83H119z" className="house-outline" />
            <path d="M103 104 210 25l106 79M145 83V58h34v1M211 184v-63h42v63M264 123h20v28h-20" className="house-detail" />
            <path d="M142 184h-48m238 0h-42M91 190h234" className="site-line" />
            <circle cx="231" cy="155" r="2.3" className="door-knob" />
          </svg>
          <span className="illustration-label illustration-front">Front door</span><span className="illustration-label illustration-drive">Driveway</span><span className="illustration-label illustration-porch">Porch</span><span className="illustration-label illustration-side">Side entrance</span>
        </div>
        <div className="zone-grid">{zones.map((zone) => {
          const review = zone.event?.processing_status === 'REVIEW_REQUIRED';
          const state = !zone.connected && !zone.event ? 'No connected sensor' : review ? 'Event requires review' : zone.event ? 'Simulated activity detected' : 'No recent simulated event';
          return <button className={`zone-card ${zone.event ? 'has-event' : ''}`} key={zone.name} onClick={() => zone.event && onSelectEvent(zone.event.id)} disabled={!zone.event} aria-label={`${zone.name}: ${state}${zone.event ? ', open event detail' : ''}`}>
            <span className="zone-icon"><Icon name={zone.icon} size={17} /></span><span className="zone-copy"><strong>{zone.name}</strong><small>{zone.location}</small></span><span className={`zone-status ${review ? 'warning' : zone.event ? 'active' : 'quiet'}`}><span />{state}</span>
          </button>;
        })}</div>
      </section>
      <aside className="surface perimeter-feed">
        <div className="section-heading"><div><h2>Recent activity</h2><p>Real backend event history</p></div><span className="history-count">{recentActivity.length}</span></div>
        {recentActivity.length ? <div className="perimeter-timeline">{recentActivity.map((event) => <button className="perimeter-event" key={event.id} onClick={() => onSelectEvent(event.id)}><span className={`timeline-marker ${outcomeClass(event.outcome || event.processing_status)}`} /><span><strong>{event.transcript || titleCase(event.event_type)}</strong><small>{event.device_id} · {formatDate(event.event_timestamp)}</small><StatusBadge value={event.outcome || event.processing_status} /></span></button>)}</div> : <EmptyState icon="activity" title="No perimeter events" text="Use the simulator to record a sample front-door activity." />}
        <button className="button button-secondary perimeter-simulate" onClick={onSimulate} disabled={loading}><Icon name="activity" size={15} /> Simulate visitor approached front door</button>
      </aside>
    </div>
    <div className="perimeter-note"><Icon name="shield" size={16} /><span>Simulated activity can help demonstrate the event workflow. It is not live monitoring and does not indicate an intrusion.</span></div>
  </>;
}

function IntegrationsPage({ provider, connected, speechRecognitionSupported, speechSynthesisSupported, audioContextSupported, onRefresh }: { provider: ProviderStatus | null; connected: boolean | null; speechRecognitionSupported: boolean; speechSynthesisSupported: boolean; audioContextSupported: boolean; onRefresh: () => void }) {
  const localMode = provider?.provider_mode === 'local_demo';
  return <>
    <PageHeading title="Integrations" description="Check the application’s configured processing mode and service availability." action={<button className="button button-secondary" onClick={onRefresh}><Icon name="refresh" size={16} /> Refresh status</button>} />
    <section className="surface integration-overview">
      <div className="integration-banner"><span className="integration-brand"><Icon name="shield" size={22} /></span><div><span className="form-section-label">CURRENT PROCESSING MODE</span><h2>{localMode ? 'Local demo active' : titleCase(provider?.provider_mode)}</h2><p>{provider?.provider_summary || 'Provider status has not loaded.'}</p></div><StatusBadge value={localMode ? 'ready' : provider?.provider_configured ? 'configured' : 'missing'} label={localMode ? 'Deterministic rules' : provider?.provider_configured ? 'Configured' : 'Not configured'} /></div>
      <div className="integration-grid">
        <IntegrationCard icon="activity" title="Backend API" status={connected === true ? 'Connection verified' : connected === false ? 'Connection check failed' : 'Checking connection'} tone={connected === true ? 'positive' : connected === false ? 'negative' : 'neutral'} text={connected === true ? 'Health endpoint responded successfully.' : connected === false ? 'The health endpoint did not respond successfully.' : 'Waiting for the health endpoint.'} />
        <IntegrationCard icon="spark" title="Amazon Bedrock" status={provider?.bedrock === 'configured' ? 'Configured, not live-tested' : 'Provider not configured'} tone={provider?.bedrock === 'configured' ? 'warning' : 'neutral'} text={provider?.bedrock === 'configured' ? 'Credentials are present; live model access is not verified by this status endpoint.' : 'Bedrock is optional. This deployment is using local deterministic processing.'} />
        <IntegrationCard icon="activity" title="Ring activity" status="Simulated" tone="warning" text="Visitor activity comes from the in-app simulator; no Ring account is connected." />
        <IntegrationCard icon="lock" title="Physical actions" status="Not available" tone="neutral" text="The workflow can record an explicitly approved simulated action. No lock or physical device is operated." />
        <IntegrationCard icon="nodes" title="MCP server" status="Not hosted here" tone="neutral" text="The Streamable HTTP MCP server runs separately; this Vercel deployment does not verify its availability." />
        <IntegrationCard icon="mic" title="Speech input" status={speechRecognitionSupported ? 'Browser capability available' : 'Not supported in this browser'} tone={speechRecognitionSupported ? 'warning' : 'neutral'} text={speechRecognitionSupported ? 'Recognition starts only on request and may use the browser’s online speech service.' : 'Voice input is unavailable; text questions continue to work.'} />
        <IntegrationCard icon="speaker" title="Local audio playback" status={speechSynthesisSupported && audioContextSupported ? 'Available in this browser' : 'Partially unavailable'} tone={speechSynthesisSupported && audioContextSupported ? 'positive' : 'neutral'} text={`Speech synthesis: ${speechSynthesisSupported ? 'available' : 'unavailable'}. Generated sound sample: ${audioContextSupported ? 'available' : 'unavailable'}. Playback stays on the homeowner's current device.`} />
      </div>
    </section>
    <section className="surface mode-explainer"><span className="explainer-icon"><Icon name="shield" size={19} /></span><div><h3>Verification remains the trust boundary</h3><p>Visitor statements are treated as claims. GuestVerify compares those claims with expected deliveries and available evidence; a model response or matching description does not authorize access. Vercel’s demo database is ephemeral and is not suitable for persistent operational records.</p></div></section>
  </>;
}

function IntegrationCard({ icon, title, status, tone, text }: { icon: string; title: string; status: string; tone: string; text: string }) {
  return <article className="integration-card"><div className="integration-card-top"><span className="integration-icon"><Icon name={icon} size={18} /></span><StatusBadge value={tone} label={status} /></div><h3>{title}</h3><p>{text}</p></article>;
}

export default App;
