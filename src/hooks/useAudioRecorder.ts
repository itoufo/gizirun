'use client'

import { useCallback, useRef, useState, useEffect } from 'react'

interface UseAudioRecorderOptions {
  onAudioData?: (data: ArrayBuffer) => void
  onError?: (error: Error) => void
}

interface UseAudioRecorderReturn {
  isRecording: boolean
  isPaused: boolean
  audioLevel: number
  startRecording: () => Promise<void>
  stopRecording: () => void
  pauseRecording: () => void
  resumeRecording: () => void
}

export function useAudioRecorder(
  options: UseAudioRecorderOptions = {}
): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)

  const audioContextRef = useRef<AudioContext | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  const updateAudioLevel = useCallback(() => {
    if (analyserRef.current && isRecording && !isPaused) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
      analyserRef.current.getByteFrequencyData(dataArray)

      // Calculate average level
      const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
      setAudioLevel(average / 255)

      animationFrameRef.current = requestAnimationFrame(updateAudioLevel)
    }
  }, [isRecording, isPaused])

  const startRecording = useCallback(async () => {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      streamRef.current = stream

      // Create audio context
      const audioContext = new AudioContext({ sampleRate: 16000 })
      audioContextRef.current = audioContext

      // Load AudioWorklet
      await audioContext.audioWorklet.addModule('/worklets/audio-processor.js')

      // Create nodes
      const source = audioContext.createMediaStreamSource(stream)
      const workletNode = new AudioWorkletNode(audioContext, 'audio-processor')
      const analyser = audioContext.createAnalyser()

      analyser.fftSize = 256
      analyserRef.current = analyser

      // Handle audio data from worklet
      workletNode.port.onmessage = (event) => {
        if (options.onAudioData && !isPaused) {
          options.onAudioData(event.data.audioData)
        }
      }

      // Connect nodes
      source.connect(analyser)
      source.connect(workletNode)

      workletNodeRef.current = workletNode
      setIsRecording(true)
      setIsPaused(false)

      // Start audio level monitoring
      updateAudioLevel()
    } catch (error) {
      console.error('Failed to start recording:', error)
      options.onError?.(error as Error)
      throw error
    }
  }, [options, isPaused, updateAudioLevel])

  const stopRecording = useCallback(() => {
    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    // Disconnect worklet
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect()
      workletNodeRef.current = null
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    // Cancel animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    setIsRecording(false)
    setIsPaused(false)
    setAudioLevel(0)
  }, [])

  const pauseRecording = useCallback(() => {
    setIsPaused(true)
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }, [])

  const resumeRecording = useCallback(() => {
    setIsPaused(false)
    updateAudioLevel()
  }, [updateAudioLevel])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording()
    }
  }, [stopRecording])

  return {
    isRecording,
    isPaused,
    audioLevel,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
  }
}
