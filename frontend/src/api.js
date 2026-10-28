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
    const error = new Error(formatErrorDetail(detail) || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

function adminHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const api = {
  // Admin
  adminLogin: (username, password) => apiCall('/auth/admin-login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  }),
  uploadPdf: (file, save = true, token) => {
    const formData = new FormData();
    formData.append('file', file);
    const query = save ? '' : '?save=false';
    return apiCall(`/admin/upload-pdf${query}`, {
      method: 'POST',
      body: formData,
      headers: adminHeaders(token),
    });
  },
  getQuestions: (token) => apiCall('/admin/questions', {
    headers: adminHeaders(token),
  }),
  updateQuestions: (questions, token) => apiCall('/admin/questions', {
    method: 'PUT',
    headers: adminHeaders(token),
    body: JSON.stringify(questions),
  }),
  deleteQuestions: (token) => apiCall('/admin/questions', {
    method: 'DELETE',
    headers: adminHeaders(token),
  }),
  getSubmissions: (token) => apiCall('/admin/submissions', {
    headers: adminHeaders(token),
  }),
  getSubmission: (submissionId, token) => apiCall(
    `/admin/submissions/${encodeURIComponent(submissionId)}`,
    { headers: adminHeaders(token) },
  ),

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

  // Sample
  generateSamplePaper: (token) => apiCall('/sample/generate-ai-paper', {
    method: 'POST',
    headers: adminHeaders(token),
  }),
};
