class CallRecorder extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) this.port.postMessage(channel.slice());
    return true; // Output remains silent: no microphone feedback to the speakers.
  }
}
registerProcessor("mitjee-call-recorder", CallRecorder);
