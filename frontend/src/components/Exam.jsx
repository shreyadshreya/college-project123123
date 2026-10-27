import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useTTS, useSTT } from '../hooks/useSpeech';

// Exam states
const STATE = {
  LOADING: 'loading',
  READING_QUESTION: 'reading_question',
  WAITING_FOR_READY: 'waiting_for_ready',
  LISTENING_FOR_ANSWER: 'listening_for_answer',
  CONFIRMING_ANSWER: 'confirming_answer',
  SUBMITTING: 'submitting',
  FINISHED: 'finished',
};

// Spoken words that end a descriptive answer
const FINISH_PATTERN =
  /(^|\s)(done|finished|finish|that is all|that's all|stop answer|end answer)$/;

// How speech-to-text commonly spells the option letters and numbers
const LETTER_MAP = {
  a: 'A', ay: 'A', aye: 'A', hey: 'A',
  b: 'B', be: 'B', bee: 'B',
  c: 'C', see: 'C', sea: 'C',
  d: 'D', dee: 'D',
  1: 'A', one: 'A', first: 'A',
  2: 'B', two: 'B', second: 'B',
  3: 'C', three: 'C', third: 'C',
  4: 'D', four: 'D', fourth: 'D',
};

// Extract an option letter (A-D) from a spoken transcript
function extractOption(text) {
  const lower = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!lower) return null;

  // Explicit phrase: "option b", "answer is c", "choose number 2", ...
  const phrase = lower.match(
    /\b(?:option|answer|choose|select|pick|number)\s*(?:is|number)?\s*(?:option\s*)?([a-d1-4]|one|two|three|four|first|second|third|fourth|ay|aye|be|bee|see|sea|dee)\b/
  );
  if (phrase && LETTER_MAP[phrase[1]]) {
    return LETTER_MAP[phrase[1]];
  }

  // The whole utterance is a single letter/number ("B", "be", "two")
  if (LETTER_MAP[lower]) {
    return LETTER_MAP[lower];
  }

  // Exactly one standalone A-D letter anywhere in the sentence
  const letters = lower.match(/\b[a-d]\b/g) || [];
  if (letters.length === 1) {
    return letters[0].toUpperCase();
  }

  return null;
}

// Detect transcripts that are really the assistant's own voice being picked up
function looksLikeAssistantEcho(lower) {
  return (
    lower.includes('please say') ||
    lower.includes('say your answer') ||
    lower.includes('say your name') ||
    lower.includes('registration number') ||
    lower.includes('option a b c') ||
    lower.includes('say done') ||
    lower.includes('say repeat') ||
    lower.includes('hear the question again')
  );
}

