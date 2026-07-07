/**
 * Minimal synthesised sound engine — WebAudio oscillators and generated
 * noise only, no audio files. The AudioContext is created lazily on first
 * use so it's always constructed inside a real user-gesture call stack
 * (browsers block audio otherwise).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private tensionOsc: OscillatorNode | null = null;
  private tensionGain: GainNode | null = null;
  private muted = false;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.6;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.6, this.ctx.currentTime, 0.05);
    }
  }

  private tone(
    freq: number,
    durationSec: number,
    opts: { type?: OscillatorType; startFreq?: number; gain?: number; delaySec?: number } = {},
  ): void {
    const ctx = this.ensureContext();
    const t0 = ctx.currentTime + (opts.delaySec ?? 0);
    const osc = ctx.createOscillator();
    osc.type = opts.type ?? "sine";
    osc.frequency.setValueAtTime(opts.startFreq ?? freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq), t0 + durationSec);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(opts.gain ?? 0.3, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);

    osc.connect(gain);
    gain.connect(this.master!);
    osc.start(t0);
    osc.stop(t0 + durationSec + 0.02);
  }

  private noiseBurst(durationSec: number, opts: { delaySec?: number; gain?: number } = {}): void {
    const ctx = this.ensureContext();
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = opts.gain ?? 0.25;
    src.connect(gain);
    gain.connect(this.master!);
    src.start(ctx.currentTime + (opts.delaySec ?? 0));
  }

  playHop(): void {
    this.tone(520, 0.09, { startFreq: 700, type: "square", gain: 0.18 });
  }

  playDeathRoad(): void {
    this.tone(80, 0.35, { startFreq: 260, type: "sawtooth", gain: 0.32 });
    this.noiseBurst(0.18, { gain: 0.3 });
  }

  playDeathRiver(): void {
    this.tone(90, 0.4, { startFreq: 220, type: "sine", gain: 0.28 });
    this.noiseBurst(0.3, { gain: 0.15, delaySec: 0.03 });
  }

  playCoinCascade(coinCount = 6): void {
    for (let i = 0; i < coinCount; i++) {
      this.tone(880 + i * 60, 0.14, { type: "square", gain: 0.16, delaySec: i * 0.045 });
    }
  }

  /** A quiet drone that rises in pitch/volume with the multiplier ladder. */
  startTensionLayer(): void {
    const ctx = this.ensureContext();
    this.stopTensionLayer();
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 90;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(this.master!);
    osc.start();
    this.tensionOsc = osc;
    this.tensionGain = gain;
  }

  updateTension(progress: number): void {
    if (!this.tensionOsc || !this.tensionGain || !this.ctx) return;
    const clamped = Math.max(0, Math.min(1, progress));
    this.tensionOsc.frequency.setTargetAtTime(90 + clamped * 220, this.ctx.currentTime, 0.15);
    this.tensionGain.gain.setTargetAtTime(0.03 + clamped * 0.09, this.ctx.currentTime, 0.15);
  }

  stopTensionLayer(): void {
    if (this.tensionOsc) {
      try {
        this.tensionOsc.stop();
      } catch {
        // already stopped — safe to ignore
      }
      this.tensionOsc.disconnect();
      this.tensionOsc = null;
    }
    if (this.tensionGain) {
      this.tensionGain.disconnect();
      this.tensionGain = null;
    }
  }
}
