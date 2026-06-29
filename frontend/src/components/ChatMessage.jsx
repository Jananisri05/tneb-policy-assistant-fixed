import ReactMarkdown from 'react-markdown'

export function TypingIndicator() {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <BotAvatar />
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '10px 10px 10px 2px', padding: '12px 16px',
        display: 'flex', gap: 5, alignItems: 'center',
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 5, height: 5, borderRadius: '50%', background: '#1565c0',
            animation: `typingBounce 1.2s ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
    </div>
  )
}

function BotAvatar() {
  return (
    <div style={{
      width: 30, height: 30, borderRadius: 8,
      background: '#003087',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, fontSize: 11, fontWeight: 700, color: 'white', marginTop: 2,
    }}>AI</div>
  )
}

function UserAvatar() {
  return (
    <div style={{
      width: 30, height: 30, borderRadius: 8,
      background: '#e2e8f0',
      border: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, fontSize: 11, fontWeight: 600,
      color: '#374151', marginTop: 2,
    }}>U</div>
  )
}

export default function ChatMessage({ message, onShowSources }) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div style={{ display: 'flex', gap: 10, flexDirection: 'row-reverse', animation: 'fadeUp 0.2s ease' }}>
        <UserAvatar />
        <div style={{
          maxWidth: '72%',
          background: '#eef4ff',
          border: '1px solid #c7d9f8',
          borderRadius: '10px 10px 2px 10px', padding: '10px 14px',
          fontSize: 13, color: 'var(--text)', lineHeight: 1.6,
        }}>
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', animation: 'fadeUp 0.2s ease' }}>
      <BotAvatar />
      <div style={{ maxWidth: '80%', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '10px 10px 10px 2px', padding: '12px 16px',
          fontSize: 13, color: 'var(--text)', lineHeight: 1.7,
        }}>
          <div className="markdown-body">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        </div>

        {message.sources && message.sources.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingLeft: 2 }}>
            {getUniqueDocNames(message.sources).map((name, i) => (
              <button key={i}
                onClick={() => onShowSources(message.sources)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 8px', background: '#eef4ff',
                  border: '1px solid #c7d9f8', borderRadius: 4,
                  fontSize: 10, color: '#1565c0', fontFamily: 'var(--font-mono)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#003087'; e.currentTarget.style.color = 'white' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#eef4ff'; e.currentTarget.style.color = '#1565c0' }}
              >
                <i className="ti ti-file-text" style={{ fontSize: 10 }} />
                {name}
              </button>
            ))}
            <span style={{ fontSize: 10, color: 'var(--muted2)', alignSelf: 'center', fontFamily: 'var(--font-mono)' }}>
              {message.tokensUsed ? `· ${message.tokensUsed} tokens` : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function getUniqueDocNames(sources) {
  return [...new Set(sources.map(s => s.document_name))]
}
