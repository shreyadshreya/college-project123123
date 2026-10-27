import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useTTS, useSTT } from '../hooks/useSpeech';

const LOGIN_COMMANDS = [
  'login', 'log in', 'log me in', 'sign in', 'signin', 'continue',
  'proceed', 'yes', 'done', 'ok', 'okay', 'submit',
];

export default function Login() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [regNo, setRegNo] = useState('');
  const [step, setStep] = useState('name'); // 'name' | 'regNo' | 'done'
  const [voiceStatus, setVoiceStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { speak, stop: stopSpeaking } = useTTS();
  const { start, stop: stopListening, listening, isSupported } = useSTT({
    onResult: handleVoiceInput,
  });

  // Stop the microphone while the assistant speaks, then listen again.
  // This prevents the microphone from "hearing" the assistant's own voice.
  // A timer fallback guarantees the mic restarts even if Chrome skips TTS onend.
  const speakThenListen = useCallback((text) => {
    stopListening();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      setTimeout(() => start(), 300);
    };
    speak(text, finish);
    const estimatedMs = Math.max(2500, text.trim().split(/\s+/).length * 430 + 1500);
    setTimeout(finish, estimatedMs);
  }, [speak, start, stopListening]);

  function handleVoiceInput(text) {
    const lower = text
      .toLowerCase()
      .replace(/[.,!?;:]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (step === 'name') {
      const nameMatch = lower.match(/(?:my name is|i am|i'm|name is)\s+(.+)/);
      const rawName = (nameMatch ? nameMatch[1] : text).trim().replace(/[.,!?;:]+$/, '');
      if (!rawName) {
        speakThenListen('I did not catch your name. Please say your name.');
        return;
      }
      const formatted = rawName.charAt(0).toUpperCase() + rawName.slice(1);
      setName(formatted);
      setStep('regNo');
      setVoiceStatus(`Name captured: ${formatted}`);
      speakThenListen('Thank you. Now please say your registration number.');
      return;
    }

    if (step === 'regNo') {
      let candidate = text
        .replace(/my\s+registration\s+number\s+(?:is)?/i, '')
        .replace(/registration\s+number\s+(?:is)?/i, '')
        .replace(/reg\s*(?:istration)?\s*(?:no|number)?\s*(?:is)?/i, '')
        .replace(/my\s+number\s+(?:is)?/i, '')
        .replace(/number\s+(?:is)?/i, '');
      candidate = candidate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

      if (!candidate) {
        speakThenListen('I did not catch your registration number. Please say it again.');
        return;
      }
      setRegNo(candidate);
      setStep('done');
      setVoiceStatus(`Registration number captured: ${candidate}. Say "login" to continue.`);
      speakThenListen('Thank you. Say login to continue, or press Enter.');
      return;
    }

    if (step === 'done') {
      if (LOGIN_COMMANDS.includes(lower) || /\b(log ?in|sign ?in)\b/.test(lower)) {
        stopListening();
        speak('Logging you in.');
        handleLogin(name, regNo);
      } else {
        speakThenListen('Say login to continue.');
      }
    }
  }

  const handleLogin = async (loginName = name, loginRegNo = regNo) => {
    const finalName = (loginName || '').trim();
    const finalRegNo = (loginRegNo || '').trim();

    if (!finalName || !finalRegNo) {
      setError('Please fill in both name and registration number');
      speak('Please provide both your name and registration number.');
      return;
    }
    if (loading) return;

    setLoading(true);
    setError('');
    try {
      const result = await api.login(finalName, finalRegNo);
      sessionStorage.setItem('student', JSON.stringify(result));
      setVoiceStatus('Login successful. Redirecting to exam...');
      let navigated = false;
      const goToExam = () => {
        if (navigated) return;
        navigated = true;
        navigate('/exam');
      };
      speak(`Welcome, ${finalName}! Redirecting to exam.`, goToExam);
      setTimeout(goToExam, 4000);
    } catch (err) {
      setError(err.message);
      setVoiceStatus('Login failed. Please try again.');
      speak('Login failed. Please try again.');
      setLoading(false);
    }
  };

  const startVoiceLogin = () => {
    setStep('name');
    setError('');
    setVoiceStatus('');
    stopSpeaking();
    speakThenListen('Welcome! Please say your name.');
  };

  // Keyboard fallback: Enter logs in once both fields are filled
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && name && regNo && !loading) {
        handleLogin();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const hints = {
    name: 'Say: "My name is ..." or type it below.',
    regNo: 'Say: "My registration number is ..." or type it below.',
    done: 'Say "login" to continue, or press Enter.',
  };

  return (
    <div className="card">
      <h2>Voice Login</h2>
      <p style={{ textAlign: 'center', color: '#aaa', marginBottom: '1rem' }}>
        Speak your details or type them below
      </p>

      {isSupported && (
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <button
            className={`voice-btn ${listening ? 'listening' : ''}`}
            onClick={listening ? stopListening : startVoiceLogin}
            style={{ margin: '0 auto' }}
          >
            {listening ? ' Listening... (Click to stop)' : 'Start Voice Login'}
          </button>
        </div>
      )}

      <p className="status-text" aria-live="polite" style={{ textAlign: 'center', marginBottom: '1rem' }}>
        {voiceStatus || hints[step]}
      </p>

      <div className="input-field">
        <label style={{ display: 'block', marginBottom: '0.3rem', color: '#aaa', fontSize: '0.85rem' }}>Name</label>
        <input
          type="text"
          className="input-field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name"
          aria-label="Your name"
        />
      </div>

      <div className="input-field">
        <label style={{ display: 'block', marginBottom: '0.3rem', color: '#aaa', fontSize: '0.85rem' }}>Registration Number</label>
        <input
          type="text"
          className="input-field"
          value={regNo}
          onChange={(e) => setRegNo(e.target.value.toUpperCase())}
          placeholder="Enter registration number"
          aria-label="Your registration number"
        />
      </div>

      {error && <p className="error-text">{error}</p>}

      <button
        className="btn btn-primary"
        style={{ width: '100%', marginTop: '1rem' }}
        onClick={() => handleLogin()}
        disabled={loading}
      >
        {loading ? 'Logging in...' : 'Login'}
      </button>

      <div className="keyboard-info">
        <strong>Keyboard Shortcuts:</strong><br />
        <kbd>Enter</kbd> to login when both fields are filled<br />
        <kbd>Tab</kbd> to navigate between fields
      </div>
    </div>
  );
}
