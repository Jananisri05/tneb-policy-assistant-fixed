import axios from 'axios'

const API_BASE = "https://tneb-policy-assistant-fixed-production.up.railway.app"

const NGROK_HEADER = { 'ngrok-skip-browser-warning': 'true' }

const api = axios.create({
  baseURL: API_BASE,
  headers: { 
    'Content-Type': 'application/json',
    ...NGROK_HEADER
  },
})

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('admin_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

export const authApi = {
  // Remove trailing slash from login
login: (username, password) => api.post('/api/v1/auth/login', { username, password }),
}

export const docApi = {
  getAll: () => api.get('/api/v1/documents/').then(r => ({ data: r.data || [] })),
  upload: (file, onProgress) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/api/v1/documents/upload/', formData, {
      headers: { 'Content-Type': 'multipart/form-data', ...NGROK_HEADER },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          onProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total))
        }
      },
    })
  },
  delete: (docId) => api.delete(`/api/v1/documents/${docId}/`),
}

export const queryApi = {
  query: (data) => api.post('/api/v1/query/', data),
  summarize: (docId, summaryType) => api.post('/api/v1/query/summarize/', {
    document_id: docId,
    summary_type: summaryType,
  }),
}

export const urlApi = {
  getAll: () => api.get('/api/v1/urls/'),
  add: (url, label) => api.post('/api/v1/urls/', { url, label: label || null }),
  delete: (urlId) => api.delete(`/api/v1/urls/${urlId}/`),
  refresh: (urlId) => api.post(`/api/v1/urls/${urlId}/refresh/`),
}