import { useEffect, useState } from 'react';
import { getClaimThread, submitAppeal, replyToAppeal } from '../api';
import { useAuth } from '../context/AuthContext';

export default function AppealThread({ claimId, decisionType }) {
  const { token, user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [showAppeal, setShowAppeal] = useState(false);

  useEffect(() => {
    if (!claimId) return;
    getClaimThread(claimId, token)
      .then(m => setMessages(m))
      .catch(() => {});
  }, [claimId, token]);

  const isEmployee = user?.role === 'employee';
  const isReviewer = user?.role === 'reviewer' || user?.role === 'admin';
  const hasAppealed = messages.some(m => m.sender_role === 'employee');
  const canAppeal = isEmployee && !hasAppealed && decisionType !== 'APPROVED';

  async function sendMessage() {
    if (!draft.trim() || !claimId) return;
    setSending(true); setError('');
    try {
      if (isEmployee) {
        await submitAppeal(claimId, draft.trim(), token);
      } else {
        await replyToAppeal(claimId, draft.trim(), token);
      }
      const updated = await getClaimThread(claimId, token);
      setMessages(updated);
      setDraft('');
      setShowAppeal(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  if (!canAppeal && messages.length === 0 && !isReviewer) return null;

  return (
    <div className="border-t border-gray-200 pt-4 space-y-3">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
        {messages.length > 0 ? 'Review Thread' : 'Request Manual Review'}
      </p>

      {/* Message thread */}
      {messages.length > 0 && (
        <div className="space-y-2">
          {messages.map(msg => {
            const isMe = msg.sender === user?.username;
            const isMember = msg.sender_role === 'employee';
            return (
              <div key={msg.id} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                  ${isMember ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                  {isMember ? '👤' : '🔍'}
                </div>
                <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm
                  ${isMe ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                  <p className={`text-xs mb-1 font-medium ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>
                    {isMember ? 'Member' : `${msg.sender} (${msg.sender_role})`}
                    {' · '}{new Date(msg.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                  </p>
                  <p className="leading-snug">{msg.message}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Employee appeal button + form */}
      {canAppeal && !showAppeal && (
        <button
          onClick={() => setShowAppeal(true)}
          className="w-full border-2 border-dashed border-blue-200 text-blue-600 hover:border-blue-400 hover:bg-blue-50 rounded-xl py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
          I disagree — Request manual review
        </button>
      )}

      {canAppeal && showAppeal && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-blue-800">Explain your situation to the reviewer</p>
          <p className="text-xs text-blue-600">Be specific — mention the doctor, diagnosis, and why this claim is valid. A reviewer will respond within 1–2 business days.</p>
          <textarea
            className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white resize-none"
            rows={3}
            placeholder="e.g. I visited Dr. Sharma on Nov 1st for viral fever. The ₹1,500 bill includes consultation and blood tests as prescribed. Please review this decision."
            value={draft}
            onChange={e => setDraft(e.target.value)}
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={sendMessage}
              disabled={sending || !draft.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium py-2 rounded-lg transition-colors"
            >
              {sending ? 'Sending…' : 'Send Review Request'}
            </button>
            <button onClick={() => { setShowAppeal(false); setDraft(''); }} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Employee already appealed — show status */}
      {isEmployee && hasAppealed && !messages.some(m => m.sender_role !== 'employee') && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700 flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          Review request sent. A reviewer will respond within 1–2 business days.
        </div>
      )}

      {/* Reviewer reply box */}
      {isReviewer && hasAppealed && (
        <div className="space-y-2">
          <textarea
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none"
            rows={2}
            placeholder="Reply to member's appeal…"
            value={draft}
            onChange={e => setDraft(e.target.value)}
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            onClick={sendMessage}
            disabled={sending || !draft.trim()}
            className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {sending ? 'Sending…' : 'Send Reply'}
          </button>
        </div>
      )}
    </div>
  );
}
