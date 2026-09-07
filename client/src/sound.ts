let enabled = true;
let ctx: AudioContext | null = null;

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

function audio() {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function tone(freq: number, duration = 0.09, type: OscillatorType = "triangle", volume = 0.045) {
  if (!enabled) return;
  try {
    const c = audio();
    void c.resume();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + duration);
  } catch {
    /* ses yoksa sessiz devam */
  }
}

export function playClick() {
  tone(740, 0.05, "square", 0.03);
}

export function playJoin() {
  tone(523, 0.1, "triangle", 0.05);
  window.setTimeout(() => tone(784, 0.14, "triangle", 0.045), 70);
}

export function playCancel() {
  tone(220, 0.12, "sine", 0.04);
}
