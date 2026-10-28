import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import { useTTS } from '../hooks/useSpeech';
import StudentAnswers from './StudentAnswers';

const ADMIN_TOKEN_KEY = 'adminToken';
const ADMIN_NAME_KEY = 'adminName';

export default function Admin() {
  const [adminToken, setAdminToken] = useState(
    () => sessionStorage.getItem(ADMIN_TOKEN_KEY) || ''
  );
  const [adminName, setAdminName] = useState(
    () => sessionStorage.getItem(ADMIN_NAME_KEY) || ''
  );
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminLoginError, setAdminLoginError] = useState('');
  const [adminLoggingIn, setAdminLoggingIn] = useState(false);
  const [activeTab, setActiveTab] = useState('questions');

  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingQuestions, setEditingQuestions] = useState(null);
  const [savingEdits, setSavingEdits] = useState(false);
  const fileInputRef = useRef(null);
  const { speak } = useTTS();

  // Revoke object URL when preview changes or component unmounts
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const clearAdminSession = useCallback(() => {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem(ADMIN_NAME_KEY);
    setAdminToken('');
    setAdminName('');
    setQuestions([]);
    setEditingQuestions(null);
    setFile(null);
    setPreviewUrl(null);
    setMessage('');
    setError('');
    setAdminUsername('');
    setAdminPassword('');
    setAdminLoginError('');
  }, []);

  const handleUnauthorized = useCallback(() => {
    clearAdminSession();
    setAdminLoginError('Your admin session expired. Please log in again.');
  }, [clearAdminSession]);

  useEffect(() => {
    if (!adminToken) return undefined;

    let cancelled = false;
    (async () => {
      try {
        const data = await api.getQuestions(adminToken);
        if (!cancelled) setQuestions(data.questions || []);
      } catch (err) {
        if (cancelled) return;
        if (err.status === 401) {
          handleUnauthorized();
        } else {
          console.error('Failed to load questions:', err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [adminToken, handleUnauthorized]);

  const handleAdminLogin = async (event) => {
    event.preventDefault();
    if (adminLoggingIn) return;

    const username = adminUsername.trim();
    if (!username || !adminPassword) {
      setAdminLoginError('Enter both the admin username and password.');
      return;
    }

    setAdminLoggingIn(true);
    setAdminLoginError('');
    try {
      const data = await api.adminLogin(username, adminPassword);
      sessionStorage.setItem(ADMIN_TOKEN_KEY, data.access_token);
      sessionStorage.setItem(ADMIN_NAME_KEY, data.username || username);
      setAdminToken(data.access_token);
      setAdminName(data.username || username);
      setAdminPassword('');
      setActiveTab('questions');
      speak('Admin login successful.');
    } catch (err) {
      setAdminLoginError(err.message || 'Admin login failed.');
    } finally {
      setAdminLoggingIn(false);
    }
  };

  const selectFile = (f) => {
    if (!f) return;
    if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) {
      setFile(null);
      setPreviewUrl(null);
      setError('Please select a PDF, JPG, JPEG, or PNG file.');
      return;
    }
    setError('');
    setMessage('');
    setEditingQuestions(null);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
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

  const handleRequestError = (err, fallback) => {
    if (err.status === 401) {
      handleUnauthorized();
      return;
    }
    setError(err.message || fallback);
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a question paper file first');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    setEditingQuestions(null);
    try {
      // Extract for review first; the current paper is only replaced when
      // the administrator clicks "Save Questions".
      const data = await api.uploadPdf(file, false, adminToken);
      setEditingQuestions(
        (data.questions || []).map((q) => ({ ...q, options: { ...q.options } }))
      );
      setMessage(
        `${data.count} questions extracted. Review and correct them below, ` +
        'then click Save Questions.'
      );
      speak(`Extracted ${data.count} questions. Review them and save when ready.`);
    } catch (err) {
      handleRequestError(err, 'Failed to extract questions from the uploaded file.');
      speak('Failed to extract questions from the uploaded file.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete all questions?')) return;
    try {
      await api.deleteQuestions(adminToken);
      setQuestions([]);
      setEditingQuestions(null);
      setMessage('All questions deleted');
      speak('All questions have been deleted.');
    } catch (err) {
      handleRequestError(err, 'Failed to delete questions.');
    }
  };

  const handleGenerateSample = async () => {
    setLoading(true);
    setError('');
    setMessage('');
    setEditingQuestions(null);
    try {
      const data = await api.generateSamplePaper(adminToken);
      setQuestions(data.questions || []);
      setMessage(data.message);
      speak(`Sample question paper generated successfully. ${data.count} questions extracted.`);
    } catch (err) {
      handleRequestError(err, 'Failed to generate sample paper.');
      speak('Failed to generate sample paper.');
    } finally {
      setLoading(false);
    }
  };

  const startEditing = () => {
    setEditingQuestions(
      questions.map((q) => ({ ...q, options: { ...q.options } }))
    );
    setError('');
    setMessage('');
  };

  const updateEditedQuestion = (index, field, value) => {
    setEditingQuestions((prev) => prev.map((q, i) => (
      i === index ? { ...q, [field]: value } : q
    )));
  };

  const updateEditedOption = (index, letter, value) => {
    setEditingQuestions((prev) => prev.map((q, i) => (
      i === index ? { ...q, options: { ...q.options, [letter]: value } } : q
    )));
  };

  const addEditingQuestion = () => {
    setEditingQuestions((prev) => {
      const nextId = prev.reduce(
        (max, q) => Math.max(max, Number(q.id) || 0),
        0
      ) + 1;
      return [
        ...prev,
        {
          id: nextId,
          text: '',
          options: { A: '', B: '', C: '', D: '' },
          correct_answer: null,
        },
      ];
    });
  };

  const removeEditingQuestion = (index) => {
    setEditingQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveEdits = async () => {
    setSavingEdits(true);
    setError('');
    setMessage('');
    try {
      const data = await api.updateQuestions(editingQuestions, adminToken);
      setQuestions(data.questions || []);
      setEditingQuestions(null);
      setMessage(data.message);
      speak(`Saved corrections to ${data.count} questions.`);
    } catch (err) {
      handleRequestError(err, 'Failed to save question corrections.');
      speak('Failed to save question corrections.');
    } finally {
      setSavingEdits(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  if (!adminToken) {
    return (
      <div className="card admin-login-card">
        <h2>Admin Login</h2>
        <p className="admin-login-intro">
          Sign in to manage question papers and view saved student answers.
        </p>
        <form onSubmit={handleAdminLogin}>
          <label className="admin-login-label" htmlFor="admin-username">Username</label>
          <input
            id="admin-username"
            className="input-field"
            type="text"
            value={adminUsername}
            onChange={(event) => setAdminUsername(event.target.value)}
            autoComplete="username"
            autoFocus
          />
          <label className="admin-login-label" htmlFor="admin-password">Password</label>
          <input
            id="admin-password"
            className="input-field"
            type="password"
            value={adminPassword}
            onChange={(event) => setAdminPassword(event.target.value)}
            autoComplete="current-password"
          />
          {adminLoginError && (
            <p className="error-text" role="alert">{adminLoginError}</p>
          )}
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '1rem' }}
            disabled={adminLoggingIn}
          >
            {adminLoggingIn ? 'Logging in...' : 'Login as Admin'}
          </button>
        </form>
        <p className="admin-login-help">
          Use the admin credentials configured for this deployment.
        </p>
      </div>
    );
  }

  return (
    <div className="card admin-panel-card">
      <div className="admin-page-header">
        <div>
          <h2>Admin Panel</h2>
          <p className="admin-signed-in">Signed in as {adminName || 'admin'}</p>
        </div>
        <button type="button" className="btn btn-secondary btn-small" onClick={clearAdminSession}>
          Logout
        </button>
      </div>

      <div className="admin-tabs" role="tablist" aria-label="Admin sections">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'questions'}
          className={`admin-tab ${activeTab === 'questions' ? 'active' : ''}`}
          onClick={() => setActiveTab('questions')}
        >
          Question Paper
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'submissions'}
          className={`admin-tab ${activeTab === 'submissions' ? 'active' : ''}`}
          onClick={() => setActiveTab('submissions')}
        >
          Student Answers
        </button>
      </div>

      {activeTab === 'questions' ? (
        <>
          <p style={{ textAlign: 'center', color: '#aaa', marginBottom: '1.5rem' }}>
            Upload a PDF or image question paper to auto-extract questions
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
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                onChange={handleFileChange}
              />
              <span style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>PDF / JPG / PNG</span>
              <span>{file ? file.name : 'Drag & drop a question paper here, or click to select'}</span>
            </label>
          </div>

          {file && previewUrl && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ marginBottom: '0.75rem', textAlign: 'center' }}>
                {/\.(jpe?g|png)$/i.test(file.name) ? 'Image Preview' : 'PDF Preview'}
              </h3>
              <p style={{ textAlign: 'center', color: '#aaa', marginBottom: '0.75rem' }}>
                {file.name} ({formatFileSize(file.size)})
              </p>
              {/\.(jpe?g|png)$/i.test(file.name) ? (
                <img
                  src={previewUrl}
                  alt="Question paper preview"
                  className="pdf-preview"
                  style={{ objectFit: 'contain' }}
                />
              ) : (
                <iframe
                  src={previewUrl}
                  title="PDF preview"
                  className="pdf-preview"
                />
              )}
            </div>
          )}

          {error && <p className="error-text" style={{ whiteSpace: 'pre-wrap' }}>{error}</p>}
          {message && <p className="success-text">{message}</p>}

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              onClick={handleUpload}
              disabled={loading || !file}
              style={{ flex: 1, minWidth: '150px' }}
            >
              {loading ? 'Extracting...' : 'Upload & Extract'}
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

          {editingQuestions ? (
            <>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                flexWrap: 'wrap',
                marginBottom: '0.5rem',
              }}>
                <h3 style={{ margin: 0 }}>
                  Review & Correct Questions ({editingQuestions.length})
                </h3>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={addEditingQuestion}
                  disabled={savingEdits}
                >
                  + Add Question
                </button>
              </div>
              <p style={{ color: '#aaa', marginBottom: '1rem' }}>
                Fix any OCR mistakes, add missing questions or options, and set
                answers you can verify. Leave an answer blank if it is not known.
                Nothing is saved until you click Save Questions.
              </p>
              <div className="questions-list">
                {editingQuestions.map((q, index) => (
                  <div key={q.id} className="question-item">
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '1rem',
                      marginBottom: '0.35rem',
                    }}>
                      <span style={{ color: '#aaa', fontSize: '0.9rem' }}>
                        Question {index + 1}
                      </span>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => removeEditingQuestion(index)}
                        disabled={savingEdits}
                        style={{
                          padding: '0.25rem 0.65rem',
                          fontSize: '0.8rem',
                          flex: '0 0 auto',
                        }}
                      >
                        Remove
                      </button>
                    </div>
                    <label style={{ display: 'block', color: '#aaa', fontSize: '0.9rem' }}>
                      Question text
                      <textarea
                        className="input-field"
                        rows={2}
                        value={q.text}
                        onChange={(e) => updateEditedQuestion(index, 'text', e.target.value)}
                        style={{ marginTop: '0.35rem', resize: 'vertical' }}
                      />
                    </label>
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                      marginTop: '0.5rem',
                    }}>
                      {['A', 'B', 'C', 'D'].map((letter) => (
                        <label
                          key={letter}
                          style={{
                            flex: '1 1 45%',
                            minWidth: '160px',
                            color: '#aaa',
                            fontSize: '0.9rem',
                          }}
                        >
                          {letter})
                          <input
                            className="input-field"
                            value={q.options?.[letter] || ''}
                            onChange={(e) => updateEditedOption(index, letter, e.target.value)}
                            style={{ marginTop: '0.25rem', marginBottom: 0 }}
                          />
                        </label>
                      ))}
                    </div>
                    <label style={{
                      display: 'block',
                      marginTop: '0.75rem',
                      color: '#aaa',
                      fontSize: '0.9rem',
                    }}>
                      Correct answer
                      <select
                        className="input-field"
                        value={q.correct_answer || ''}
                        onChange={(e) => updateEditedQuestion(index, 'correct_answer', e.target.value)}
                        style={{ marginTop: '0.25rem', marginBottom: 0 }}
                      >
                        <option value="">Not identified / descriptive</option>
                        {['A', 'B', 'C', 'D'].map((letter) => (
                          <option key={letter} value={letter}>{letter}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                ))}
              </div>
              <div style={{
                display: 'flex',
                gap: '1rem',
                marginTop: '1rem',
                flexWrap: 'wrap',
              }}>
                <button
                  className="btn btn-primary"
                  onClick={handleSaveEdits}
                  disabled={savingEdits || editingQuestions.length === 0}
                  style={{ flex: 1, minWidth: '150px' }}
                >
                  {savingEdits ? 'Saving...' : 'Save Questions'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setEditingQuestions(null)}
                  disabled={savingEdits}
                  style={{ flex: 1, minWidth: '150px' }}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : questions.length > 0 && (
            <>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                flexWrap: 'wrap',
                marginBottom: '1rem',
              }}>
                <h3 style={{ margin: 0 }}>
                  Extracted Questions ({questions.length})
                </h3>
                <button className="btn btn-secondary" onClick={startEditing}>
                  Review & Correct
                </button>
              </div>
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
                    {Object.keys(q.options).length > 0 && (
                      q.correct_answer ? (
                        <div className="q-answer">Answer: {q.correct_answer}</div>
                      ) : (
                        <div className="q-answer" style={{ color: '#ffd43b' }}>
                          Answer not identified — use Review & Correct to set it.
                        </div>
                      )
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <StudentAnswers token={adminToken} onUnauthorized={handleUnauthorized} />
      )}
    </div>
  );
}
