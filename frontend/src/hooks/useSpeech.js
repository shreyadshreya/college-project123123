import { useState, useRef, useCallback, useEffect } from 'react';

// Text-to-Speech hook
export function useTTS() {
  const [speaking, setSpeaking] = useState(false);
  const utteranceRef = useRef(null);

  const speak = useCallback((text, onEnd) => {
    if (!('speechSynthesis' in window)) {
      console.warn('TTS not supported');
      onEnd?.();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => {
      setSpeaking(false);
      onEnd?.();
    };
    utterance.onerror = () => {
      setSpeaking(false);
      onEnd?.();
    };
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, []);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  useEffect(() => {
    return () => window.speechSynthesis.cancel();
  }, []);

  return { speak, stop, speaking };
}

// Speech-to-Text hook
export function useSTT({ onResult, onEnd, onError } = {}) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef(null);
  const onResultRef = useRef(onResult);
  const onEndRef = useRef(onEnd);
  const onErrorRef = useRef(onError);
  const wantListeningRef = useRef(false); // user wants the mic on
  const runningRef = useRef(false);       // a recognition instance is actually running
  const generationRef = useRef(0);        // guards against callbacks from old instances
  const restartTimerRef = useRef(null);

  // Keep callbacks fresh
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    onEndRef.current = onEnd;
  }, [onEnd]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    runningRef.current = false;
    generationRef.current += 1;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      try {
        recognition.abort();
      } catch (e) {
        // ignore
      }
    }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    if (!isSupported) {
      console.warn('STT not supported');
      return;
    }

    // Already listening? Do nothing (prevents stacked recognizers).
    if (wantListeningRef.current && runningRef.current) return;

    wantListeningRef.current = true;
    generationRef.current += 1;
    const generation = generationRef.current;

    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }

    // Silently drop any previous instance so it cannot deliver stale results.
    const previous = recognitionRef.current;
    recognitionRef.current = null;
    runningRef.current = false;
    if (previous) {
      try {
        previous.abort();
      } catch (e) {
        // ignore
      }
    }

    const begin = () => {
      if (generation !== generationRef.current || !wantListeningRef.current) return;

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) return;

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        if (generation !== generationRef.current) return;
        runningRef.current = true;
        setListening(true);
        setTranscript('');
      };

      recognition.onresult = (event) => {
        if (generation !== generationRef.current) return;
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          }
        }
        if (!finalTranscript) {
          const first = event.results[event.resultIndex];
          finalTranscript = first ? first[0].transcript : '';
        }
        const text = finalTranscript.trim();
        if (text) {
          setTranscript(text);
          onResultRef.current?.(text);
        }
      };

      recognition.onerror = (event) => {
        if (generation !== generationRef.current) return;
        const error = event.error || 'unknown';
        if (error === 'not-allowed' || error === 'service-not-allowed') {
          wantListeningRef.current = false;
          runningRef.current = false;
          setListening(false);
        }
        onErrorRef.current?.(error, event);
        // Other errors (no-speech, network, aborted) are handled by onend,
        // which automatically restarts the microphone.
      };

      recognition.onend = () => {
        if (generation !== generationRef.current) return;
        runningRef.current = false;

        if (wantListeningRef.current) {
          // Auto-restart (Chrome ends recognition after each utterance/silence)
          restartTimerRef.current = setTimeout(() => {
            restartTimerRef.current = null;
            if (generation === generationRef.current && wantListeningRef.current) {
              begin();
            }
          }, 350);
        } else {
          setListening(false);
          onEndRef.current?.();
        }
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch (e) {
        // The previous instance may still be shutting down; retry once.
        restartTimerRef.current = setTimeout(() => {
          restartTimerRef.current = null;
          if (generation === generationRef.current && wantListeningRef.current) {
            try {
              recognition.start();
            } catch (err) {
              console.error('Failed to start STT:', err);
              setListening(false);
            }
          }
        }, 400);
      }
    };

    begin();
  }, [isSupported]);

  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      generationRef.current += 1;
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {
          // ignore
        }
      }
    };
  }, []);

  return { start, stop, listening, transcript, isSupported };
}
