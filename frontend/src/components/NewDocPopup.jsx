// components/NewDocPopup.jsx

function getDocType(doc) {
  const name = (doc?.original_name || '').toLowerCase()

  if (/leave|casual|earned|maternity|sick|privilege|half.pay/.test(name)) return '📋 Leave Policy'
  if (/service.reg|regulation|appointment|probation|promotion|pension|retirement/.test(name)) return '📘 Service Regulation'
  if (/disaster|cyclone|flood|tsunami|emergency|evacuation/.test(name)) return '⚠️ Disaster Management'
  if (/security|cyber|password|firewall|encryption/.test(name)) return '🔒 IT Security'
  if (/office.manual|tappal|circular|despatch|memorandum/.test(name)) return '📁 Office Manual'
  if (/safety|handbook|ppe|hazard|accident/.test(name)) return '🦺 Safety'
  if (/electrical|voltage|transformer|substation|relay/.test(name)) return '🔌 Electrical Standards'
  if (/financial|budget|tariff|billing|revenue|audit/.test(name)) return '📊 Financial Policy'
  if (/hr|recruitment|staff|manpower|training|grievance/.test(name)) return '👥 HR Policy'
  return '📄 Policy Document'
}

/**
 * Props:
 *   allRecent  — array of DocumentInfo objects uploaded in last 24h
 *   onDismiss  — () => void
 */
export default function NewDocPopup({ allRecent = [], onDismiss }) {
  if (!allRecent.length) return null

  const typeCounts = allRecent.reduce((acc, doc) => {
    const t = getDocType(doc)
    acc[t] = (acc[t] || 0) + 1
    return acc
  }, {})

  return (
    <div style={{
      position: 'fixed', top: 72, right: 20,
      background: '#ffffff',
      border: '1.5px solid #003087',
      borderRadius: 10,
      padding: '14px 16px',
      width: 260,
      boxShadow: '0 6px 24px rgba(0,0,0,0.13)',
      zIndex: 999,
      animation: 'slideInRight 0.4s ease',
    }}>

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#003087' }}>
            🔔 New Documents
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>
            {allRecent.length} uploaded in the last 24h
          </div>
        </div>
        <button onClick={onDismiss} style={{
          background: 'none', border: 'none', color: '#9ca3af',
          cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1,
        }}>✕</button>
      </div>

      {/* Type breakdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
        {Object.entries(typeCounts).map(([type, count]) => (
          <div key={type} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '5px 10px',
            background: 'rgba(0,48,135,0.05)',
            borderRadius: 6,
          }}>
            <span style={{ fontSize: 12, color: '#1f2937' }}>{type}</span>
            <span style={{
              background: '#003087', color: '#fff',
              borderRadius: 10, padding: '1px 9px',
              fontSize: 11, fontWeight: 600,
            }}>{count}</span>
          </div>
        ))}
      </div>

      <button onClick={onDismiss} style={{
        width: '100%', background: '#003087', color: '#fff',
        border: 'none', borderRadius: 6, padding: '7px 0',
        fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
      }}
        onMouseEnter={e => e.currentTarget.style.background = '#00205e'}
        onMouseLeave={e => e.currentTarget.style.background = '#003087'}
      >
        Got it
      </button>
    </div>
  )
}