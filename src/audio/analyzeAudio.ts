export interface AnalysisResult {
  pattern: number[];
  durationMs: number;
  frameCount: number;
}

const WINDOW_MS = 30;

export async function analyzeAudio(audioUrl: string): Promise<AnalysisResult> {
  const response = await fetch(audioUrl);
  const arrayBuffer = await response.arrayBuffer();

  const audioCtx = new AudioContext();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  await audioCtx.close();

  // Mix down to mono
  const mono = mixToMono(audioBuffer);
  const sampleRate = audioBuffer.sampleRate;
  const samplesPerWindow = Math.floor((sampleRate * WINDOW_MS) / 1000);
  const frameCount = Math.floor(mono.length / samplesPerWindow);

  // Compute RMS and energy per frame
  const rms: number[] = [];
  const energy: number[] = [];

  for (let i = 0; i < frameCount; i++) {
    const start = i * samplesPerWindow;
    const end = start + samplesPerWindow;
    let sumSq = 0;
    for (let j = start; j < end; j++) {
      sumSq += mono[j] * mono[j];
    }
    energy.push(sumSq);
    rms.push(Math.sqrt(sumSq / samplesPerWindow));
  }

  // Adaptive threshold based on peak RMS
  const peakRms = Math.max(...rms);
  const quietThreshold = peakRms * 0.08;

  // Energy deltas for transient detection
  const energyDelta: number[] = [0];
  for (let i = 1; i < frameCount; i++) {
    energyDelta.push(energy[i] - energy[i - 1]);
  }
  const peakEnergy = Math.max(...energy);
  const onsetThreshold = peakEnergy * 0.3;

  // Rolling average energy for beat detection (~1 second window)
  const beatWindowSize = Math.ceil(1000 / WINDOW_MS);

  // Classify each frame
  const isVibrate: boolean[] = [];
  for (let i = 0; i < frameCount; i++) {
    // Transient detection
    if (energyDelta[i] > onsetThreshold) {
      isVibrate.push(true);
      continue;
    }

    // Beat detection: compare energy to rolling average
    const rollingStart = Math.max(0, i - beatWindowSize);
    let rollingSum = 0;
    for (let j = rollingStart; j < i; j++) {
      rollingSum += energy[j];
    }
    const rollingAvg = i > rollingStart ? rollingSum / (i - rollingStart) : 0;
    if (rollingAvg > 0 && energy[i] > rollingAvg * 1.5) {
      isVibrate.push(true);
      continue;
    }

    // Amplitude threshold
    isVibrate.push(rms[i] > quietThreshold);
  }

  // Merge consecutive same-type frames into pattern
  const pattern = mergeFrames(isVibrate, WINDOW_MS);

  const durationMs = frameCount * WINDOW_MS;
  return { pattern, durationMs, frameCount };
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  const length = buffer.length;
  const channels = buffer.numberOfChannels;

  if (channels === 1) {
    return buffer.getChannelData(0);
  }

  const mono = new Float32Array(length);
  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mono[i] += data[i];
    }
  }
  for (let i = 0; i < length; i++) {
    mono[i] /= channels;
  }
  return mono;
}

function mergeFrames(isVibrate: boolean[], windowMs: number): number[] {
  if (isVibrate.length === 0) return [];

  const pattern: number[] = [];
  let currentType = isVibrate[0];
  let currentDuration = windowMs;

  // If first frame is a pause, prepend a 0ms vibrate
  if (!currentType) {
    pattern.push(0);
  }

  for (let i = 1; i < isVibrate.length; i++) {
    if (isVibrate[i] === currentType) {
      currentDuration += windowMs;
    } else {
      pattern.push(Math.max(currentDuration, 10));
      currentType = isVibrate[i];
      currentDuration = windowMs;
    }
  }
  // Push the last segment
  pattern.push(Math.max(currentDuration, 10));

  return pattern;
}
