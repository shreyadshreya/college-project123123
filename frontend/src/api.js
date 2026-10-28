const BASE_URL = '/api';

function formatErrorDetail(detail) {
  if (!detail) return 'Request failed';
  if (Array.isArray(detail)) {
    return detail
      .map((item) => item?.msg || item?.message || JSON.stringify(item))
      .join('; ');
  }
  if (typeof detail === 'string') return detail;
  return JSON.stringify(detail);
}

async function apiCall(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  const headers = { ...(options.headers || {}) };
  // Never set Content-Type for FormData: the browser must add the
  // multipart/form-data boundary itself, otherwise FastAPI cannot parse it.
  if (options.body && !isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    const raw = await response.text();
    let detail = raw;
    try {
      const parsed = JSON.parse(raw);
      detail = parsed.detail ?? raw;
    } catch {
      // Keep the raw response text (e.g. an HTML error page).
    }
    throw new Error(formatErrorDetail(detail) || `Request failed (${response.status})`);
  }

  return response.json();
}

export const api = {
  // Admin
  uploadPdf: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiCall('/admin/upload-pdf', { method: 'POST', body: formData });
  },
  getQuestions: () => apiCall('/admin/questions'),
  deleteQuestions: () => apiCall('/admin/questions', { method: 'DELETE' }),
  getResults: () => apiCall('/admin/results'),
  gradeResult: (index, score, feedback) => apiCall(`/admin/results/${index}/grade`, {
    method: 'POST',
    body: JSON.stringify({ score, feedback }),
  }),

  // Auth
  login: (name, regNo) => apiCall('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ name, reg_no: regNo }),
  }),
  register: (name, regNo) => apiCall('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, reg_no: regNo }),
  }),

  // Exam
  getExamQuestions: () => apiCall('/exam/questions'),
  submitExam: (regNo, answers) => apiCall('/exam/submit', {
    method: 'POST',
    body: JSON.stringify({ reg_no: regNo, answers }),
  }),
  getResult: (regNo) => apiCall(`/exam/result/${regNo}`),

  // Sample
  generateSamplePaper: () => apiCall('/sample/generate-ai-paper', { method: 'POST' }),
};
