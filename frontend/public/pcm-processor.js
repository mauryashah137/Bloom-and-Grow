/**
 * PCM Recorder — Buffers audio to ~100ms chunks.
 * Reports the actual sample rate so the backend can tell Gemini.
 * Converts Float32 to Int16 PCM (little-endian).
 */
class PCMRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Buffer size targets ~100ms. Actual size set on first process() call
    // based on sampleRate (which may be 16000, 44100, or 48000).
    this._targetMs = 100; // 100ms chunks — balance between latency and recognition
    this._bufferSize = 0;
    this._buffer = null;
    this._offset = 0;
    this._reported = false;
  }

  process(inputs, outputs, parameters) {
    const ch = inputs[0]?.[0];
    if (!ch || ch.length === 0) return true;

    // Initialize buffer based on actual sampleRate
    if (!this._buffer) {
      this._bufferSize = Math.floor(sampleRate * this._targetMs / 1000);
      this._buffer = new Int16Array(this._bufferSize);
      // Report actual sample rate to main thread
      this.port.postMessage({ type: "sampleRate", sampleRate: sampleRate });
    }

    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      this._buffer[this._offset++] = s < 0 ? s * 0x8000 : s * 0x7FFF;

      if (this._offset >= this._bufferSize) {
        // Send the full buffer
        this.port.postMessage({ type: "audio", data: this._buffer.buffer.slice(0) });
        this._offset = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-processor", PCMRecorderProcessor);
