function formatSize(bytes) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const DOC_COLORS = {
  pdf: { bg: 'rgba(239,68,68,0.12)', color: '#EF4444', icon: 'ti-file-type-pdf' },
  docx: { bg: 'rgba(59,130,246,0.12)', color: '#3B82F6', icon: 'ti-file-type-doc' },
  doc: { bg: 'rgba(59,130,246,0.12)', color: '#3B82F6', icon: 'ti-file-type-doc' },
  txt: { bg: 'rgba(16,185,129,0.12)', color: '#10B981', icon: 'ti-file-text' },
  default: { bg: 'rgba(0,200,255,0.12)', color: '#00C8FF', icon: 'ti-file' },
}

function getExt(filename) { return filename?.split('.').pop()?.toLowerCase() || 'default' }

export default function AdminSidebar({ docs, loading, onOpenUpload, onDelete, selectedDocIds, onToggleDoc, adminName, onLogout }) {
  return (
    <aside style={{
      width: 'var(--sidebar-width)', background: 'var(--panel)',
      borderRight: '1px solid var(--border)', display: 'flex',
      flexDirection: 'column', flexShrink: 0, position: 'relative', overflow: 'hidden',
    }}>
      <svg style={{ position: 'absolute', inset: 0, opacity: 0.06, pointerEvents: 'none' }} xmlns="http://www.w3.org/2000/svg">
        <defs><pattern id="pg" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#00C8FF" strokeWidth="0.5" />
        </pattern></defs>
        <rect width="100%" height="100%" fill="url(#pg)" />
      </svg>

      {/* Logo */}
      <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--border)', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, background: 'var(--cyan)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, fontWeight: 800, color: 'var(--navy)' }}>AI</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>TNEB PolicyAI</div>
            <div style={{ fontSize: 9, color: 'var(--muted)' }}>Admin Panel</div>
          </div>
        </div>
      </div>

      {/* Admin info */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', position: 'relative', zIndex: 1, background: 'rgba(0,200,255,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--cyan-glow)', border: '1px solid rgba(0,200,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="ti ti-shield-check" style={{ fontSize: 12, color: 'var(--cyan)' }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>{adminName}</div>
              <div style={{ fontSize: 9, color: 'var(--success)' }}>● Administrator</div>
            </div>
          </div>
          <button onClick={onLogout} title="Sign out" style={{
            background: 'none', border: 'none', color: 'var(--muted)', fontSize: 14, cursor: 'pointer', padding: 4, borderRadius: 4,
          }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
          >
            <i className="ti ti-logout" />
          </button>
        </div>
      </div>

      {/* Section label */}
      <div style={{ padding: '10px 14px 4px', fontSize: 10, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', position: 'relative', zIndex: 1 }}>
        Indexed Documents ({docs.length})
      </div>

      {/* Document list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 2, position: 'relative', zIndex: 1 }}>
        {loading && docs.length === 0 && (
          <div style={{ padding: '20px 8px', color: 'var(--muted)', fontSize: 12, textAlign: 'center' }}>
            <i className="ti ti-loader-2" style={{ fontSize: 18, display: 'block', marginBottom: 6, animation: 'spin 1s linear infinite' }} />Loading...
          </div>
        )}
        {!loading && docs.length === 0 && (
          <div style={{ padding: '24px 8px', color: 'var(--muted)', fontSize: 11, textAlign: 'center', lineHeight: 1.7 }}>
            <i className="ti ti-files" style={{ fontSize: 28, display: 'block', marginBottom: 8, opacity: 0.4 }} />
            No documents yet.<br />Upload one below.
          </div>
        )}
        {docs.map((doc) => {
          const ext = getExt(doc.original_name)
          const style = DOC_COLORS[ext] || DOC_COLORS.default
          const isSelected = selectedDocIds.includes(doc.id)
          return (
            <div key={doc.id} onClick={() => onToggleDoc(doc.id)} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 6, cursor: 'pointer',
              background: isSelected ? 'var(--cyan-glow)' : 'transparent',
              border: `1px solid ${isSelected ? 'rgba(0,200,255,0.2)' : 'transparent'}`, transition: 'all 0.15s',
            }}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface2)' }}
              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
            >
              <div style={{ width: 26, height: 26, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: style.bg, color: style.color, fontSize: 12 }}>
                <i className={`ti ${style.icon}`} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.original_name}</div>
                <div style={{ fontSize: 9, color: 'var(--muted)' }}>{doc.chunk_count} chunks</div>
              </div>
              <button onClick={e => { e.stopPropagation(); onDelete(doc.id) }} style={{
                background: 'none', border: 'none', color: 'var(--muted2)', fontSize: 12, padding: '2px', borderRadius: 3,
                cursor: 'pointer', opacity: 0, transition: 'opacity 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.opacity = 1; e.currentTarget.style.color = 'var(--danger)' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = 0 }}
                title="Delete document"
              >
                <i className="ti ti-trash" />
              </button>
            </div>
          )
        })}
      </div>

      {/* Upload button */}
      <div style={{ padding: 10, borderTop: '1px solid var(--border)', position: 'relative', zIndex: 1 }}>
        <button onClick={onOpenUpload} style={{
          width: '100%', padding: '9px', background: 'var(--cyan)', border: 'none',
          borderRadius: 8, color: 'var(--navy)', fontSize: 12, fontWeight: 600,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          transition: 'all 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--cyan-dim)'}
          onMouseLeave={e => e.currentTarget.style.background = 'var(--cyan)'}
        >
          <i className="ti ti-upload" />
          Upload Document
        </button>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </aside>
  )
}