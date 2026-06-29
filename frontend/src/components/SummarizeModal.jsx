import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { queryApi } from '../services/api'

const TYPES = [
  { id: 'brief',    label: 'Brief',        desc: '3–5 sentence overview' },
  { id: 'detailed', label: 'Detailed',     desc: 'Comprehensive breakdown' },
  { id: 'bullets',  label: 'Bullet Points', desc: 'Structured key points' },
]

export default function SummarizeModal({ docs, onClose }) {
  const [selectedDoc, setSelectedDoc] = useState(docs[0]?.id || '')
  const [summaryType, setSummaryType] = useState('brief')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSummarize() {
    if (!selectedDoc) return
    setLoading(true); setError(null); setResult(null)
    try {
      const { data } = await queryApi.summarize(selectedDoc, summaryType)
      setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'white', border: '1px solid var(--border)',
        borderRadius: 12, width: 600, maxHeight: '80vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 20px',
          background: '#003087',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>
              <i className="ti ti-file-description" style={{ marginRight: 8 }} />
              Summarize Document
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
              Generate an AI summary of any indexed policy document
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.12)', border: 'none',
            color: 'white', fontSize: 18, display: 'flex', padding: 5,
            borderRadius: 6, cursor: 'pointer',
          }}>
            <i className="ti ti-x" />
          </button>
        </div>

        <div style={{ padding: '16px 20px', flex: 1, overflowY: 'auto' }}>
          {/* Document picker */}
          <div style={{ marginBottom: 14 }}>
            <label style={{
              fontSize: 11, color: 'var(--muted)', fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              display: 'block', marginBottom: 6,
            }}>Document</label>
            <select value={selectedDoc} onChange={e => setSelectedDoc(e.target.value)} style={{
              width: '100%', background: 'white', border: '1px solid var(--border)',
              borderRadius: 7, padding: '8px 12px', color: 'var(--text)',
              fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none',
            }}>
              {docs.map(d => (
                <option key={d.id} value={d.id}>{d.original_name}</option>
              ))}
            </select>
          </div>

          {/* Summary type */}
          <div style={{ marginBottom: 16 }}>
            <label style={{
              fontSize: 11, color: 'var(--muted)', fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              display: 'block', marginBottom: 6,
            }}>Summary Type</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {TYPES.map(t => (
                <div key={t.id} onClick={() => setSummaryType(t.id)} style={{
                  flex: 1, padding: '9px 10px', borderRadius: 7, cursor: 'pointer',
                  background: summaryType === t.id ? '#eef4ff' : 'white',
                  border: `1.5px solid ${summaryType === t.id ? '#003087' : 'var(--border)'}`,
                  transition: 'all 0.15s',
                }}>
                  <div style={{
                    fontSize: 12, fontWeight: 700,
                    color: summaryType === t.id ? '#003087' : 'var(--text)',
                  }}>{t.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{t.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <button onClick={handleSummarize} disabled={loading || !selectedDoc} style={{
            width: '100%', padding: '10px',
            background: loading ? '#e2e8f0' : '#003087',
            border: 'none', borderRadius: 7,
            color: loading ? 'var(--muted)' : 'white',
            fontSize: 13, fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            transition: 'background 0.15s',
          }}>
            {loading ? (
              <><i className="ti ti-loader-2" style={{ animation: 'spin 1s linear infinite' }} /> Generating summary...</>
            ) : (
              <><i className="ti ti-sparkles" /> Generate Summary</>
            )}
          </button>

          {error && (
            <div style={{
              marginTop: 12, padding: '10px 12px',
              background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)',
              borderRadius: 7, fontSize: 12, color: '#dc2626',
            }}>
              <i className="ti ti-alert-circle" style={{ marginRight: 6 }} />{error}
            </div>
          )}

          {result && (
            <div style={{ marginTop: 16 }}>
              <div style={{
                fontSize: 11, color: 'var(--muted)', marginBottom: 8,
                display: 'flex', justifyContent: 'space-between',
              }}>
                <span><i className="ti ti-file-text" style={{ marginRight: 4 }} />{result.document_name}</span>
                <span>{result.chunks_processed} chunks processed</span>
              </div>
              <div style={{
                background: '#f5f8fc', border: '1px solid var(--border)',
                borderRadius: 8, padding: '14px 16px',
                fontSize: 13, color: 'var(--text)', lineHeight: 1.7,
              }}>
                <div className="markdown-body">
                  <ReactMarkdown>{result.summary}</ReactMarkdown>
                </div>
              </div>
            </div>
          )}
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  )
}
