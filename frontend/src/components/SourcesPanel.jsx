import ReactMarkdown from 'react-markdown'

export default function SourcesPanel({ sources, onClose }) {
  if (!sources || sources.length === 0) return null

  return (
    <div style={{
      width: 280, background: 'var(--panel)', borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden',
    }}>
      <div style={{
        padding: '12px 14px',
        background: '#003087',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'white' }}>
            <i className="ti ti-list-search" style={{ marginRight: 6 }} />
            Sources ({sources.length})
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>Retrieved context chunks</div>
        </div>
        <button onClick={onClose} style={{
          background: 'rgba(255,255,255,0.12)', border: 'none', color: 'white',
          fontSize: 16, display: 'flex', padding: 4, borderRadius: 5, cursor: 'pointer',
        }}>
          <i className="ti ti-x" />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {sources.map((src, i) => (
          <div key={i} style={{
            background: 'white', border: '1px solid var(--border)',
            borderRadius: 8, padding: '10px 12px', marginBottom: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <div style={{
                width: 20, height: 20, borderRadius: 4,
                background: '#003087',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <span style={{ fontSize: 9, color: 'white', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{i + 1}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 10, color: '#1565c0', fontWeight: 600,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {src.document_name}
                </div>
                {src.page_number && (
                  <div style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                    Page {src.page_number}
                  </div>
                )}
              </div>
              <div style={{
                fontSize: 9, padding: '2px 6px', borderRadius: 3,
                background: getScoreBg(src.relevance_score),
                color: getScoreColor(src.relevance_score),
                fontFamily: 'var(--font-mono)', fontWeight: 700,
              }}>
                {Math.round(src.relevance_score * 100)}%
              </div>
            </div>
            <div style={{
              fontSize: 11, color: 'var(--text)', lineHeight: 1.6,
              borderTop: '1px solid var(--border)', paddingTop: 6,
              maxHeight: 120, overflowY: 'auto',
            }}>
              {src.chunk_text.slice(0, 300)}{src.chunk_text.length > 300 ? '…' : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function getScoreBg(score) {
  if (score >= 0.7) return 'rgba(16,185,129,0.12)'
  if (score >= 0.4) return 'rgba(245,158,11,0.12)'
  return 'rgba(239,68,68,0.12)'
}

function getScoreColor(score) {
  if (score >= 0.7) return '#16a34a'
  if (score >= 0.4) return '#d97706'
  return '#dc2626'
}
