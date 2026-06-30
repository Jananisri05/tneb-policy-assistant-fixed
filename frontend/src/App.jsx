import { useState, useRef, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import ChatMessage, { TypingIndicator } from './components/ChatMessage'
import SourcesPanel from './components/SourcesPanel'
import SummarizeModal from './components/SummarizeModal'
import LoginPage from './components/LoginPage'
import UploadModal from './components/UploadModal'
import NewDocPopup from './components/NewDocPopup'
import { useDocs } from './hooks/useDocs'
import { queryApi } from './services/api'
import './index.css'

const TNEB_GUIDELINES = {
  dos: [
    'Ensure all consumer details are accurately recorded in service requests',
    'Maintain proper documentation for all inspections and maintenance activities',
    'Follow standard operating procedures for meter readings and billing',
    'Report any safety hazards or equipment malfunctions immediately',
    'Keep consumer grievance records updated with resolution status',
    'Adhere to scheduled maintenance timelines and protocols',
    'Verify consumer identity before providing account information',
    'Document all field activities with date and time stamps',
    'Use approved personal protective equipment during field work',
    'Follow data privacy guidelines when handling consumer information',
  ],
  donts: [
    'Never disclose consumer account details to unauthorized persons',
    'Do not bypass safety protocols during maintenance work',
    'Avoid processing incomplete or inaccurate service requests',
    'Never leave equipment or tools unattended at work sites',
    'Do not ignore consumer complaints or grievances',
    'Avoid unauthorized overtime work without proper approval',
    'Never share system credentials or passwords with others',
    'Do not use personal devices for official data storage',
    'Avoid making commitments to consumers without authorization',
    'Never falsify inspection reports or maintenance records',
  ],
}

const MODES = [
  { id: 'qa', label: 'Ask AI', icon: 'ti-message-question' },
  { id: 'search', label: 'Policy Search', icon: 'ti-search' },
]

// Content-based document type detection
function getDocTypeFromContent(doc) {
  const filename = doc?.original_name?.toLowerCase() || ''
  const content = doc?.content_preview || ''
  const combined = `${filename} ${content}`.toLowerCase()
  
  const typePatterns = {
    '📋 Leave Policy': {
      keywords: ['leave', 'earned leave', 'casual leave', 'maternity leave', 'medical leave', 'leave salary', 'leave account', 'extraordinary leave', 'study leave', 'leave on private affairs', 'leave on medical certificate', 'sick leave', 'annual leave', 'privilege leave', 'commuted leave', 'half pay leave', 'lapsing of leave', 'leave at credit'],
      weight: 3
    },
    '📘 Service Regulation': {
      keywords: ['service regulation', 'appointment', 'probation', 'promotion', 'seniority', 'pay fixation', 'increment', 'foreign service', 'deputation', 'suspension', 'disciplinary', 'dismissal', 'removal', 'retirement', 'pension', 'service book', 'qualifying service', 'lien', 'officiating', 'reversion', 'compulsory retirement', 'voluntary retirement', 'age of retirement'],
      weight: 3
    },
    '⚠️ Disaster Management': {
      keywords: ['disaster', 'cyclone', 'flood', 'tsunami', 'earthquake', 'landslide', 'emergency', 'evacuation', 'restoration', 'mitigation', 'preparedness', 'response', 'recovery', 'hazard', 'vulnerability', 'calamity', 'varadah', 'nilam', 'thane', 'relief', 'rescue', 'storm', 'power restoration', 'emergency operation'],
      weight: 3
    },
    '🔒 IT Security': {
      keywords: ['security', 'password', 'encryption', 'firewall', 'vulnerability', 'access control', 'authentication', 'confidential', 'classification', 'incident response', 'risk assessment', 'audit', 'compliance', 'information security', 'cyber', 'malware', 'virus', 'hacking', 'intrusion detection', 'penetration testing', 'cryptography', 'acceptable use', 'data protection', 'breach'],
      weight: 3
    },
    '📁 Office Manual': {
      keywords: ['tappal', 'current file', 'note file', 'drafting', 'referencing', 'despatch', 'record section', 'file', 'section', 'branch', 'proceedings', 'memorandum', 'endorsement', 'circular', 'office procedure', 'office manual', 'confidential papers', 'tamil nadu electricity board', 'secretariat branch'],
      weight: 3
    },
    '🔌 Electrical Standards': {
      keywords: ['voltage', 'transformer', 'substation', 'transmission', 'distribution', 'power supply', 'grid', 'generation', 'kW', 'kVA', 'MV', 'HV', 'circuit breaker', 'relay', 'conductor', 'cable', 'overhead', 'underground', 'protection', 'earthing', 'insulation', 'power factor', 'load', 'frequency', 'phase'],
      weight: 2
    },
    '📊 Financial Policy': {
      keywords: ['budget', 'account', 'audit', 'balance sheet', 'revenue', 'expenditure', 'tariff', 'billing', 'collection', 'financial', 'fund', 'capital', 'investment', 'loan', 'interest', 'taxation', 'profit', 'loss', 'asset', 'liability'],
      weight: 2
    },
    '👥 HR Policy': {
      keywords: ['recruitment', 'employment', 'staff', 'workforce', 'manpower', 'training', 'development', 'career progression', 'performance', 'attendance', 'conduct', 'discipline', 'grievance', 'welfare', 'health', 'safety', 'compensation', 'benefits', 'employee relations', 'union', 'collective bargaining'],
      weight: 2
    },
    '📄 Policy Document': {
      keywords: ['policy', 'regulation', 'rules', 'guidelines', 'procedures', 'standard operating procedure', 'compliance', 'governance', 'framework', 'implementation', 'responsibilities', 'authority', 'delegation', 'procedure'],
      weight: 1
    }
  }

  const scores = {}
  let maxScore = 0
  let bestMatch = '📄 Policy Document'

  for (const [type, pattern] of Object.entries(typePatterns)) {
    let score = 0
    for (const keyword of pattern.keywords) {
      if (combined.includes(keyword)) {
        score += pattern.weight
      }
    }
    scores[type] = score
    if (score > maxScore) {
      maxScore = score
      bestMatch = type
    }
  }

  return maxScore > 2 ? bestMatch : '📄 Policy Document'
}

export default function App() {
  const [role, setRole] = useState(() => {
    const storedRole = sessionStorage.getItem('tneb_role')
    return storedRole === 'admin' ? 'admin' : 'employee'
  })
  const [currentUser, setCurrentUser] = useState(() => {
    return sessionStorage.getItem('tneb_user') || 'employee'
  })

  function handleAdminLogin(newRole, user) {
    sessionStorage.setItem('tneb_role', newRole)
    sessionStorage.setItem('tneb_user', user)
    setRole(newRole)
    setCurrentUser(user)
  }

  function handleAdminLogout() {
    localStorage.removeItem('admin_token')
    sessionStorage.removeItem('tneb_role')
    sessionStorage.removeItem('tneb_user')
    setRole('employee')
    setCurrentUser('employee')
  }

  const isAdmin = role === 'admin'
  
  return <AppShell 
    key={role}
    isAdmin={isAdmin} 
    currentUser={currentUser} 
    onAdminLogout={handleAdminLogout}
    onAdminLogin={handleAdminLogin}
  />
}

function AppShell({ isAdmin, currentUser, onAdminLogout, onAdminLogin }) {
  const { docs, urls, loading, uploadProgress, uploadQueue, error, uploadDoc, deleteDoc, addUrl, deleteUrl, refreshUrl, lastUploaded } = useDocs()

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [mode, setMode] = useState('qa')
  const [selectedDocIds, setSelectedDocIds] = useState([])
  const [activeSources, setActiveSources] = useState(null)
  const [showSummarize, setShowSummarize] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [queryError, setQueryError] = useState(null)
  const [uploadSuccessCount, setUploadSuccessCount] = useState(0)
  const [uploadFailedCount, setUploadFailedCount] = useState(0)
  
  const [showNewDocNotification, setShowNewDocNotification] = useState(false)
  const [recentlyUploadedDoc, setRecentlyUploadedDoc] = useState(null)
  const [notificationDocs, setNotificationDocs] = useState([])

  const chatEndRef = useRef(null)
  const inputRef = useRef(null)

  // On employee load: fetch documents uploaded in the last 24h from the public endpoint
  // and show the popup if any exist. Re-runs whenever the user switches role.
  useEffect(() => {
    if (isAdmin) return

    let cancelled = false
    async function fetchRecent() {
      try {
        const res = await fetch('https://tneb-policy-assistant-fixed-production.up.railway.app/api/v1/documents/recent')
        if (!res.ok || cancelled) return
        const data = await res.json()
        const recent = data.documents || []
        if (recent.length > 0 && !cancelled) {
          setRecentlyUploadedDoc(recent[0])   // newest first (backend sorts desc)
          setNotificationDocs(recent)
          setShowNewDocNotification(true)
          setTimeout(() => {
            if (!cancelled) setShowNewDocNotification(false)
          }, 15000)
        }
      } catch (e) {
        // Non-fatal: employee just won't see the popup
        console.warn('Could not fetch recent docs:', e)
      }
    }

    fetchRecent()
    return () => { cancelled = true }
  }, [isAdmin])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const toggleDoc = useCallback((id) => {
    setSelectedDocIds(prev =>
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    )
  }, [])

  async function sendQuery(queryText) {
    const q = queryText || input.trim()
    if (!q || isTyping) return

    setInput('')
    setQueryError(null)
    setMessages(prev => [...prev, { role: 'user', content: q, id: Date.now() }])
    setIsTyping(true)

    const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }))

    try {
      const { data } = await queryApi.query({
        query: q,
        mode,
        document_ids: selectedDocIds.length > 0 ? selectedDocIds : null,
        conversation_history: history,
      })

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.answer,
        sources: data.sources,
        tokensUsed: data.tokens_used,
        id: Date.now(),
      }])

      if (data.sources?.length) setActiveSources(data.sources)
    } catch (e) {
      if (e.response?.status === 401) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Session expired. Please login again.',
          id: Date.now(),
        }])
        setTimeout(onAdminLogout, 2000)
        return
      }
      setQueryError(e.message)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Sorry, I encountered an error: ${e.message}`,
        id: Date.now(),
      }])
    } finally {
      setIsTyping(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuery() }
  }

  function clearChat() {
    setMessages([])
    setActiveSources(null)
    setQueryError(null)
  }

  const handleUpload = async (file) => {
    try {
      const result = await uploadDoc(file)
      setUploadSuccessCount(prev => prev + 1)
      return { success: true, file, data: result }
    } catch (e) {
      setUploadFailedCount(prev => prev + 1)
      throw e
    }
  }

  const handleUploadComplete = (successCount, failedCount) => {
    setShowUpload(false)
    if (successCount > 0 || failedCount > 0) {
      let message = ''
      if (successCount > 0 && failedCount === 0) {
        message = `✅ ${successCount} document(s) uploaded and indexed successfully.`
      } else if (successCount > 0 && failedCount > 0) {
        message = `✅ ${successCount} uploaded successfully. ❌ ${failedCount} file(s) failed.`
      } else {
        message = `❌ All ${failedCount} file(s) failed to upload. Please check file formats and try again.`
      }
      setMessages(prev => [...prev, { role: 'assistant', content: message, id: Date.now() }])
    }
    setTimeout(() => {
      setUploadSuccessCount(0)
      setUploadFailedCount(0)
    }, 1000)
  }

  const showWelcome = messages.length === 0

  function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div style={{ height: '100vh', display: 'flex', overflow: 'hidden' }}>
      {showLogin && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <LoginPage 
            onLogin={(role, user) => {
              onAdminLogin(role, user)
              setShowLogin(false)
            }} 
          />
        </div>
      )}

      <Sidebar
        docs={docs}
        urls={urls}
        loading={loading}
        uploadProgress={uploadProgress}
        uploadQueue={uploadQueue}
        onUpload={isAdmin ? () => setShowUpload(true) : null}
        onDelete={deleteDoc}
        onDeleteUrl={deleteUrl}
        onRefreshUrl={refreshUrl}
        selectedDocIds={selectedDocIds}
        onToggleDoc={toggleDoc}
        isAdmin={isAdmin}
      />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Top bar */}
        <header style={{
          padding: '10px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--panel)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 6px var(--success)' }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Policy Assistant</div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                {isAdmin ? `${docs.length} doc${docs.length !== 1 ? 's' : ''} · ${urls.length} URL${urls.length !== 1 ? 's' : ''} indexed` : 'Employee Access'}
                {selectedDocIds.length > 0 && isAdmin ? ` · Filtering ${selectedDocIds.length}` : ''}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{
              padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 600,
              background: isAdmin ? 'rgba(0,48,135,0.1)' : 'rgba(16,185,129,0.1)',
              border: `1px solid ${isAdmin ? 'rgba(0,48,135,0.25)' : 'rgba(16,185,129,0.25)'}`,
              color: isAdmin ? '#003087' : '#059669',
            }}>
              {isAdmin ? '⚙ Admin' : '👤 Employee'}
            </div>

            {isAdmin ? (
              <>
                <button
                  onClick={onAdminLogout}
                  style={{
                    padding: '5px 10px', borderRadius: 6,
                    background: 'var(--surface2)', border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', gap: 5,
                    color: 'var(--muted)', fontSize: 11, cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = 'rgba(220,38,38,0.4)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}
                >
                  <i className="ti ti-logout" style={{ fontSize: 13 }} />
                  Switch to Employee
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowLogin(true)}
                style={{
                  padding: '5px 12px', borderRadius: 6,
                  background: '#003087', border: 'none',
                  color: 'white', fontSize: 11, cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <i className="ti ti-login" style={{ fontSize: 13 }} />
                Admin Login
              </button>
            )}
            {docs.length > 0 && (
              <IconBtn icon="ti-file-description" title="Summarize document" onClick={() => setShowSummarize(true)} />
            )}
            <IconBtn icon="ti-refresh" title="Clear chat" onClick={clearChat} />
          </div>
        </header>

        {/* Chat area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: showWelcome ? '0' : '20px 24px', display: 'flex', flexDirection: 'column', gap: 16, position: 'relative' }}>
          
          {/* Notification Popup - Employee only, fed by /documents/recent */}
          {showNewDocNotification && !isAdmin && notificationDocs.length > 0 && (
            <NewDocPopup
              allRecent={notificationDocs}
              onDismiss={() => setShowNewDocNotification(false)}
            />
          )}

          {/* ── Welcome / centered prompt state ── */}
          {showWelcome && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              padding: '32px 24px 24px', minHeight: 0,
            }}>
              {/* Brand mark */}
              <div style={{
                width: 56, height: 56, background: 'var(--cyan)', borderRadius: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 16, fontSize: 22, fontWeight: 800, color: 'var(--navy)',
                boxShadow: '0 4px 20px rgba(0,51,102,0.18)',
              }}>AI</div>

              <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', textAlign: 'center', marginBottom: 6, letterSpacing: '-0.3px' }}>
                TNEB PolicyAI
              </h1>
              <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.7, marginBottom: 28, maxWidth: 440 }}>
                {isAdmin
                  ? 'Admin Assistant — manage knowledge sources and query policy documents.'
                  : 'Employee Assistant — ask anything about TNEB policies, leave rules, and guidelines.'}
              </p>

              {/* ── Centered prompt bar ── */}
              <div style={{ width: '100%', maxWidth: 620, marginBottom: 20 }}>
                {/* Mode pills */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 10, justifyContent: 'center' }}>
                  {MODES.map(m => (
                    <button key={m.id} onClick={() => setMode(m.id)} style={{
                      padding: '4px 14px', borderRadius: 16, fontSize: 11, fontWeight: 500,
                      border: `1px solid ${mode === m.id ? 'rgba(0,200,255,0.3)' : 'transparent'}`,
                      background: mode === m.id ? 'var(--cyan-glow)' : 'transparent',
                      color: mode === m.id ? 'var(--cyan)' : 'var(--muted)',
                      display: 'flex', alignItems: 'center', gap: 5,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                      <i className={`ti ${m.icon}`} style={{ fontSize: 12 }} />{m.label}
                    </button>
                  ))}
                </div>

                {queryError && (
                  <div style={{ marginBottom: 8, padding: '6px 10px', background: 'rgba(239,68,68,0.1)', borderRadius: 6, fontSize: 11, color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }}>
                    <i className="ti ti-alert-circle" style={{ marginRight: 5 }} />{queryError}
                  </div>
                )}

                {/* Input row */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{
                    flex: 1, background: 'var(--surface)', border: '2px solid var(--border)',
                    borderRadius: 12, display: 'flex', alignItems: 'center', padding: '11px 16px',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--cyan)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,200,255,0.1)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)' }}>
                    <input
                      ref={inputRef}
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onFocus={e => { e.currentTarget.parentElement.style.borderColor = 'var(--cyan)'; e.currentTarget.parentElement.style.boxShadow = '0 0 0 3px rgba(0,200,255,0.15)' }}
                      onBlur={e => { e.currentTarget.parentElement.style.borderColor = 'var(--border)'; e.currentTarget.parentElement.style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)' }}
                      placeholder={isAdmin ? (mode === 'qa' ? 'Ask about any policy or rule…' : 'Search for keywords across documents…') : 'Ask about TNEB policies, leave rules, safety guidelines…'}
                      disabled={isTyping}
                      style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: 'var(--text)', fontFamily: 'var(--font-body)' }}
                    />
                    <span style={{ fontSize: 10, color: 'var(--muted2)', fontFamily: 'var(--font-mono)', marginLeft: 8 }}>
                      {input.length}/1000
                    </span>
                  </div>
                  <button
                    onClick={() => sendQuery()}
                    disabled={isTyping || !input.trim()}
                    style={{
                      width: 44, height: 44, borderRadius: 12,
                      background: isTyping || !input.trim() ? 'var(--surface2)' : 'var(--cyan)',
                      border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: isTyping || !input.trim() ? 'var(--muted2)' : 'var(--navy)',
                      fontSize: 17, flexShrink: 0, transition: 'all 0.15s', cursor: 'pointer',
                      boxShadow: input.trim() ? '0 2px 10px rgba(0,51,102,0.2)' : 'none',
                    }}
                  >
                    <i className={isTyping ? 'ti ti-loader-2' : 'ti ti-send-2'}
                      style={isTyping ? { animation: 'spin 1s linear infinite' } : {}} />
                  </button>
                </div>

                <div style={{ marginTop: 8, fontSize: 10, color: 'var(--muted2)', display: 'flex', gap: 12, justifyContent: 'center' }}>
                  <span><kbd style={{ background: 'var(--surface2)', padding: '1px 5px', borderRadius: 3, border: '1px solid var(--border)' }}>Enter</kbd> to send</span>
                  {isAdmin && selectedDocIds.length > 0 && (
                    <span style={{ color: 'var(--cyan-dim)' }}>
                      <i className="ti ti-filter" style={{ fontSize: 10, marginRight: 3 }} />
                      Filtering {selectedDocIds.length} source{selectedDocIds.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>

              {/* Guidelines card */}
              <div style={{
                width: '100%', maxWidth: 620,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 12, padding: '18px 22px',
              }}>
                <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 12, fontSize: 13 }}>
                  <i className="ti ti-info-circle" style={{ marginRight: 8, color: 'var(--cyan)' }} />
                  TNEB Guidelines
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <div style={{ color: '#16a34a', fontWeight: 600, fontSize: 11, marginBottom: 8 }}>
                      <i className="ti ti-check" style={{ marginRight: 4 }} /> Do's
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, lineHeight: 1.8, color: 'var(--text2)' }}>
                      {TNEB_GUIDELINES.dos.slice(0, 5).map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                  </div>
                  <div>
                    <div style={{ color: '#dc2626', fontWeight: 600, fontSize: 11, marginBottom: 8 }}>
                      <i className="ti ti-x" style={{ marginRight: 4 }} /> Don'ts
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, lineHeight: 1.8, color: 'var(--text2)' }}>
                      {TNEB_GUIDELINES.donts.slice(0, 5).map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Source count hint */}
              {(docs.length + urls.length) > 0 && (
                <div style={{ marginTop: 12, padding: '7px 14px', background: 'rgba(0,48,135,0.05)', border: '1px solid rgba(0,48,135,0.12)', borderRadius: 8, textAlign: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    <i className="ti ti-database" style={{ marginRight: 4 }} />
                    {docs.length} document{docs.length !== 1 ? 's' : ''} · {urls.length} URL{urls.length !== 1 ? 's' : ''} available
                  </span>
                </div>
              )}
            </div>
          )}

          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} onShowSources={setActiveSources} />
          ))}

          {isTyping && <TypingIndicator />}
          <div ref={chatEndRef} />
        </div>

        {/* Input Zone — only shown after first message */}
        {!showWelcome && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--panel)', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            {MODES.map(m => (
              <button key={m.id} onClick={() => setMode(m.id)} style={{
                padding: '4px 12px', borderRadius: 16, fontSize: 11, fontWeight: 500,
                border: `1px solid ${mode === m.id ? 'rgba(0,200,255,0.3)' : 'transparent'}`,
                background: mode === m.id ? 'var(--cyan-glow)' : 'transparent',
                color: mode === m.id ? 'var(--cyan)' : 'var(--muted)',
                display: 'flex', alignItems: 'center', gap: 5,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <i className={`ti ${m.icon}`} style={{ fontSize: 12 }} />{m.label}
              </button>
            ))}
            {selectedDocIds.length > 0 && isAdmin && (
              <span style={{ fontSize: 10, color: 'var(--cyan-dim)', alignSelf: 'center', marginLeft: 6, fontFamily: 'var(--font-mono)' }}>
                <i className="ti ti-filter" style={{ fontSize: 10, marginRight: 3 }} />
                Filtering {selectedDocIds.length} source{selectedDocIds.length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {queryError && (
            <div style={{ marginBottom: 8, padding: '6px 10px', background: 'rgba(239,68,68,0.1)', borderRadius: 6, fontSize: 11, color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }}>
              <i className="ti ti-alert-circle" style={{ marginRight: 5 }} />{queryError}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{
              flex: 1, background: 'var(--surface)', border: '2px solid var(--border)',
              borderRadius: 9, display: 'flex', alignItems: 'center', padding: '9px 14px',
              transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--cyan)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,200,255,0.1)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}>
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={e => { e.currentTarget.parentElement.style.borderColor = 'var(--cyan)'; e.currentTarget.parentElement.style.boxShadow = '0 0 0 3px rgba(0,200,255,0.15)' }}
                onBlur={e => { e.currentTarget.parentElement.style.borderColor = 'var(--border)'; e.currentTarget.parentElement.style.boxShadow = 'none' }}
                placeholder={isAdmin ? (mode === 'qa' ? 'Ask about any policy or rule...' : 'Search for keywords across documents...') : 'Ask about TNEB policies...'}
                disabled={isTyping}
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font-body)',
                }}
              />
              <span style={{ fontSize: 10, color: 'var(--muted2)', fontFamily: 'var(--font-mono)', marginLeft: 8 }}>
                {input.length}/1000
              </span>
            </div>
            <button
              onClick={() => sendQuery()}
              disabled={isTyping || !input.trim()}
              style={{
                width: 40, height: 40, borderRadius: 9,
                background: isTyping || !input.trim() ? 'var(--surface2)' : 'var(--cyan)',
                border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: isTyping || !input.trim() ? 'var(--muted2)' : 'var(--navy)',
                fontSize: 16, flexShrink: 0, transition: 'all 0.15s', cursor: 'pointer',
              }}
            >
              <i className={isTyping ? 'ti ti-loader-2' : 'ti ti-send-2'}
                style={isTyping ? { animation: 'spin 1s linear infinite' } : {}} />
            </button>
          </div>
          <div style={{ marginTop: 7, fontSize: 10, color: 'var(--muted2)', display: 'flex', gap: 12 }}>
            <span><kbd style={{ background: 'var(--surface2)', padding: '1px 5px', borderRadius: 3, border: '1px solid var(--border)' }}>Enter</kbd> to send</span>
            {isAdmin && <span>Click a source in the sidebar to filter search scope</span>}
            {!isAdmin && <span>Ask me anything about TNEB policies</span>}
          </div>
        </div>
        )}
      </main>

      {activeSources && <SourcesPanel sources={activeSources} onClose={() => setActiveSources(null)} />}
      {showSummarize && <SummarizeModal docs={docs} onClose={() => setShowSummarize(false)} />}
      {showUpload && isAdmin && (
        <UploadModal
          onUpload={handleUpload}
          onAddUrl={async (url, label) => {
            const result = await addUrl(url, label)
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `🔗 URL indexed: **${result.label}** — ${result.chunk_count} chunks added to the knowledge base.`,
              id: Date.now(),
            }])
            return result
          }}
          onClose={() => {
            if (uploadSuccessCount > 0 || uploadFailedCount > 0) {
              handleUploadComplete(uploadSuccessCount, uploadFailedCount)
            } else {
              setShowUpload(false)
            }
          }}
          uploadProgress={uploadProgress}
          lastUploaded={lastUploaded}
        />
      )}

      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes typingBounce { 0%, 80%, 100% { transform: translateY(0) } 40% { transform: translateY(-6px) } }
        @keyframes slideInRight { from { opacity: 0; transform: translateX(100px); } to { opacity: 1; transform: translateX(0); } }
        .markdown-body p { margin-bottom: 8px; }
        .markdown-body p:last-child { margin-bottom: 0; }
        .markdown-body ul, .markdown-body ol { padding-left: 20px; margin-bottom: 8px; }
        .markdown-body li { margin-bottom: 3px; }
        .markdown-body strong { color: var(--cyan); font-weight: 600; }
        .markdown-body code { background: var(--surface2); border: 1px solid var(--border); padding: 1px 5px; border-radius: 3px; font-family: var(--font-mono); font-size: 12px; color: var(--cyan-dim); }
        .markdown-body h1, .markdown-body h2, .markdown-body h3 { color: var(--text); font-weight: 600; margin-bottom: 8px; margin-top: 12px; }
      `}</style>
    </div>
  )
}

function IconBtn({ icon, title, onClick }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 30, height: 30, borderRadius: 6, background: 'var(--surface2)',
      border: '1px solid var(--border)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', color: 'var(--muted)', fontSize: 14,
      transition: 'all 0.15s', cursor: 'pointer',
    }}
      onMouseEnter={e => { e.currentTarget.style.color = 'var(--cyan)'; e.currentTarget.style.borderColor = 'rgba(0,200,255,0.4)' }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}
    >
      <i className={`ti ${icon}`} />
    </button>
  )
}