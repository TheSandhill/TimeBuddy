/**
 * The soft chime that marks the edge of a Pomodoro Block.
 *
 * Synthesised rather than shipped as an audio file: two short sine notes need
 * no asset, no decoding, and no Tauri capability. Where there is no Web Audio
 * at all — jsdom, a locked-down webview — the app simply stays quiet.
 */

const NOTES = [660, 880];
const NOTE_SECONDS = 0.45;
/** Quiet on purpose. This is a nudge, not an alarm. */
const PEAK_GAIN = 0.06;

type AudioContextConstructor = typeof AudioContext;

function audioContext(): AudioContext | null {
  const ctor: AudioContextConstructor | undefined =
    typeof AudioContext === "undefined" ? undefined : AudioContext;
  return ctor ? new ctor() : null;
}

export function playChime(): void {
  const context = audioContext();
  if (!context) {
    return;
  }

  NOTES.forEach((frequency, index) => {
    const start = context.currentTime + index * NOTE_SECONDS;
    const end = start + NOTE_SECONDS;

    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;

    // A ramp rather than a switch: an abrupt start and stop clicks, and a
    // click is the opposite of what this screen is for.
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(PEAK_GAIN, start + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(end);
  });

  // Release the device once the last note has died away.
  window.setTimeout(
    () => void context.close(),
    NOTES.length * NOTE_SECONDS * 1000 + 200,
  );
}