export default function Exam() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [studentName, setStudentName] = useState('');
  const [studentRegNo, setStudentRegNo] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [examState, setExamState] = useState(STATE.LOADING);

  const { speak, stop: stopSpeaking } = useTTS();
  const { start, stop: stopListening, listening, isSupported } = useSTT({
    onResult: handleVoiceCommand,
    onError: handleSpeechError,
  });

  const mountedRef = useRef(true);
  const answersRef = useRef(answers);
  const currentIndexRef = useRef(currentIndex);
  const questionsRef = useRef(questions);
  const examStateRef = useRef(examState);
  const descriptiveRef = useRef(false);
  const submitWarnedRef = useRef(false);
  const startRef = useRef(start);
  const stopListeningRef = useRef(stopListening);
  const speechSeqRef = useRef(0);

  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { questionsRef.current = questions; }, [questions]);
  useEffect(() => { examStateRef.current = examState; }, [examState]);
  useEffect(() => { startRef.current = start; }, [start]);
  useEffect(() => { stopListeningRef.current = stopListening; }, [stopListening]);

  // Descriptive paper = no question has options
  useEffect(() => {
    descriptiveRef.current =
      questions.length > 0 &&
      questions.every((q) => !q.options || Object.keys(q.options).length === 0);
  }, [questions]);

  // Helper: stop the mic, speak, then restart the mic when done.
  // Falls back to a timer because Chrome does not always fire TTS onend.
  const speakAndListen = useCallback((text, afterSpeak) => {
    stopListeningRef.current?.();
    speechSeqRef.current += 1;
    const seq = speechSeqRef.current;
    let finished = false;
    const finish = () => {
      if (finished || !mountedRef.current || seq !== speechSeqRef.current) return;
      finished = true;
      setTimeout(() => {
        if (!mountedRef.current || seq !== speechSeqRef.current) return;
        if (isSupported) {
          startRef.current();
        }
        afterSpeak?.();
      }, 350);
    };
    speak(text, finish);
    const estimatedMs = Math.max(2500, text.trim().split(/\s+/).length * 430 + 1500);
    setTimeout(finish, estimatedMs);
  }, [speak, isSupported]);

  useEffect(() => {
    mountedRef.current = true;
    const stored = sessionStorage.getItem('student');
    if (stored) {
      const student = JSON.parse(stored);
      setStudentName(student.name);
      setStudentRegNo(student.reg_no);
    }
    loadQuestions();
    return () => {
      mountedRef.current = false;
      stopSpeaking();
      stopListeningRef.current?.();
    };
  }, []);

  const loadQuestions = async () => {
    try {
      const data = await api.getExamQuestions();
      if (mountedRef.current) {
        setQuestions(data.questions);
        setLoading(false);
        if (data.questions.length > 0) {
          setTimeout(() => readQuestionAndAsk(data.questions[0]), 500);
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message);
        setLoading(false);
      }
    }
  };

  const readQuestionAndAsk = useCallback((question) => {
    if (!question) return;
    setExamState(STATE.READING_QUESTION);
    setStatusMessage('Reading question...');

    const hasOptions = question.options && Object.keys(question.options).length > 0;
    const optionsText = hasOptions
      ? Object.entries(question.options)
          .map(([letter, opt]) => `Option ${letter}. ${opt}.`)
          .join(' ')
      : '';
    const prompt = hasOptions
      ? ' Are you ready to answer now? Say yes to answer, or say repeat to hear the question again.'
      : ' Please say your answer. Say done when you finish, or repeat to hear the question again.';

    stopListeningRef.current?.();
    const fullText = `Question ${question.id}. ${question.text}. ${optionsText}${prompt}`;
    speechSeqRef.current += 1;
    const seq = speechSeqRef.current;
    let finished = false;
    const finish = () => {
      if (finished || !mountedRef.current || seq !== speechSeqRef.current) return;
      finished = true;
      if (hasOptions) {
        setExamState(STATE.WAITING_FOR_READY);
        setStatusMessage('Listening... Say "yes" to answer, say the option, or say "repeat"');
      } else {
        setExamState(STATE.LISTENING_FOR_ANSWER);
        setStatusMessage('Listening for your answer... say "done" when finished');
      }
      setTimeout(() => {
        if (mountedRef.current && seq === speechSeqRef.current && isSupported) {
          startRef.current();
        }
      }, 350);
    };
    speak(fullText, finish);
    // Safety net: never get stuck if the browser skips the TTS onend event
    const estimatedMs = Math.max(2500, fullText.trim().split(/\s+/).length * 430 + 1500);
    setTimeout(finish, estimatedMs);
  }, [speak, isSupported]);

  const listenForAnswer = useCallback(() => {
    setExamState(STATE.LISTENING_FOR_ANSWER);
    if (descriptiveRef.current) {
      setStatusMessage('Listening for your answer... say "done" when finished');
      speakAndListen('Please say your answer. Say done when you finish.');
    } else {
      setStatusMessage('Listening for your answer (A, B, C, or D)...');
      speakAndListen('Please say your answer. Option A, B, C, or D.');
    }
  }, [speakAndListen]);

  // ---- Descriptive answer handling ----

  function handleDescriptiveSpeech(lower, original, question) {
    if (!question) return;

    if (FINISH_PATTERN.test(lower)) {
      const current = (answersRef.current[question.id] || '').trim();
      if (current) {
        setExamState(STATE.CONFIRMING_ANSWER);
        setStatusMessage('Please confirm your answer...');
        speakAndListen(`Your answer is: ${current}. Is this correct? Say yes to confirm, or no to record it again.`);
      } else {
        speakAndListen('I did not hear an answer yet. Please say your answer, then say done.');
      }
      return;
    }

    if (['repeat', 'repeat question', 'say again'].includes(lower)) {
      speakAndListen('OK, I will read the question again.', () => {
        readQuestionAndAsk(questionsRef.current[currentIndexRef.current]);
      });
      return;
    }

    if (['clear', 'clear answer'].includes(lower)) {
      setAnswers((prev) => ({ ...prev, [question.id]: '' }));
      setStatusMessage('Answer cleared. Please say your answer again.');
      speakAndListen('Answer cleared. Please say your answer again.');
      return;
    }

    if (['submit', 'finish exam'].includes(lower)) {
      handleSubmit();
      return;
    }

    if (['next', 'skip'].includes(lower)) {
      speakAndListen('Moving to the next question.', () => goNext());
      return;
    }

    if (['previous', 'back'].includes(lower)) {
      speakAndListen('Going to the previous question.', () => goPrevious());
      return;
    }

    // Anything else is treated as answer content
    setAnswers((prev) => {
      const prevText = (prev[question.id] || '').trim();
      return {
        ...prev,
        [question.id]: prevText ? `${prevText} ${original.trim()}` : original.trim(),
      };
    });
    setStatusMessage(`Heard: "${original}" — say "done" when finished.`);
  }

  function handleDescriptiveConfirmation(lower, question) {
    if (!question) return;

    if (lower.includes('yes') || lower.includes('correct') || lower.includes('confirm') || lower.includes('save')) {
      speakAndListen('Answer saved.', () => goNext());
    } else if (lower.includes('no') || lower.includes('change') || lower.includes('again') || lower.includes('record')) {
      setAnswers((prev) => ({ ...prev, [question.id]: '' }));
      speakAndListen('OK, let us try again. Please say your answer, then say done.', () => listenForAnswer());
    } else {
      speakAndListen('Say yes to confirm your answer, or no to record it again.');
    }
  }

  // ---- Voice command router ----

  function handleSpeechError(error) {
    if (error === 'not-allowed' || error === 'service-not-allowed') {
      setStatusMessage('Microphone access denied. Please allow microphone access in your browser.');
    } else if (error === 'audio-capture') {
      setStatusMessage('No microphone found. Please connect a microphone.');
    } else if (error === 'network') {
      setStatusMessage('Speech recognition needs internet access. Please check your connection.');
    }
  }

  function handleVoiceCommand(text) {
    const original = text.trim();
    const lower = original
      .toLowerCase()
      .replace(/[.,!?;:]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (looksLikeAssistantEcho(lower)) {
      return;
    }

    setStatusMessage(`Heard: "${original}"`);

    const currentState = examStateRef.current;
    const currentQuestion = questionsRef.current[currentIndexRef.current];

    // Global commands
    if (['stop', 'quiet', 'silence'].includes(lower)) {
      stopSpeaking();
      setStatusMessage('Speech stopped.');
      return;
    }

    if (lower === 'help' || lower === 'what can i say') {
      speakAndListen(
        descriptiveRef.current
          ? 'Say your answer, then say done. Say next to skip, previous to go back, repeat to hear the question again, or submit to finish the exam.'
          : 'You can say: Option A, B, C, or D to answer. Next to go to next question. Previous to go back. Repeat to hear the question again. Submit to finish the exam.'
      );
      return;
    }

    // Waiting for "ready" confirmation (MCQ only)
    if (currentState === STATE.WAITING_FOR_READY) {
      const spokenOption = extractOption(lower);
      if (spokenOption) {
        selectAnswer(spokenOption);
        return;
      }

      if (lower.includes('yes') || lower.includes('yeah') || lower.includes('yep') || lower.includes('ready') || lower.includes('ok') || lower.includes('okay') || lower.includes('start')) {
        listenForAnswer();
      } else if (lower.includes('repeat') || lower.includes('again') || lower.includes('no') || lower.includes('not ready')) {
        speakAndListen('OK, I will read the question again.', () => {
          readQuestionAndAsk(questionsRef.current[currentIndexRef.current]);
        });
      } else {
        speakAndListen('I did not understand. Say yes to answer, say the option letter, or say repeat to hear the question again.');
      }
      return;
    }

    // Listening for the answer
    if (currentState === STATE.LISTENING_FOR_ANSWER) {
      if (descriptiveRef.current) {
        handleDescriptiveSpeech(lower, original, currentQuestion);
        return;
      }

      // MCQ: match A/B/C/D (and "be", "see", "two", ...) in the transcript
      const option = extractOption(lower);
      if (option) {
        selectAnswer(option);
        return;
      }

      if (lower.includes('repeat') || lower.includes('again') || lower.includes('say again')) {
        speakAndListen('OK, I will read the question again.', () => {
          readQuestionAndAsk(questionsRef.current[currentIndexRef.current]);
        });
        return;
      }

      if (lower.includes('next') || lower.includes('skip')) {
        speakAndListen('Skipping this question.', () => goNext());
        return;
      }

      if (lower.includes('previous') || lower.includes('back')) {
        speakAndListen('Going to previous question.', () => goPrevious());
        return;
      }

      if (lower.includes('submit') || lower.includes('finish')) {
        handleSubmit();
        return;
      }

      speakAndListen('I did not understand. Please say option A, B, C, or D. Or say repeat to hear the question again.');
      return;
    }

    // Confirming the answer
    if (currentState === STATE.CONFIRMING_ANSWER) {
      if (lower === 'submit' || lower === 'finish exam' || lower.includes('submit exam')) {
        handleSubmit();
        return;
      }

      if (lower === 'next' || lower === 'skip') {
        speakAndListen('Moving to the next question.', () => goNext());
        return;
      }

      if (lower === 'previous' || lower === 'back') {
        speakAndListen('Going to the previous question.', () => goPrevious());
        return;
      }

      if (descriptiveRef.current) {
        handleDescriptiveConfirmation(lower, currentQuestion);
        return;
      }

      if (lower.includes('yes') || lower.includes('correct') || lower.includes('right') || lower.includes('confirm')) {
        speakAndListen('Answer confirmed.', () => goNext());
      } else if (lower.includes('no') || lower.includes('change') || lower.includes('wrong') || lower.includes('repeat')) {
        speakAndListen('OK, I will read the question again.', () => {
          readQuestionAndAsk(questionsRef.current[currentIndexRef.current]);
        });
      } else {
        speakAndListen('Say yes to confirm your answer, or no to change it.');
      }
      return;
    }
  }

  // ---- MCQ answer selection ----

  const selectAnswer = (letter) => {
    const q = questionsRef.current[currentIndexRef.current];
    if (!q) return;
    setAnswers((prev) => ({ ...prev, [q.id]: letter }));
    setExamState(STATE.CONFIRMING_ANSWER);
    setStatusMessage(`Answer: Option ${letter}`);
    speakAndListen(`You selected Option ${letter}. ${q.options[letter] || ''}. Is this correct? Say yes to confirm, or no to change.`);
  };

  // ---- Descriptive keyboard helpers ----

  const setAnswerText = (value) => {
    const q = questionsRef.current[currentIndexRef.current];
    if (!q) return;
    setAnswers((prev) => ({ ...prev, [q.id]: value }));
  };

  const clearAnswer = () => {
    const q = questionsRef.current[currentIndexRef.current];
    if (!q) return;
    setAnswers((prev) => ({ ...prev, [q.id]: '' }));
    setStatusMessage('Answer cleared.');
  };

  const confirmDescriptiveAnswer = () => {
    const q = questionsRef.current[currentIndexRef.current];
    if (!q) return;
    const text = (answersRef.current[q.id] || '').trim();
    if (!text) {
      speak('Please say or type your answer first.');
      return;
    }
    setExamState(STATE.CONFIRMING_ANSWER);
    setStatusMessage('Please confirm your answer...');
    speakAndListen(`Your answer is: ${text}. Is this correct? Say yes to confirm, or no to record it again.`);
  };

  // ---- Navigation ----

  const goNext = () => {
    if (currentIndexRef.current < questionsRef.current.length - 1) {
      const nextIndex = currentIndexRef.current + 1;
      setCurrentIndex(nextIndex);
      setTimeout(() => readQuestionAndAsk(questionsRef.current[nextIndex]), 300);
    } else {
      speakAndListen('This is the last question. Say submit to finish the exam.');
    }
  };

  const goPrevious = () => {
    if (currentIndexRef.current > 0) {
      const prevIndex = currentIndexRef.current - 1;
      setCurrentIndex(prevIndex);
      setTimeout(() => readQuestionAndAsk(questionsRef.current[prevIndex]), 300);
    } else {
      speakAndListen('This is the first question.');
    }
  };

  // ---- Submission ----

  const handleSubmit = async () => {
    if (submitting) return;

    const unanswered = questionsRef.current.filter(
      (q) => !(answersRef.current[q.id] || '').trim()
    );
    if (unanswered.length > 0 && !submitWarnedRef.current) {
      submitWarnedRef.current = true;
      speakAndListen(`Warning! You have ${unanswered.length} unanswered questions. Say submit again to confirm, or say previous to go back.`);
      return;
    }

    setSubmitting(true);
    setExamState(STATE.SUBMITTING);
    stopSpeaking();
    stopListeningRef.current?.();
    try {
      const answerList = Object.entries(answersRef.current)
        .filter(([, ans]) => (ans || '').trim())
        .map(([qId, ans]) => ({
          question_id: parseInt(qId),
          answer: ans.trim(),
        }));
      const result = await api.submitExam(studentRegNo, answerList);
      sessionStorage.setItem('examResult', JSON.stringify(result));
      setExamState(STATE.FINISHED);
      speak(
        result.pending_evaluation
          ? 'Exam submitted. Your answers will be evaluated by your teacher.'
          : `Exam submitted. Your score is ${result.score} percent.`
      );
      setTimeout(() => navigate('/results'), 2500);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  // ---- Keyboard fallback ----

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (loading || submitting) return;
      if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;

      if (descriptiveRef.current) {
        switch (e.key) {
          case 'ArrowRight':
          case 'n':
            e.preventDefault();
            goNext();
            break;
          case 'ArrowLeft':
          case 'p':
            e.preventDefault();
            goPrevious();
            break;
          case 'r':
            e.preventDefault();
            readQuestionAndAsk(questions[currentIndex]);
            break;
          case 's':
            e.preventDefault();
            handleSubmit();
            break;
          default:
            break;
        }
        return;
      }

      switch (e.key) {
        case 'ArrowRight':
        case 'n':
          e.preventDefault();
          goNext();
          break;
        case 'ArrowLeft':
        case 'p':
          e.preventDefault();
          goPrevious();
          break;
        case 'r':
          e.preventDefault();
          readQuestionAndAsk(questions[currentIndex]);
          break;
        case 's':
          e.preventDefault();
          handleSubmit();
          break;
        case '1':
        case 'a':
          e.preventDefault();
          selectAnswer('A');
          break;
        case '2':
        case 'b':
          e.preventDefault();
          selectAnswer('B');
          break;
        case '3':
        case 'c':
          e.preventDefault();
          selectAnswer('C');
          break;
        case '4':
        case 'd':
          e.preventDefault();
          selectAnswer('D');
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, questions, answers, loading, submitting]);

  // ---- Render ----

  if (loading) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <h2>Loading Exam...</h2>
        <p className="status-text">Please wait while we prepare your exam</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <h2>Error</h2>
        <p className="error-text">{error}</p>
        <button className="btn btn-primary" onClick={() => navigate('/')}>
          Go Back
        </button>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <h2>No Questions Available</h2>
        <p className="status-text">Please contact your admin to upload questions</p>
        <button className="btn btn-primary" onClick={() => navigate('/admin')}>
          Go to Admin
        </button>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const hasOptions = currentQuestion.options && Object.keys(currentQuestion.options).length > 0;
  const selectedAnswer = answers[currentQuestion.id];
  const answeredCount = Object.values(answers).filter((a) => (a || '').trim()).length;
  const descriptive =
    questions.length > 0 &&
    questions.every((q) => !q.options || Object.keys(q.options).length === 0);

  return (
    <div className="exam-container">
      <div className="exam-header">
        <span className="question-counter">
          {studentName ? `${studentName} • ` : ''}Question {currentIndex + 1} of {questions.length}
        </span>
        <span className="score-display">
          Answered: {answeredCount}/{questions.length}
        </span>
      </div>

      <div className="question-card">
        <div className="question-text">
          <strong>Q{currentQuestion.id}.</strong> {currentQuestion.text}
        </div>

        {hasOptions ? (
          <div className="options-list">
            {Object.entries(currentQuestion.options).map(([letter, text]) => (
              <button
                key={letter}
                className={`option-btn ${selectedAnswer === letter ? 'selected' : ''}`}
                onClick={() => selectAnswer(letter)}
                aria-label={`Option ${letter}: ${text}`}
              >
                <span className="option-letter">{letter}</span>
                <span>{text}</span>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ marginTop: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.4rem', color: '#aaa', fontSize: '0.85rem' }}>
              Your Answer (speak or type)
            </label>
            <textarea
              className="input-field answer-textarea"
              value={selectedAnswer || ''}
              onChange={(e) => setAnswerText(e.target.value)}
              placeholder='Speak your answer, then say "done" — or type it here'
              rows={6}
              aria-label="Your answer"
            />
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={clearAnswer}
                disabled={!selectedAnswer}
              >
                Clear
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={confirmDescriptiveAnswer}
                disabled={!(selectedAnswer || '').trim()}
              >
                Save Answer
              </button>
            </div>
          </div>
        )}

        {hasOptions && selectedAnswer && (
          <div style={{
            marginTop: '1rem',
            padding: '0.8rem 1rem',
            background: 'rgba(123, 47, 247, 0.2)',
            border: '2px solid #7b2ff7',
            borderRadius: '8px',
            textAlign: 'center',
            fontSize: '1.1rem',
            fontWeight: '600',
          }}>
            Your Answer: Option {selectedAnswer} — {currentQuestion.options[selectedAnswer]}
          </div>
        )}
      </div>

      {isSupported && (
        <div style={{ textAlign: 'center', margin: '1rem 0' }}>
          <button
            className={`voice-btn ${listening ? 'listening' : ''}`}
            onClick={listening ? stopListening : () => startRef.current()}
            style={{ margin: '0 auto' }}
          >
            {listening ? 'Listening... (Click to stop)' : 'Start Voice Control'}
          </button>
        </div>
      )}

      {statusMessage && (
        <p className="status-text" style={{ textAlign: 'center', marginTop: '0.5rem' }}>
          {statusMessage}
        </p>
      )}

      <div className="exam-controls">
        <button
          className="btn btn-secondary"
          onClick={goPrevious}
          disabled={currentIndex === 0}
        >
          Previous
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => readQuestionAndAsk(currentQuestion)}
        >
          Repeat
        </button>
        <button
          className="btn btn-secondary"
          onClick={goNext}
          disabled={currentIndex === questions.length - 1}
        >
          Next
        </button>
        <button
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? 'Submitting...' : 'Submit Exam'}
        </button>
      </div>

      <div className="keyboard-info" style={{ textAlign: 'center' }}>
        {descriptive ? (
          <>
            <strong>Voice:</strong> Speak your answer, say <kbd>done</kbd> to finish, <kbd>yes</kbd>/<kbd>no</kbd> to confirm, "Next", "Previous", "Repeat", "Submit"<br />
            <strong>Keyboard:</strong> type in the answer box | <kbd>N</kbd> next | <kbd>P</kbd> previous | <kbd>R</kbd> repeat | <kbd>S</kbd> submit
          </>
        ) : (
          <>
            <strong>Voice Commands:</strong> "Option A/B/C/D", "Next", "Previous", "Repeat", "Submit"<br />
            <strong>Keyboard:</strong> <kbd>A</kbd>/<kbd>1</kbd> <kbd>B</kbd>/<kbd>2</kbd> <kbd>C</kbd>/<kbd>3</kbd> <kbd>D</kbd>/<kbd>4</kbd> to answer | <kbd>N</kbd> next | <kbd>P</kbd> previous | <kbd>R</kbd> repeat | <kbd>S</kbd> submit
          </>
        )}
      </div>
    </div>
  );
}
