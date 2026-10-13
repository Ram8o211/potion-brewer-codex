/** All sound is synthesized locally; no samples, remote fonts, or music licenses. */
export class AlchemyAudio {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private note = 0;
  private enabled = true;
  private volume = 0.45;
  configure(enabled: boolean, volume: number): void {
    this.enabled = enabled; this.volume = Math.max(0, Math.min(1, volume));
    if (this.gain && this.context) this.gain.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.context.currentTime, 0.1);
  }
  unlock(): void {
    if (!this.enabled) return;
    if (!this.context) {
      const Constructor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Constructor) return;
      this.context = new Constructor(); this.gain = this.context.createGain(); this.gain.gain.value = this.volume; this.gain.connect(this.context.destination);
      this.timer = setInterval(() => {
        if (document.hidden || !this.enabled) return;
        const melody = [220, 261.63, 329.63, 293.66, 196, 261.63, 246.94, 164.81];
        this.tone(melody[this.note++ % melody.length], 2.7, 0.025, 'sine');
        this.tone(110, 2.9, 0.012, 'triangle');
      }, 3000);
    }
    void this.context.resume();
  }
  private tone(frequency: number, duration: number, volume: number, type: OscillatorType = 'sine', end?: number): void {
    if (!this.context || !this.gain || !this.enabled) return;
    const oscillator = this.context.createOscillator(); const envelope = this.context.createGain(); const now = this.context.currentTime;
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, now);
    if (end) oscillator.frequency.exponentialRampToValueAtTime(end, now + duration);
    envelope.gain.setValueAtTime(0.0001, now); envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + Math.min(0.04, duration / 3)); envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(envelope); envelope.connect(this.gain); oscillator.start(now); oscillator.stop(now + duration + 0.05); oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  }
  play(event: string): void {
    this.unlock();
    if (/sale|sell|success|upgrade|discovery/.test(event)) { [329.63, 440, 523.25].forEach((frequency, index) => setTimeout(() => this.tone(frequency, 0.42, 0.06, 'triangle'), index * 100)); }
    else if (/pour|add/.test(event)) { this.tone(480, 0.22, 0.05, 'sine', 140); this.tone(690, 0.18, 0.035, 'sine', 260); }
    else if (/crush/.test(event)) this.tone(90, 0.12, 0.07, 'triangle', 35);
    else if (/heat|fire/.test(event)) this.tone(75, 0.35, 0.04, 'sawtooth', 115);
    else if (/cool/.test(event)) this.tone(760, 0.3, 0.04, 'sine', 430);
    else if (/stir/.test(event)) this.tone(170, 0.16, 0.018, 'triangle', 230);
    else if (/test|bottle/.test(event)) { this.tone(440, 0.3, 0.04, 'sine'); this.tone(660, 0.35, 0.025, 'sine'); }
    else if (/gather/.test(event)) this.tone(590, 0.17, 0.035, 'triangle', 880);
    else this.tone(330, 0.09, 0.025, 'sine', 440);
  }
  destroy(): void { if (this.timer) clearInterval(this.timer); void this.context?.close(); }
}
