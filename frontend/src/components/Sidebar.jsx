import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'

const DOC_COLORS = {
  pdf:     { bg: 'rgba(255,255,255,0.15)', color: '#ffcccc', icon: 'ti-file-type-pdf' },
  docx:    { bg: 'rgba(255,255,255,0.15)', color: '#cce0ff', icon: 'ti-file-type-doc' },
  doc:     { bg: 'rgba(255,255,255,0.15)', color: '#cce0ff', icon: 'ti-file-type-doc' },
  txt:     { bg: 'rgba(255,255,255,0.15)', color: '#ccf0e0', icon: 'ti-file-text' },
  default: { bg: 'rgba(255,255,255,0.15)', color: '#cce4ff', icon: 'ti-file' },
}

const URL_COLOR = { bg: 'rgba(79,195,247,0.2)', color: '#4fc3f7', icon: 'ti-world' }

function getExt(filename) {
  return filename?.split('.').pop()?.toLowerCase() || 'default'
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return null
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatRefreshTime(iso) {
  if (!iso) return null
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return null }
}

function getDocTypeFromContent(doc) {
  const filename = doc?.original_name?.toLowerCase() || ''
  const content = doc?.content_preview || ''
  const combined = `${filename} ${content}`.toLowerCase()

  const typePatterns = {
    '📋 Leave Policy': { keywords: ['leave','earned leave','casual leave','maternity leave','medical leave','leave salary','leave account','extraordinary leave','study leave','leave on private affairs','leave on medical certificate','sick leave','annual leave','privilege leave','commuted leave','half pay leave','lapsing of leave','leave at credit'], weight: 3 },
    '📘 Service Regulation': { keywords: ['service regulation','appointment','probation','promotion','seniority','pay fixation','increment','foreign service','deputation','suspension','disciplinary','dismissal','removal','retirement','pension','service book','qualifying service','lien','officiating','reversion','compulsory retirement','voluntary retirement','age of retirement'], weight: 3 },
    '⚠️ Disaster Management': { keywords: ['disaster','cyclone','flood','tsunami','earthquake','landslide','emergency','evacuation','restoration','mitigation','preparedness','response','recovery','hazard','vulnerability','calamity','varadah','nilam','thane','relief','rescue','storm','power restoration','emergency operation'], weight: 3 },
    '🔒 IT Security': { keywords: ['security','password','encryption','firewall','vulnerability','access control','authentication','confidential','classification','incident response','risk assessment','audit','compliance','information security','cyber','malware','virus','hacking','intrusion detection','penetration testing','cryptography','acceptable use','data protection','breach'], weight: 3 },
    '📁 Office Manual': { keywords: ['tappal','current file','note file','drafting','referencing','despatch','record section','file','section','branch','proceedings','memorandum','endorsement','circular','office procedure','office manual','confidential papers','tamil nadu electricity board','secretariat branch'], weight: 3 },
    '🔌 Electrical Standards': { keywords: ['voltage','transformer','substation','transmission','distribution','power supply','grid','generation','kW','kVA','MV','HV','circuit breaker','relay','conductor','cable','overhead','underground','protection','earthing','insulation','power factor','load','frequency','phase'], weight: 2 },
    '📊 Financial Policy': { keywords: ['budget','account','audit','balance sheet','revenue','expenditure','tariff','billing','collection','financial','fund','capital','investment','loan','interest','taxation','profit','loss','asset','liability'], weight: 2 },
    '👥 HR Policy': { keywords: ['recruitment','employment','staff','workforce','manpower','training','development','career progression','performance','attendance','conduct','discipline','grievance','welfare','health','safety','compensation','benefits','employee relations','union','collective bargaining'], weight: 2 },
    '📄 Policy Document': { keywords: ['policy','regulation','rules','guidelines','procedures','standard operating procedure','compliance','governance','framework','implementation','responsibilities','authority','delegation','procedure'], weight: 1 },
  }

  let maxScore = 0, bestMatch = '📄 Policy Document'
  for (const [type, pattern] of Object.entries(typePatterns)) {
    let score = 0
    for (const kw of pattern.keywords) if (combined.includes(kw)) score += pattern.weight
    if (score > maxScore) { maxScore = score; bestMatch = type }
  }
  return maxScore > 2 ? bestMatch : '📄 Policy Document'
}

