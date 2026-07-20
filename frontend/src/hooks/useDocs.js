// frontend/src/hooks/useDocs.js
import { useState, useEffect } from 'react'
import { docApi, urlApi } from '../services/api'

export function useDocs() {
  const [docs, setDocs] = useState([])
  const [urls, setUrls] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [uploadQueue, setUploadQueue] = useState([])
  const [lastUploaded, setLastUploaded] = useState(null)
  const [error, setError] = useState(null)
useEffect(() => {
  if (localStorage.getItem('admin_token')) {
    loadDocs()
    loadUrls()
  }
}, [])
  const loadDocs = async () => {
    setLoading(true)
    try {
      const { data } = await docApi.getAll()
      setDocs(data.documents || data || [])
      setError(null)
    } catch (e) {
      console.error('Load docs error:', e)
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const uploadDoc = async (file) => {
    const uploadId = Date.now().toString()
    setUploadQueue(prev => [...prev, { id: uploadId, name: file.name, progress: 0 }])
    setUploadProgress(0)

    try {
      const { data } = await docApi.upload(file, (progress) => {
        setUploadProgress(progress)
        setUploadQueue(prev => prev.map(u => u.id === uploadId ? { ...u, progress } : u))
      })

      const docData = {
        id: data.id,
        original_name: data.original_name || file.name,
        filename: data.filename || '',
        size_bytes: data.size_bytes || file.size,
        chunk_count: data.chunk_count || 0,
        uploaded_at: data.uploaded_at || new Date().toISOString(),
        uploaded_by: data.uploaded_by || 'Admin',
        uploader_ip: data.uploader_ip || '127.0.0.1',
        doc_type: data.doc_type || 'policy',
        content_preview: data.content_preview || '',
      }

      setDocs(prev => [docData, ...prev])
      setLastUploaded(docData)
      setUploadQueue(prev => prev.filter(u => u.id !== uploadId))
      setUploadProgress(null)
      setError(null)
      return docData
    } catch (e) {
      console.error('Upload error:', e)
      setUploadQueue(prev => prev.filter(u => u.id !== uploadId))
      setUploadProgress(null)
      throw e
    }
  }

  const deleteDoc = async (docId) => {
    if (!window.confirm('Are you sure you want to delete this document?')) return
    try {
      await docApi.delete(docId)
      setDocs(prev => prev.filter(d => d.id !== docId))
      setError(null)
    } catch (e) {
      console.error('Delete error:', e)
      setError(e.message)
    }
  }

  const loadUrls = async () => {
    try {
      const { data } = await urlApi.getAll()
      setUrls(data.urls || [])
    } catch (e) {
      console.warn('Load URLs error:', e)
    }
  }

  const addUrl = async (url, label) => {
    const { data } = await urlApi.add(url, label)
    const info = data.url_info
    const normalised = _normaliseUrl(info)
    setUrls(prev => [normalised, ...prev])
    setLastUploaded({ ...normalised, original_name: normalised.label })
    return normalised
  }

  const deleteUrl = async (urlId) => {
    if (!window.confirm('Are you sure you want to remove this URL source?')) return
    try {
      await urlApi.delete(urlId)
      setUrls(prev => prev.filter(u => u.id !== urlId))
    } catch (e) {
      console.error('Delete URL error:', e)
      setError(e.message)
    }
  }

  const refreshUrl = async (urlId) => {
    const { data } = await urlApi.refresh(urlId)
    const updated = _normaliseUrl(data.url_info)
    setUrls(prev => prev.map(u => u.id === urlId ? updated : u))
    return { updated, oldCount: data.old_chunk_count, newCount: data.new_chunk_count }
  }

  function _normaliseUrl(info) {
    return {
      id: info.id,
      doc_type: 'url',
      url: info.url,
      label: info.label,
      original_name: info.label,
      filename: '',
      size_bytes: 0,
      chunk_count: info.chunk_count,
      uploaded_at: info.ingested_at,
      last_refreshed_at: info.last_refreshed_at || null,
      uploaded_by: info.added_by || 'admin',
      uploader_ip: info.adder_ip || '',
      content_preview: '',
    }
  }

  return {
    docs, urls, loading, uploadProgress, uploadQueue,
    lastUploaded, error, loadDocs, uploadDoc, deleteDoc,
    addUrl, deleteUrl, refreshUrl,
  }
}