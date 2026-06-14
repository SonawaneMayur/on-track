// Phase 4 — speech. OS-native, on-device engines via Capacitor plugins on
// device; the browser's Web Speech API in dev/preview. No bundled ML model.
import { Capacitor } from '@capacitor/core';

// ---- Text to speech -------------------------------------------------------

export async function speak(text: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
    await TextToSpeech.speak({ text, rate: 1.0, pitch: 1.0, volume: 1.0 }).catch(() => {});
    return;
  }
  if (typeof speechSynthesis !== 'undefined') {
    const u = new SpeechSynthesisUtterance(text);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }
}

// ---- Speech to text -------------------------------------------------------

export async function sttAvailable(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
    const { available } = await SpeechRecognition.available().catch(() => ({ available: false }));
    return available;
  }
  return typeof (window as any).webkitSpeechRecognition !== 'undefined' ||
    typeof (window as any).SpeechRecognition !== 'undefined';
}

/** Listen once and resolve with the best transcript (or '' if nothing heard). */
export async function listenOnce(): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
    const perm = await SpeechRecognition.checkPermissions();
    if (perm.speechRecognition !== 'granted') {
      const req = await SpeechRecognition.requestPermissions();
      if (req.speechRecognition !== 'granted') throw new Error('Microphone permission denied');
    }
    const res = await SpeechRecognition.start({
      language: 'en-US',
      maxResults: 1,
      partialResults: false,
      popup: false,
    });
    return res.matches?.[0] ?? '';
  }
  return listenWeb();
}

function listenWeb(): Promise<string> {
  return new Promise((resolve, reject) => {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) {
      reject(new Error('Speech recognition not supported in this browser'));
      return;
    }
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let settled = false;
    rec.onresult = (e: any) => {
      settled = true;
      resolve(e.results[0][0].transcript as string);
    };
    rec.onerror = (e: any) => {
      if (!settled) reject(new Error(e.error || 'speech error'));
    };
    rec.onend = () => {
      if (!settled) resolve('');
    };
    rec.start();
  });
}
