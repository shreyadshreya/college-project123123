import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';

function formatDateTime(value) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatMarks(record) {
  if (record.pending_evaluation && !record.graded) return 'Pending';
  const value = record.marks_obtained ?? record.score;
  if (typeof value !== 'number') return '—';
  return `${value}%`;
}

function statusClass(status) {
  const value = String(status || '').toLowerCase();
  if (value.includes('pending')) return 'status-pending';
  if (value.includes('graded') || value.includes('complete')) return 'status-complete';
  if (value.includes('partial')) return 'status-partial';
  return 'status-submitted';
}

function answerText(answer, options) {
  const value = String(answer ?? '').trim();
  if (!value || value.toLowerCase() === 'not answered') return 'Not answered';
  if (options && options[value]) return `${value}) ${options[value]}`;
  return value;
}

function correctText(answer, options) {
  const value = String(answer ?? '').trim();
  if (!value) return 'Not available';
  if (options && options[value]) return `${value}) ${options[value]}`;
  return value;
}

export default function StudentAnswers({ token, onUnauthorized }) {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  useEffect(() => {
    let cancelled = false;

    api.getSubmissions(token)
      .then((data) => {
        if (!cancelled) setSubmissions(data.submissions || []);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.status === 401) {
          onUnauthorized?.();
        } else {
          setError(err.message || 'Failed to load student submissions.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, onUnauthorized]);

  const handleRefresh = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getSubmissions(token);
      setSubmissions(data.submissions || []);
    } catch (err) {
      if (err.status === 401) {
        onUnauthorized?.();
      } else {
        setError(err.message || 'Failed to load student submissions.');
      }
    } finally {
      setLoading(false);
    }
  };

  const closeDetails = useCallback(() => {
    setActive(null);
    setDetail(null);
    setDetailError('');
    setDetailLoading(false);
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeDetails();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, closeDetails]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return submissions;
    return submissions.filter((submission) => (
      String(submission.name || '').toLowerCase().includes(needle)
      || String(submission.reg_no || '').toLowerCase().includes(needle)
    ));
  }, [submissions, search]);

  const openDetails = async (submission) => {
    setActive(submission);
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    try {
      const data = await api.getSubmission(submission.id, token);
      setDetail(data.submission || null);
      if (!data.submission) setDetailError('Submission details were not returned.');
    } catch (err) {
      if (err.status === 401) {
        onUnauthorized?.();
        closeDetails();
      } else {
        setDetailError(err.message || 'Failed to load submission details.');
      }
    } finally {
      setDetailLoading(false);
    }
  };

  const visibleRecord = detail || active;
  const details = detail?.details || [];

  return (
    <section aria-labelledby="student-answers-heading">
      <div className="submissions-header">
        <div>
          <h3 id="student-answers-heading" style={{ margin: 0 }}>Student Answers</h3>
          <p className="submissions-subtitle">
            Saved exam submissions and individual answers. No scores are shown to students.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleRefresh}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="submissions-toolbar">
        <label className="search-field">
          <span>Search</span>
          <input
            type="search"
            className="input-field"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Student name or registration number"
            aria-label="Search submissions by student name or registration number"
          />
        </label>
        <span className="submission-count" aria-live="polite">
          {filtered.length} of {submissions.length} submissions
        </span>
      </div>

      {error && <p className="error-text" role="alert">{error}</p>}

      {loading ? (
        <div className="submissions-empty" role="status">
          <p>Loading student submissions...</p>
        </div>
      ) : submissions.length === 0 ? (
        <div className="submissions-empty" role="status">
          <h4>No submissions yet</h4>
          <p>Student exam submissions will appear here after they submit an exam.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="submissions-empty" role="status">
          <h4>No matching submissions</h4>
          <p>Try a different student name or registration number.</p>
        </div>
      ) : (
        <div className="submissions-table-wrap">
          <table className="submissions-table">
            <thead>
              <tr>
                <th scope="col">Student name</th>
                <th scope="col">Registration no.</th>
                <th scope="col">Exam</th>
                <th scope="col">Submitted</th>
                <th scope="col">Answered</th>
                <th scope="col">Marks obtained</th>
                <th scope="col">Status</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((submission) => (
                <tr key={submission.id}>
                  <td>{submission.name || '—'}</td>
                  <td>{submission.reg_no || '—'}</td>
                  <td>{submission.exam_name || submission.exam_id || '—'}</td>
                  <td>{formatDateTime(submission.submitted_at)}</td>
                  <td>
                    {submission.answered}/{submission.total_questions}
                  </td>
                  <td>{formatMarks(submission)}</td>
                  <td>
                    <span className={`status-pill ${statusClass(submission.status)}`}>
                      {submission.status || 'Submitted'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      onClick={() => openDetails(submission)}
                    >
                      View Answers
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {active && (
        <div
          className="submission-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDetails();
          }}
        >
          <div
            className="submission-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="submission-modal-title"
          >
            <div className="submission-modal-header">
              <div>
                <h3 id="submission-modal-title">
                  {visibleRecord?.name || 'Student'} — Answers
                </h3>
                <p className="submissions-subtitle">
                  Registration: {visibleRecord?.reg_no || '—'}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={closeDetails}
                aria-label="Close answer details"
              >
                Close
              </button>
            </div>

            {detailLoading ? (
              <div className="submissions-empty" role="status">
                <p>Loading saved answers...</p>
              </div>
            ) : detailError ? (
              <p className="error-text" role="alert">{detailError}</p>
            ) : detail ? (
              <>
                <div className="submission-meta">
                  <div><span>Exam</span><strong>{detail.exam_name || detail.exam_id || '—'}</strong></div>
                  <div><span>Submitted</span><strong>{formatDateTime(detail.submitted_at)}</strong></div>
                  <div><span>Answered</span><strong>{detail.answered}/{detail.total_questions}</strong></div>
                  <div><span>Marks obtained</span><strong>{formatMarks(detail)}</strong></div>
                  <div><span>Total marks</span><strong>{detail.total_marks ?? '—'}</strong></div>
                  <div><span>Status</span><strong>{detail.status || 'Submitted'}</strong></div>
                </div>

                {detail.teacher_feedback && (
                  <div className="submission-feedback">
                    <strong>Existing feedback:</strong> {detail.teacher_feedback}
                  </div>
                )}

                {details.length === 0 ? (
                  <div className="submissions-empty">
                    <p>This legacy submission does not contain individual answer details.</p>
                  </div>
                ) : (
                  <div className="answer-detail-list">
                    {details.map((answer, index) => {
                      const options = answer.options || {};
                      const correctness = answer.is_correct === true
                        ? 'Correct'
                        : answer.is_correct === false
                          ? 'Incorrect'
                          : 'Not auto-graded';
                      const correctnessClass = answer.is_correct === true
                        ? 'answer-correct'
                        : answer.is_correct === false
                          ? 'answer-incorrect'
                          : 'answer-ungraded';

                      return (
                        <article className="answer-detail-card" key={`${answer.question_id}-${index}`}>
                          <div className="answer-detail-head">
                            <strong>Q{answer.question_id || index + 1}.</strong>
                            <span className={`answer-badge ${correctnessClass}`}>{correctness}</span>
                          </div>
                          <p className="answer-question">
                            {answer.question || 'Question text was not stored for this legacy answer.'}
                          </p>
                          <dl className="answer-fields">
                            <div>
                              <dt>Student answer</dt>
                              <dd>{answerText(answer.student_answer, options)}</dd>
                            </div>
                            <div>
                              <dt>Correct answer</dt>
                              <dd>{correctText(answer.correct_answer, options)}</dd>
                            </div>
                            <div>
                              <dt>Marks awarded</dt>
                              <dd>
                                {typeof answer.marks_awarded === 'number'
                                  ? `${answer.marks_awarded}${typeof answer.max_marks === 'number' ? ` / ${answer.max_marks}` : ''}`
                                  : '—'}
                              </dd>
                            </div>
                          </dl>
                        </article>
                      );
                    })}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
