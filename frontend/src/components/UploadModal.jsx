import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'

function formatSize(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatDateTime(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
    })
  } catch { return '—' }
}

function isValidUrl(str) {
  try {
    const u = new URL(str)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch { return false }
}

// ── Shared modal shell ────────────────────────────────────────────────────────
function ModalShell({ onClose, children }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(2px)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 200,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--panel)', border: '1px solid var(--border)',
          borderRadius: 14, width: 560, maxHeight: '88vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {children}
      </div>
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}

// ── Tab bar ───────────────────────────────────────────────────────────────────
function TabBar({ active, onChange }) {
  const tabs = [
    { id: 'file', icon: 'ti-upload', label: 'Upload Document' },
    { id: 'url',  icon: 'ti-link',   label: 'Add URL Source' },
  ]
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            flex: 1, padding: '13px 16px', background: 'none', border: 'none',
            borderBottom: `2px solid ${active === t.id ? 'var(--cyan)' : 'transparent'}`,
            color: active === t.id ? 'var(--cyan)' : 'var(--muted)',
            fontSize: 13, fontWeight: active === t.id ? 600 : 400,
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 7, transition: 'all 0.15s',
            fontFamily: 'inherit',
          }}
        >
          <i className={`ti ${t.icon}`} style={{ fontSize: 15 }} />
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ── URL tab ───────────────────────────────────────────────────────────────────
function UrlTab({ onAddUrl, onClose }) {
  const [urlInput, setUrlInput] = useState('')
  const [label, setLabel]       = useState('')
  const [status, setStatus]     = useState(null)   // null | 'loading' | 'success' | 'error'
  const [message, setMessage]   = useState('')
  const [addedInfo, setAddedInfo] = useState(null)

  const urlOk = isValidUrl(urlInput.trim())

  async function handleAdd() {
    if (!urlOk || status === 'loading') return
    setStatus('loading')
    setMessage('')
    try {
      const result = await onAddUrl(urlInput.trim(), label.trim() || null)
      setAddedInfo(result)
      setStatus('success')
      setMessage(`Indexed ${result.chunk_count} chunks from the page.`)
    } catch (e) {
      setStatus('error')
      setMessage(e.message || 'Failed to add URL.')
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && urlOk) handleAdd()
  }

  function reset() {
    setUrlInput('')
    setLabel('')
    setStatus(null)
    setMessage('')
    setAddedInfo(null)
  }

  return (
    <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: 16, flex: 1, overflowY: 'auto' }}>

      {status === 'success' ? (
        /* ── Success state ── */
        <div style={{
          background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)',
          borderRadius: 10, padding: '18px 20px',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-circle-check" /> URL indexed successfully
          </div>
          {addedInfo && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                ['Label', addedInfo.label],
                ['URL', addedInfo.url],
                ['Chunks indexed', addedInfo.chunk_count],
                ['Added by', addedInfo.uploaded_by || 'admin'],
                ['Time', formatDateTime(addedInfo.uploaded_at)],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--muted)' }}>{k}</span>
                  <span style={{ color: 'var(--text)', fontWeight: 500, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ── Input state ── */
        <>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
              Page URL *
            </label>
            <div style={{
              display: 'flex', alignItems: 'center',
              border: `2px solid ${status === 'error' ? 'rgba(239,68,68,0.5)' : urlOk ? 'rgba(16,185,129,0.5)' : 'var(--border)'}`,
              borderRadius: 8, padding: '9px 12px', background: 'var(--surface)',
              transition: 'border-color 0.2s',
            }}>
              <i className="ti ti-link" style={{ fontSize: 15, color: 'var(--muted)', marginRight: 8, flexShrink: 0 }} />
              <input
                value={urlInput}
                onChange={(e) => { setUrlInput(e.target.value); setStatus(null); setMessage('') }}
                onKeyDown={handleKeyDown}
                placeholder="https://www.tneb.in/policy/leave-rules"
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}
                disabled={status === 'loading'}
              />
              {urlInput && (
                <i
                  className={`ti ${urlOk ? 'ti-circle-check' : 'ti-circle-x'}`}
                  style={{ fontSize: 15, color: urlOk ? 'var(--success)' : 'var(--muted2)', marginLeft: 6 }}
                />
              )}
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted2)', marginTop: 4 }}>
              The page must be publicly accessible — no login required.
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
              Label <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional — defaults to page title)</span>
            </label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. TNEB Leave Rules 2024"
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 8,
                border: '2px solid var(--border)', background: 'var(--surface)',
                fontSize: 13, color: 'var(--text)', outline: 'none',
                fontFamily: 'inherit', boxSizing: 'border-box',
              }}
              disabled={status === 'loading'}
            />
          </div>

          <div style={{
            padding: '12px 14px', background: 'rgba(0,48,135,0.04)',
            border: '1px dashed rgba(0,48,135,0.15)', borderRadius: 8,
            fontSize: 11, color: 'var(--muted)', lineHeight: 1.6,
          }}>
            <i className="ti ti-info-circle" style={{ marginRight: 6, color: 'var(--cyan-dim)' }} />
            The page will be fetched once, chunked, and embedded into the policy knowledge base. Use <strong>Refresh</strong> later if the page content changes.
          </div>

          {status === 'error' && (
            <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 7, fontSize: 12, color: '#EF4444' }}>
              <i className="ti ti-alert-circle" style={{ marginRight: 6 }} />{message}
            </div>
          )}

          {status === 'loading' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--muted)' }}>
              <i className="ti ti-loader-2" style={{ animation: 'spin 1s linear infinite', fontSize: 16 }} />
              Fetching page and indexing content… this may take a few seconds.
            </div>
          )}
        </>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 'auto', paddingTop: 8 }}>
        {status === 'success' ? (
          <>
            <button onClick={reset} style={btnStyle('secondary')}>
              <i className="ti ti-plus" style={{ marginRight: 6 }} />Add another
            </button>
            <button onClick={onClose} style={btnStyle('primary')}>Done</button>
          </>
        ) : (
          <>
            <button onClick={onClose} style={btnStyle('secondary')} disabled={status === 'loading'}>Cancel</button>
            <button
              onClick={handleAdd}
              disabled={!urlOk || status === 'loading'}
              style={btnStyle('primary', !urlOk || status === 'loading')}
            >
              <i className="ti ti-world-download" style={{ marginRight: 6 }} />
              {status === 'loading' ? 'Indexing…' : 'Add URL'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── tiny style helpers ────────────────────────────────────────────────────────
function btnStyle(variant, disabled = false) {
  const base = {
    padding: '9px 18px', borderRadius: 8, fontSize: 13,
    fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex', alignItems: 'center', fontFamily: 'inherit',
    border: 'none', transition: 'all 0.15s',
  }
  if (variant === 'primary') return {
    ...base,
    background: disabled ? 'var(--surface3)' : 'var(--cyan)',
    color: disabled ? 'var(--muted2)' : 'var(--navy)',
  }
  return {
    ...base,
    background: 'var(--surface2)', border: '1px solid var(--border)',
    color: 'var(--muted)', cursor: disabled ? 'not-allowed' : 'pointer',
  }
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function UploadModal({ onUpload, onAddUrl, onClose, uploadProgress, lastUploaded }) {
  const [tab, setTab] = useState('file')

  // file-tab state
  const [pendingFiles, setPendingFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [error, setError] = useState(null)
  const [uploadErrors, setUploadErrors] = useState([])
  const [systemIP, setSystemIP] = useState('Fetching...')
  const [adminName, setAdminName] = useState('')

  useEffect(() => {
    setAdminName(sessionStorage.getItem('tneb_user') || 'admin')
    fetch('https://api.ipify.org?format=json')
      .then((r) => r.json())
      .then((d) => setSystemIP(d.ip))
      .catch(() => setSystemIP('Unable to fetch'))
  }, [])

  const onDrop = useCallback((accepted) => {
    if (accepted?.length) { setPendingFiles((p) => [...p, ...accepted]); setError(null); setUploadErrors([]) }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': [], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [], 'text/plain': [] },
    multiple: true,
  })

  async function handleConfirmUpload() {
    if (!pendingFiles.length) return
    setError(null); setUploadErrors([]); setUploading(true)
    const ok = [], fail = []
    for (const file of pendingFiles) {
      try { await onUpload(file); ok.push(file) }
      catch (e) { fail.push({ file, error: e.message || 'Upload failed' }) }
    }
    setUploading(false)
    if (ok.length) {
      setUploadedFiles((p) => [...p, ...ok])
      const names = new Set(ok.map((f) => f.name))
      setPendingFiles((p) => p.filter((f) => !names.has(f.name)))
    }
    if (fail.length) {
      setUploadErrors(fail.map((f) => `${f.file.name}: ${f.error}`))
      setError(`${fail.length} file(s) failed to upload`)
    }
    if (ok.length && !fail.length) setTimeout(onClose, 2000)
  }

  const isUploading = uploadProgress !== null || uploading

  return (
    <ModalShell onClose={onClose}>
      {/* Header */}
      <div style={{ padding: '18px 22px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
            <i className="ti ti-database-import" style={{ marginRight: 8, color: 'var(--cyan)' }} />
            Add Knowledge Source
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            Upload a document file or index a web URL
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 18, cursor: 'pointer', padding: 4 }}>
          <i className="ti ti-x" />
        </button>
      </div>

      <TabBar active={tab} onChange={setTab} />

      {/* ── URL tab ── */}
      {tab === 'url' && <UrlTab onAddUrl={onAddUrl} onClose={onClose} />}

      {/* ── File tab ── */}
      {tab === 'file' && (
        <>
          <div style={{ padding: '20px 22px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Dropzone */}
            {uploadedFiles.length === 0 && !isUploading && (
              <>
                <div
                  {...getRootProps()}
                  style={{
                    border: `2px dashed ${isDragActive ? 'var(--cyan)' : pendingFiles.length > 0 ? 'var(--success)' : 'var(--border)'}`,
                    borderRadius: 10, padding: '28px 20px', textAlign: 'center', cursor: 'pointer',
                    background: isDragActive ? 'var(--cyan-glow2)' : pendingFiles.length > 0 ? 'rgba(16,185,129,0.06)' : 'var(--surface)',
                    transition: 'all 0.2s',
                  }}
                >
                  <input {...getInputProps()} />
                  {pendingFiles.length > 0 ? (
                    <>
                      <i className="ti ti-file-check" style={{ fontSize: 32, color: 'var(--success)', display: 'block', marginBottom: 8 }} />
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{pendingFiles.length} file(s) selected</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Total: {formatSize(pendingFiles.reduce((s, f) => s + f.size, 0))}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Click to add more files</div>
                    </>
                  ) : (
                    <>
                      <i className="ti ti-file-upload" style={{ fontSize: 36, color: 'var(--muted2)', display: 'block', marginBottom: 10 }} />
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                        {isDragActive ? 'Drop files here' : 'Drag & drop or click to select'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>PDF, DOCX, TXT · Max 100 MB each · Multiple allowed</div>
                    </>
                  )}
                </div>

                {/* File list */}
                {pendingFiles.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Selected files
                      </span>
                      <button onClick={() => { setPendingFiles([]); setUploadErrors([]) }} style={{ fontSize: 10, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                        Clear all
                      </button>
                    </div>
                    {pendingFiles.map((f, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7 }}>
                        <i className="ti ti-file" style={{ color: 'var(--cyan-dim)', fontSize: 14 }} />
                        <span style={{ flex: 1, fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--muted2)', flexShrink: 0 }}>{formatSize(f.size)}</span>
                        <button onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: 'var(--muted2)', cursor: 'pointer', fontSize: 14, padding: 2 }}>
                          <i className="ti ti-x" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Uploading */}
            {isUploading && (
              <div style={{ background: 'var(--surface)', borderRadius: 8, padding: '12px 14px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                  <span><i className="ti ti-loader-2" style={{ marginRight: 6, animation: 'spin 1s linear infinite' }} />Uploading files…</span>
                  <span style={{ color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>{uploadProgress || 0}%</span>
                </div>
                <div style={{ height: 4, background: 'var(--surface3)', borderRadius: 2 }}>
                  <div style={{ height: '100%', width: `${uploadProgress || 0}%`, background: 'var(--cyan)', borderRadius: 2, transition: 'width 0.3s' }} />
                </div>
              </div>
            )}

            {/* Success */}
            {uploadedFiles.length > 0 && !isUploading && (
              <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, padding: '16px 18px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="ti ti-circle-check" /> {uploadedFiles.length} document(s) uploaded
                </div>
                {lastUploaded && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[
                      ['Last uploaded', lastUploaded.original_name],
                      ['Chunks', lastUploaded.chunk_count],
                      ['Uploaded by', lastUploaded.uploaded_by || adminName],
                      ['Time', formatDateTime(lastUploaded.uploaded_at || new Date().toISOString())],
                      ['System IP', lastUploaded.uploader_ip || systemIP],
                    ].map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: 'var(--muted)' }}>{k}</span>
                        <span style={{ color: 'var(--text)', fontWeight: 500, fontFamily: k === 'System IP' ? 'var(--font-mono)' : 'inherit' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 7, fontSize: 12, color: '#EF4444' }}>
                <i className="ti ti-alert-circle" style={{ marginRight: 6 }} />{error}
                {uploadErrors.length > 0 && <ul style={{ marginTop: 4, paddingLeft: 20, fontSize: 11 }}>{uploadErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            {uploadedFiles.length > 0 && !isUploading ? (
              <>
                <button onClick={() => { setUploadedFiles([]); setPendingFiles([]); setError(null); setUploadErrors([]) }} style={btnStyle('secondary')}>
                  <i className="ti ti-upload" style={{ marginRight: 6 }} />Upload more
                </button>
                <button onClick={onClose} style={btnStyle('primary')}>Done</button>
              </>
            ) : (
              <>
                <button onClick={onClose} style={btnStyle('secondary')} disabled={isUploading}>Cancel</button>
                <button onClick={handleConfirmUpload} disabled={pendingFiles.length === 0 || isUploading} style={btnStyle('primary', pendingFiles.length === 0 || isUploading)}>
                  <i className="ti ti-shield-check" style={{ marginRight: 6 }} />
                  Upload {pendingFiles.length > 0 ? `${pendingFiles.length} file(s)` : 'All'}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </ModalShell>
  )
}