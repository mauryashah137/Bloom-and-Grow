/**
 * PCM Recorder AudioWorklet — based on Google's ADK demo.
 * Converts Float32 input to Int16 PCM and posts every buffer immediately.
 * The AudioContext sample rate determines the actual rate.
 */
class PCMRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
  }

  process(inputs, outputs, parameters) {
    if (inputs.length > 0 && inputs[0].length > 0) {
      const inputChannel = inputs[0][0];
      // Convert Float32 to Int16 PCM
      const pcm16 = new Int16Array(inputChannel.length);
      for (let i = 0; i < inputChannel.length; i++) {
        const s = Math.max(-1, Math.min(1, inputChannel[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.port.postMessage(pcm16.buffer);
    }
    return true;
  }
}

registerProcessor("pcm-processor", PCMRecorderProcessor);
