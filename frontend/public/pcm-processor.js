class PcmProcessor extends AudioWorkletProcessor {
  constructor() { super(); this._buf = new Int16Array(1600); this._off = 0; }
  process(inputs) {
    const ch = inputs[0]?.[0]; if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      this._buf[this._off++] = s < 0 ? s * 32768 : s * 32767;
      if (this._off >= 1600) { this.port.postMessage(this._buf.buffer.slice(0)); this._off = 0; }
    }
    return true;
  }
}
registerProcessor("pcm-processor", PcmProcessor);
