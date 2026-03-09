export interface AnalysisResult {
  channelData: Float32Array
  sampleRate: number
  duration: number
  numberOfChannels: number
}

export async function decodeAudioBuffer(arrayBuffer: ArrayBuffer): Promise<AnalysisResult> {
  const audioContext = new AudioContext()
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
  const channelData = audioBuffer.getChannelData(0)

  await audioContext.close()

  return {
    channelData,
    sampleRate: audioBuffer.sampleRate,
    duration: audioBuffer.duration,
    numberOfChannels: audioBuffer.numberOfChannels,
  }
}

export async function analyzeAudio(url: string): Promise<AnalysisResult> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return decodeAudioBuffer(arrayBuffer)
}
