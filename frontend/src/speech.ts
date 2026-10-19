export type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: {
    resultIndex: number;
    results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
  }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

export function createSpeechRecognition(): SpeechRecognitionLike | null {
  const speechWindow = window as SpeechWindow;
  const Constructor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
  if (!Constructor) return null;
  const recognition = new Constructor();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = navigator.language || 'en-US';
  return recognition;
}

export function supportsSpeechRecognition() {
  const speechWindow = window as SpeechWindow;
  return Boolean(speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition);
}

export function supportsSpeechSynthesis() {
  return typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined';
}

export function speakLocally(
  text: string,
  handlers: { onEnd?: () => void; onError?: (message: string) => void } = {},
) {
  if (!supportsSpeechSynthesis()) {
    handlers.onError?.('Speech playback is not supported in this browser.');
    return false;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.onend = () => handlers.onEnd?.();
  utterance.onerror = (event) => handlers.onError?.(`Speech playback failed: ${event.error}.`);
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}

export function stopLocalSpeech() {
  if (supportsSpeechSynthesis()) window.speechSynthesis.cancel();
}

export function playLocalDoorbell(): Promise<void> {
  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor) return Promise.reject(new Error('Audio playback is not supported in this browser.'));

  const context = new AudioContextConstructor();
  const notes = [880, 659];
  const startAt = context.currentTime + 0.04;
  notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const noteStart = startAt + index * 0.42;
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(0.13, noteStart + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.34);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteStart + 0.36);
  });

  return new Promise((resolve, reject) => {
    window.setTimeout(() => {
      context.close().then(resolve).catch(reject);
    }, 950);
  });
}
