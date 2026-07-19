const PROFILES = [
  { minLevel: 1, bpm: 84, pulseEvery: 4, hatEvery: 0, tension: false },
  { minLevel: 5, bpm: 104, pulseEvery: 2, hatEvery: 2, tension: false },
  { minLevel: 10, bpm: 124, pulseEvery: 2, hatEvery: 2, tension: true },
  { minLevel: 15, bpm: 144, pulseEvery: 1, hatEvery: 1, tension: true },
];

export function getMusicProfile(level) {
  return PROFILES.findLast(profile => level >= profile.minLevel) || PROFILES[0];
}

export class MusicEngine {
  constructor(context) {
    this.context = context;
    this.master = context.createGain();
    this.master.gain.value = 0.0001;
    this.master.connect(context.destination);
    this.level = 1;
    this.step = 0;
    this.nextNoteTime = 0;
    this.timer = null;
  }

  start(level = this.level) {
    this.level = level;
    if (this.timer) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(this.master.gain.value, 0.0001), now);
    this.master.gain.exponentialRampToValueAtTime(0.032, now + 0.18);
    this.nextNoteTime = now + 0.05;
    this.timer = setInterval(() => this.schedule(), 45);
    this.schedule();
  }

  stop(fade = 0.12) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(this.master.gain.value, 0.0001), now);
    this.master.gain.exponentialRampToValueAtTime(0.0001, now + fade);
  }

  setLevel(level) { this.level = level; }

  schedule() {
    while (this.nextNoteTime < this.context.currentTime + 0.14) {
      const profile = getMusicProfile(this.level);
      this.scheduleStep(this.step, this.nextNoteTime, profile);
      this.nextNoteTime += 60 / profile.bpm / 4;
      this.step = (this.step + 1) % 16;
    }
  }

  scheduleStep(step, time, profile) {
    const bassNotes = [110, 110, 130.81, 98];
    const pulseNotes = [220, 261.63, 293.66, 246.94, 220, 329.63, 293.66, 261.63];
    if (step % 4 === 0) this.note(bassNotes[(step / 4) % bassNotes.length], time, 0.12, 'triangle', 0.42);
    if (step % profile.pulseEvery === 0) {
      const note = pulseNotes[Math.floor(step / profile.pulseEvery) % pulseNotes.length];
      this.note(note, time, 0.055, 'square', profile.tension ? 0.24 : 0.18);
    }
    if (profile.hatEvery && step % profile.hatEvery === 0) {
      this.note(1500 + (step % 4) * 180, time, 0.018, 'square', 0.055);
    }
    if (profile.tension && step === 15) this.note(440, time, 0.09, 'sawtooth', 0.1);
  }

  note(frequency, time, duration, type, volume) {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(time);
    oscillator.stop(time + duration);
  }
}
