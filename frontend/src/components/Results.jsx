import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useTTS } from '../hooks/useSpeech';

export default function Results() {
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { speak } = useTTS();

  useEffect(() => {
    const stored = sessionStorage.getItem('examResult');
    if (stored) {
      const data = JSON.parse(stored);
      setResult(data);
      setLoading(false);
      const pending = data.pending_evaluation === true ||
        ((data.mode === 'descriptive' || data.mode === 'mixed') && !data.graded);
      if (pending) {
        speak('Exam completed. Your answers have been submitted for evaluation.');
      } else if (data.graded) {
        const pass = data.score >= 40;
        speak(
          `Your exam has been graded. Your score is ${data.score} percent. ` +
          (data.teacher_feedback ? `Teacher feedback: ${data.teacher_feedback}. ` : '') +
          (pass ? 'Congratulations, you passed!' : 'Unfortunately, you did not pass.')
        );
      } else {
        const pass = data.score >= 40;
        speak(
          `Exam completed. Your score is ${data.score} percent. ` +
          `You got ${data.correct} out of ${data.total_questions} correct. ` +
          (pass ? 'Congratulations, you passed!' : 'Unfortunately, you did not pass.')
        );
      }
    } else {
      // Try to fetch from API
      const student = sessionStorage.getItem('student');
      if (student) {
        const { reg_no } = JSON.parse(student);
        api.getResult(reg_no)
          .then((data) => {
            setResult(data);
            setLoading(false);
          })
          .catch(() => {
            setError('No exam result found. Please take the exam first.');
            setLoading(false);
          });
      } else {
        setError('No exam result found. Please take the exam first.');
        setLoading(false);
      }
    }
  }, []);

  if (loading) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <h2>Loading Results...</h2>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <h2>Error</h2>
        <p className="error-text">{error || 'No result available'}</p>
        <button className="btn btn-primary" onClick={() => navigate('/exam')}>
          Take Exam
        </button>
      </div>
    );
  }

  const descriptive = result.mode === 'descriptive' || result.mode === 'mixed';
  const graded = result.graded === true;
  const pending = result.pending_evaluation === true || (descriptive && !graded);

  if (pending) {
    return (
      <div className="card result-card">
        <h2>Exam Submitted</h2>
        <p style={{ textAlign: 'center', color: '#aaa' }}>
          {result.name} ({result.reg_no})
        </p>

        <div className="pending-banner">Pending Evaluation</div>

        <p style={{ textAlign: 'center', marginBottom: '1rem' }}>
          Your answers have been submitted. Your teacher will evaluate them.
        </p>

        {result.mode === 'mixed' && (
          <p style={{ textAlign: 'center', marginBottom: '1rem' }}>
            Auto-graded MCQ score: <strong>{result.score}%</strong> ({result.correct} correct)
          </p>
        )}

        <div className="result-details">
          <h3 style={{ marginBottom: '1rem' }}>Your Answers</h3>
          {result.details.map((detail) => (
            <div key={detail.question_id} className="result-detail-item pending">
              <strong>Q{detail.question_id}.</strong> {detail.question}
              <br />
              <small>Your answer: {detail.student_answer}</small>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
          <button
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={() => navigate('/exam')}
          >
            Retake Exam
          </button>
          <button
            className="btn btn-secondary"
            style={{ flex: 1 }}
            onClick={() => navigate('/')}
          >
            Home
          </button>
        </div>
      </div>
    );
  }

  const passed = result.score >= 40;

  if (descriptive) {
    return (
      <div className="card result-card">
        <h2>Exam Result</h2>
        <p style={{ textAlign: 'center', color: '#aaa' }}>
          {result.name} ({result.reg_no})
        </p>

        {graded && <div className="graded-badge">Graded by your teacher</div>}

        <div className={`score-circle ${passed ? 'pass' : 'fail'}`}>
          <span className="score-value">{result.score}%</span>
          <span className="score-label">{passed ? 'PASSED' : 'FAILED'}</span>
        </div>

        <p style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          {result.teacher_feedback
            ? `Teacher feedback: "${result.teacher_feedback}"`
            : 'Your answers have been evaluated.'}
        </p>

        <div className="result-details">
          <h3 style={{ marginBottom: '1rem' }}>Your Answers</h3>
          {result.details.map((detail) => (
            <div key={detail.question_id} className="result-detail-item pending">
              <strong>Q{detail.question_id}.</strong> {detail.question}
              <br />
              <small>Your answer: {detail.student_answer}</small>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
          <button
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={() => navigate('/exam')}
          >
            Retake Exam
          </button>
          <button
            className="btn btn-secondary"
            style={{ flex: 1 }}
            onClick={() => navigate('/')}
          >
            Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card result-card">
      <h2>Exam Results</h2>
      <p style={{ textAlign: 'center', color: '#aaa' }}>
        {result.name} ({result.reg_no})
      </p>

      <div className={`score-circle ${passed ? 'pass' : 'fail'}`}>
        <span className="score-value">{result.score}%</span>
        <span className="score-label">{passed ? 'PASSED' : 'FAILED'}</span>
      </div>

      <p style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        You got <strong>{result.correct}</strong> out of{' '}
        <strong>{result.total_questions}</strong> questions correct
      </p>

      <div className="result-details">
        <h3 style={{ marginBottom: '1rem' }}>Detailed Breakdown</h3>
        {result.details.map((detail) => (
          <div
            key={detail.question_id}
            className={`result-detail-item ${detail.is_correct ? 'correct' : 'incorrect'}`}
          >
            <strong>Q{detail.question_id}.</strong> {detail.question}
            <br />
            <small>
              Your answer: {detail.student_answer} |
              Correct answer: {detail.correct_answer}
            </small>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
        <button
          className="btn btn-primary"
          style={{ flex: 1 }}
          onClick={() => navigate('/exam')}
        >
          Retake Exam
        </button>
        <button
          className="btn btn-secondary"
          style={{ flex: 1 }}
          onClick={() => navigate('/')}
        >
          Home
        </button>
      </div>
    </div>
  );
}
