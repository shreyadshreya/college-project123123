import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { useTTS } from '../hooks/useSpeech';

export default function Admin() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [results, setResults] = useState([]);
  const [gradeDrafts, setGradeDrafts] = useState({});
  const [gradingIndex, setGradingIndex] = useState(null);
  const [gradeMessage, setGradeMessage] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);
  const { speak } = useTTS();

  // Revoke object URL when preview changes or component unmounts
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const selectFile = (f) => {
    setFile(f);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) selectFile(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) selectFile(f);
  };

  useEffect(() => {
    loadQuestions();
    loadResults();
  }, []);

  const loadQuestions = async () => {
    try {
      const data = await api.getQuestions();
      setQuestions(data.questions || []);
    } catch (err) {
      console.error('Failed to load questions:', err);
    }
  };

  const loadResults = async () => {
    try {
      const data = await api.getResults();
      setResults(data.results || []);
    } catch (err) {
      console.error('Failed to load results:', err);
    }
  };

  const updateGradeDraft = (index, field, value) => {
    setGradeDrafts((prev) => ({
      ...prev,
      [index]: { ...prev[index], [field]: value },
    }));
  };

  const handleGrade = async (index) => {
    const draft = gradeDrafts[index] || {};
    const score = Number(draft.score);

    if (draft.score === undefined || draft.score === '' || Number.isNaN(score) || score < 0 || score > 100) {
      setError('Please enter a score between 0 and 100.');
      return;
    }

    setGradingIndex(index);
    setError('');
    setGradeMessage('');
    try {
      const updated = await api.gradeResult(index, score, draft.feedback || '');
      setResults((prev) => prev.map((r, i) => (i === index ? updated : r)));
      setGradeMessage(`Grade saved: ${updated.name} scored ${updated.score}%.`);
      speak(`Grade saved. ${updated.name} scored ${updated.score} percent.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setGradingIndex(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a PDF file first');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const data = await api.uploadPdf(file);
      setQuestions(data.questions || []);
      setMessage(data.message);
      speak(`Successfully extracted ${data.count} questions from the PDF.`);
    } catch (err) {
      setError(err.message);
      speak('Failed to extract questions from the PDF.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete all questions?')) return;
    try {
      await api.deleteQuestions();
      setQuestions([]);
      setMessage('All questions deleted');
      speak('All questions have been deleted.');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGenerateSample = async () => {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const data = await api.generateSamplePaper();
      setQuestions(data.questions || []);
      setMessage(data.message);
      speak(`Sample question paper generated successfully. ${data.count} questions extracted.`);
    } catch (err) {
      setError(err.message);
      speak('Failed to generate sample paper.');
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="card" style={{ maxWidth: '800px' }}>
      <h2>Admin Panel</h2>
      <p style={{ textAlign: 'center', color: '#aaa', marginBottom: '1.5rem' }}>
        Upload a PDF question paper to auto-extract questions
      </p>

      <div
        className={`upload-area ${dragging ? 'dragging' : ''}`}
        style={dragging ? { borderColor: '#00d2ff', background: 'rgba(0, 210, 255, 0.05)' } : undefined}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (e.currentTarget.contains(e.relatedTarget)) return;
          setDragging(false);
        }}
        onDrop={handleDrop}
      >
        <label className="upload-label">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileChange}
          />
          <span style={{ fontSize: '2rem' }}>PDF</span>
          <span>{file ? file.name : 'Drag & drop your PDF here, or click to select'}</span>
        </label>
      </div>

      {file && previewUrl && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ marginBottom: '0.75rem', textAlign: 'center' }}>PDF Preview</h3>
          <p style={{ textAlign: 'center', color: '#aaa', marginBottom: '0.75rem' }}>
            {file.name} ({formatFileSize(file.size)})
          </p>
          <iframe
            src={previewUrl}
            title="PDF preview"
            className="pdf-preview"
          />
        </div>
      )}

      {error && <p className="error-text">{error}</p>}
      {message && <p className="success-text">{message}</p>}

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button
          className="btn btn-primary"
          onClick={handleUpload}
          disabled={loading || !file}
          style={{ flex: 1, minWidth: '150px' }}
        >
          {loading ? 'Saving...' : 'Save PDF & Extract'}
        </button>
        <button
          className="btn btn-secondary"
          onClick={handleGenerateSample}
          disabled={loading}
          style={{ flex: 1, minWidth: '150px' }}
        >
          Generate Sample AI Paper (40 Marks)
        </button>
        <button
          className="btn btn-danger"
          onClick={handleDelete}
          disabled={questions.length === 0}
          style={{ flex: 1, minWidth: '150px' }}
        >
          Delete All
        </button>
      </div>

      {questions.length > 0 && (
        <>
          <h3 style={{ marginBottom: '1rem' }}>
            Extracted Questions ({questions.length})
          </h3>
          <div className="questions-list">
            {questions.map((q) => (
              <div key={q.id} className="question-item">
                <div className="q-text">Q{q.id}. {q.text}</div>
                <div className="q-options">
                  {Object.entries(q.options).map(([letter, text]) => (
                    <span key={letter} style={{ marginRight: '1rem' }}>
                      {letter}) {text}
                    </span>
                  ))}
                  {Object.keys(q.options).length === 0 && (
                    <span style={{ color: '#ffd43b' }}>Descriptive question (voice answer)</span>
                  )}
                </div>
                {q.correct_answer && (
                  <div className="q-answer">Answer: {q.correct_answer}</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {results.length > 0 && (
        <>
          <h3 style={{ margin: '1.5rem 0 1rem' }}>
            Submissions ({results.length})
          </h3>
          {gradeMessage && <p className="success-text">{gradeMessage}</p>}
          <div className="questions-list">
            {results.map((r, idx) => (
              <div key={`${r.reg_no}-${idx}`} className="question-item">
                <div className="q-text">
                  {r.name} ({r.reg_no}) —{' '}
                  {r.pending_evaluation
                    ? 'Pending evaluation'
                    : `Score: ${r.score}%`}
                </div>
                {r.details.map((d) => (
                  <div
                    key={d.question_id}
                    style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#aaa' }}
                  >
                    <strong>Q{d.question_id}.</strong> {d.question}
                    <div style={{ color: '#00d2ff' }}>
                      Answer: {d.student_answer}
                    </div>
                  </div>
                ))}

                {r.mode !== 'mcq' && r.pending_evaluation && (
                  <div className="grade-form-row">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      className="input-field"
                      placeholder="Score %"
                      aria-label={`Score for ${r.name}`}
                      value={gradeDrafts[idx]?.score ?? ''}
                      onChange={(e) => updateGradeDraft(idx, 'score', e.target.value)}
                    />
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Feedback (optional)"
                      aria-label={`Feedback for ${r.name}`}
                      value={gradeDrafts[idx]?.feedback ?? ''}
                      onChange={(e) => updateGradeDraft(idx, 'feedback', e.target.value)}
                    />
                    <button
                      className="btn btn-primary"
                      onClick={() => handleGrade(idx)}
                      disabled={gradingIndex === idx}
                    >
                      {gradingIndex === idx ? 'Saving...' : 'Save Grade'}
                    </button>
                  </div>
                )}

                {r.mode !== 'mcq' && !r.pending_evaluation && (
                  <div className="q-answer">
                    Graded: {r.score}%
                    {r.teacher_feedback ? ` — ${r.teacher_feedback}` : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
