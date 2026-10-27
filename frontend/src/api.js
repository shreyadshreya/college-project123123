const BASE_URL = '/api';

async function apiCall(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const config = {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  };
  const response = await fetch(url, config);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || 'Request failed');
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