// ── URL row ───────────────────────────────────────────────────────────────────
function UrlRow({ urlDoc, isSelected, onToggle, onDelete, onRefresh }) {
  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh(e) {
    e.stopPropagation()
    if (refreshing) return
    setRefreshing(true)
    try { await onRefresh(urlDoc.id) } finally { setRefreshing(false) }
  }

  const refreshedLabel = formatRefreshTime(urlDoc.last_refreshed_at)

  return (
    <div
      onClick={() => onToggle(urlDoc.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 8px', borderRadius: 6, cursor: 'pointer',
        background: isSelected ? 'rgba(255,255,255,0.15)' : 'transparent',
        borderLeft: isSelected ? '3px solid #4fc3f7' : '3px solid transparent',
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{
        width: 28, height: 28, borderRadius: 5, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: URL_COLOR.bg, color: URL_COLOR.color, fontSize: 13,
      }}>
        <i className={`ti ${URL_COLOR.icon}`} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.9)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {urlDoc.label || urlDoc.url}
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>
          {urlDoc.chunk_count} chunks
          {refreshedLabel ? ` · refreshed ${refreshedLabel}` : ''}
        </div>
      </div>

      {/* Refresh button */}
      <button
        onClick={handleRefresh}
        title="Re-fetch and re-index this URL"
        style={{
          background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)',
          fontSize: 13, padding: '2px', borderRadius: 3,
          display: 'flex', opacity: 0, transition: 'opacity 0.15s', cursor: 'pointer',
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = 1; e.currentTarget.style.color = '#4fc3f7' }}
        onMouseLeave={e => { e.currentTarget.style.opacity = 0 }}
      >
        <i className={`ti ${refreshing ? 'ti-loader-2' : 'ti-refresh'}`}
          style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
      </button>

      {/* Delete button */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(urlDoc.id) }}
        title="Remove URL source"
        style={{
          background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)',
          fontSize: 13, padding: '2px', borderRadius: 3,
          display: 'flex', opacity: 0, transition: 'opacity 0.15s', cursor: 'pointer',
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = 1; e.currentTarget.style.color = '#fca5a5' }}
        onMouseLeave={e => { e.currentTarget.style.opacity = 0 }}
      >
        <i className="ti ti-trash" />
      </button>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function Sidebar({
  docs, urls = [], loading, uploadProgress, uploadQueue = [],
  onUpload, onDelete, onDeleteUrl, onRefreshUrl,
  selectedDocIds, onToggleDoc,
  isAdmin = false,
}) {
  const onDrop = useCallback((accepted) => {
    accepted.forEach((f) => onUpload(f))
  }, [onUpload])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': [], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [], 'text/plain': [] },
    multiple: true,
  })

  const isUploading = uploadQueue.length > 0

  const groupedDocs = docs.reduce((acc, doc) => {
    const type = getDocTypeFromContent(doc)
    if (!acc[type]) acc[type] = []
    acc[type].push(doc)
    return acc
  }, {})

  const totalSources = docs.length + urls.length

  return (
    <aside style={{
      width: 'var(--sidebar-width)', background: '#003087',
      borderRight: '1px solid #00205e', display: 'flex',
      flexDirection: 'column', flexShrink: 0, position: 'relative', overflow: 'hidden',
    }}>
      {/* Logo / header */}
      <div style={{ padding: '14px 14px 12px', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, background: 'white', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <polygon points="9,1 2,5 2,13 9,17 16,13 16,5" stroke="#003087" strokeWidth="1.5" fill="none" />
              <line x1="9" y1="1" x2="9" y2="17" stroke="#003087" strokeWidth="1.2" />
              <line x1="2" y1="5" x2="16" y2="13" stroke="#003087" strokeWidth="0.8" />
              <line x1="16" y1="5" x2="2" y2="13" stroke="#003087" strokeWidth="0.8" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>TNEB PolicyAI</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>
              {isAdmin ? 'Admin Panel' : 'Employee Access'}
            </div>
          </div>
        </div>
      </div>

      {isAdmin ? (
        <>
          {/* Section label */}
          <div style={{
            padding: '10px 14px 4px', fontSize: 10, fontWeight: 700,
            color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em',
            textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>Knowledge Sources ({totalSources})</span>
            {totalSources > 0 && (
              <span style={{ fontSize: 9, opacity: 0.6 }}>
                {docs.length} doc{docs.length !== 1 ? 's' : ''} · {urls.length} URL{urls.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {loading && totalSources === 0 && (
              <div style={{ padding: '20px 8px', color: 'rgba(255,255,255,0.45)', fontSize: 12, textAlign: 'center' }}>
                <i className="ti ti-loader-2" style={{ fontSize: 18, display: 'block', marginBottom: 6, animation: 'spin 1s linear infinite' }} />
                Loading…
              </div>
            )}

            {!loading && totalSources === 0 && uploadQueue.length === 0 && (
              <div style={{ padding: '24px 8px', color: 'rgba(255,255,255,0.35)', fontSize: 11, textAlign: 'center', lineHeight: 1.7 }}>
                <i className="ti ti-database" style={{ fontSize: 28, display: 'block', marginBottom: 8, opacity: 0.4 }} />
                No sources yet.<br />Upload a document or add a URL.
              </div>
            )}

            {/* ── URL sources ── */}
            {urls.length > 0 && (
              <div style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', padding: '6px 8px 2px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                  🔗 Web URLs ({urls.length})
                </div>
                {urls.map((u) => (
                  <UrlRow
                    key={u.id}
                    urlDoc={u}
                    isSelected={selectedDocIds.includes(u.id)}
                    onToggle={onToggleDoc}
                    onDelete={onDeleteUrl}
                    onRefresh={onRefreshUrl}
                  />
                ))}
              </div>
            )}

            {/* ── Document sources ── */}
            {Object.entries(groupedDocs).map(([type, typeDocs]) => (
              <div key={type} style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', padding: '4px 8px 2px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                  {type} ({typeDocs.length})
                </div>
                {typeDocs.map((doc) => {
                  const ext = getExt(doc.original_name)
                  const style = DOC_COLORS[ext] || DOC_COLORS.default
                  const isSelected = selectedDocIds.includes(doc.id)
                  return (
                    <div key={doc.id}
                      onClick={() => onToggleDoc(doc.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '7px 8px', borderRadius: 6, cursor: 'pointer',
                        background: isSelected ? 'rgba(255,255,255,0.15)' : 'transparent',
                        borderLeft: isSelected ? '3px solid #4fc3f7' : '3px solid transparent',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                    >
                      <div style={{ width: 28, height: 28, borderRadius: 5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: style.bg, color: style.color, fontSize: 13 }}>
                        <i className={`ti ${style.icon}`} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.9)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {doc.original_name}
                        </div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>
                          {doc.chunk_count} chunks · {formatSize(doc.size_bytes) || '—'}
                          {doc.uploaded_by ? ` · ${doc.uploaded_by}` : ''}
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDelete(doc.id) }}
                        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 13, padding: '2px', borderRadius: 3, display: 'flex', opacity: 0, transition: 'opacity 0.15s', cursor: 'pointer' }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = 1; e.currentTarget.style.color = '#fca5a5' }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = 0 }}
                        title="Delete document"
                      >
                        <i className="ti ti-trash" />
                      </button>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Upload queue + button */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 10 }}>
            {/* Upload queue progress bars */}
          <div style={{ padding: '0 10px' }}>
            {uploadQueue.map((u) => (
              <div key={u.id} style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 7, padding: '7px 10px', marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.65)', marginBottom: 4 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{u.name}</span>
                  <span>{u.progress}%</span>
                </div>
                <div style={{ height: 3, background: 'rgba(255,255,255,0.15)', borderRadius: 2 }}>
                  <div style={{ height: '100%', width: `${u.progress}%`, background: '#4fc3f7', borderRadius: 2, transition: 'width 0.3s' }} />
                </div>
              </div>
            ))}
          </div>

          {/* Primary CTA — opens the modal (both tabs) */}
          <div style={{ padding: '0 10px 10px' }}>
            <button
              onClick={() => onUpload()}
              style={{
                width: '100%', padding: '10px 0', borderRadius: 8,
                background: 'rgba(79,195,247,0.18)',
                border: '1.5px solid rgba(79,195,247,0.4)',
                color: '#4fc3f7', fontSize: 12, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(79,195,247,0.28)'; e.currentTarget.style.borderColor = 'rgba(79,195,247,0.7)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(79,195,247,0.18)'; e.currentTarget.style.borderColor = 'rgba(79,195,247,0.4)' }}
            >
              <i className="ti ti-plus" style={{ fontSize: 14 }} />
              Add Knowledge Source
            </button>
            <div style={{ textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 5 }}>
              Upload PDF / DOCX · Add URL
            </div>
          </div>
          </div>
        </>
      ) : (
        /* Employee view */
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', textAlign: 'center' }}>
          <div style={{ color: 'rgba(255,255,255,0.5)' }}>
            <i className="ti ti-lock" style={{ fontSize: 32, display: 'block', marginBottom: 12 }} />
            <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>Document Access Restricted</div>
            <div style={{ fontSize: 11, marginTop: 6, lineHeight: 1.6 }}>Documents are managed by<br />administrators only.</div>
            {(docs.length + urls.length) > 0 && (
              <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(255,255,255,0.08)', borderRadius: 6 }}>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                  <i className="ti ti-database" style={{ marginRight: 4 }} />
                  {docs.length + urls.length} source(s) available
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </aside>
  )
}