import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import type { Agent, OpenCodeMessage } from '../../types';

interface OpenCodeChatPanelProps {
  agent: Agent;
  onClose: () => void;
}

interface Session {
  id: string;
  title?: string;
  createdAt?: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function isToday(dateStr: string): boolean {
  const date = new Date(dateStr);
  const today = new Date();
  return date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
}

interface CodeBlock {
  type: 'code' | 'text';
  content: string;
  language?: string;
}

function parseContent(content: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const regex = /```(\w+)?\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }
    blocks.push({
      type: 'code',
      language: match[1],
      content: match[2].trim(),
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    blocks.push({ type: 'text', content: content.slice(lastIndex) });
  }

  return blocks;
}

function MessageContent({ content }: { content: string }) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const blocks = parseContent(content);

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <>
      {blocks.map((block, index) => {
        if (block.type === 'code') {
          return (
            <div key={index} className="my-2 bg-gray-950 border border-gray-700 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-700">
                <span className="text-xs text-gray-500 font-mono">
                  {block.language || 'code'}
                </span>
                <button
                  onClick={() => handleCopy(block.content)}
                  className="p-1 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors cursor-pointer"
                  title="Copy code"
                >
                  {copiedCode === block.content ? (
                    <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              </div>
              <pre className="p-3 overflow-x-auto">
                <code className="font-mono text-xs text-gray-300">{block.content}</code>
              </pre>
            </div>
          );
        }
        return (
          <p key={index} className="whitespace-pre-wrap leading-relaxed">
            {block.content}
          </p>
        );
      })}
    </>
  );
}

export function OpenCodeChatPanel({ agent, onClose }: OpenCodeChatPanelProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(agent.sessionId);
  const [messages, setMessages] = useState<OpenCodeMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Fetch sessions on mount
  useEffect(() => {
    setSessionsLoading(true);
    api
      .listSessions(agent.id)
      .then((sess) => {
        setSessions(sess);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load sessions');
      })
      .finally(() => setSessionsLoading(false));
  }, [agent.id]);

  // Fetch messages when session changes
  useEffect(() => {
    if (!selectedSessionId) {
      setMessages([]);
      return;
    }

    const fetchMessages = async () => {
      setMessagesLoading(true);
      try {
        const msgs = await api.getSessionMessagesBySessionId(agent.id, selectedSessionId);
        setMessages(msgs);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load messages');
      } finally {
        setMessagesLoading(false);
      }
    };

    fetchMessages();
  }, [agent.id, selectedSessionId]);

  // Poll messages every 3 seconds
  useEffect(() => {
    if (!selectedSessionId) return;

    const interval = setInterval(() => {
      api
        .getSessionMessagesBySessionId(agent.id, selectedSessionId)
        .then((msgs) => {
          setMessages(msgs);
        })
        .catch(() => {
          // Silently fail on poll errors
        });
    }, 3000);

    return () => clearInterval(interval);
  }, [agent.id, selectedSessionId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleCreateSession = async () => {
    setLoading(true);
    setError(null);
    try {
      const newSession = await api.createSession(agent.id, `Session ${sessions.length + 1}`);
      setSessions((prev) => [
        ...prev,
        {
          id: newSession.id,
          title: `Session ${sessions.length + 1}`,
          createdAt: new Date().toISOString(),
        },
      ]);
      setSelectedSessionId(newSession.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedSessionId || !messageInput.trim()) return;

    setSending(true);
    setError(null);
    try {
      await api.sendSessionMessage(agent.id, selectedSessionId, messageInput.trim());
      setMessageInput('');
      // Refresh messages immediately
      const msgs = await api.getSessionMessagesBySessionId(agent.id, selectedSessionId);
      setMessages(msgs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-full max-w-2xl bg-gray-900 border-l border-gray-700 shadow-2xl z-50 overflow-hidden animate-slide-in-right flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-900 shrink-0">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-gray-100 truncate">{agent.name}</h1>
              <p className="text-xs text-gray-500 truncate">
                {agent.serverUrl} • {sessions.length} session{sessions.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors shrink-0 ml-4"
            aria-label="Close panel"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Session Selector */}
        <div className="px-6 py-3 border-b border-gray-700 bg-gray-800/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              {sessionsLoading ? (
                <div className="flex items-center gap-2 text-gray-500 text-sm">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500" />
                  Loading sessions...
                </div>
              ) : sessions.length === 0 ? (
                <p className="text-sm text-gray-500">No sessions yet</p>
              ) : (
                <select
                  value={selectedSessionId ?? ''}
                  onChange={(e) => setSelectedSessionId(e.target.value || null)}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select a session</option>
                  {sessions.map((sess) => (
                    <option key={sess.id} value={sess.id}>
                      {sess.title || `Session ${sess.id.slice(0, 8)}`}
                      {sess.createdAt ? ` • ${timeAgo(sess.createdAt)}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <button
              onClick={handleCreateSession}
              disabled={loading}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shrink-0"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Creating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  New Session
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="px-6 py-2 bg-red-900/20 border-b border-red-500/30 text-red-400 text-sm shrink-0">
            {error}
          </div>
        )}

        {/* Messages Area */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {!selectedSessionId ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <svg
                className="w-16 h-16 mb-4 opacity-50"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              <p className="text-lg font-medium">Select or create a session</p>
              <p className="text-sm mt-1">Choose a session to view messages</p>
            </div>
          ) : messagesLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex items-center gap-3 text-gray-400">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
                Loading messages...
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <svg
                className="w-16 h-16 mb-4 opacity-50"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                />
              </svg>
              <p className="text-lg font-medium">No messages yet</p>
              <p className="text-sm mt-1">Send a message to start the conversation</p>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`bg-gray-800/30 rounded-lg p-4 border-l-2 ${
                    msg.role === 'user' ? 'border-blue-500' : 'border-purple-500'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        msg.role === 'user'
                          ? 'bg-blue-500 text-white'
                          : 'bg-purple-500 text-white'
                      }`}
                    >
                      {msg.role === 'user' ? 'U' : 'A'}
                    </div>
                    <span className="text-sm font-medium text-gray-200">
                      {msg.role === 'user' ? 'You' : 'Assistant'}
                    </span>
                    <span className="text-xs text-gray-500">
                      {isToday(msg.createdAt) ? formatTime(msg.createdAt) : timeAgo(msg.createdAt)}
                    </span>
                  </div>
                  <div className="text-sm text-gray-300">
                    <MessageContent content={msg.content} />
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Message Input */}
        <div className="px-6 py-4 border-t border-gray-700 bg-gray-800/50 shrink-0">
          <div className="flex items-end gap-3">
            <textarea
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={selectedSessionId ? 'Type a message...' : 'Select a session first'}
              disabled={!selectedSessionId || sending}
              rows={2}
              className="flex-1 px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50 resize-none text-sm leading-relaxed"
            />
            <button
              onClick={handleSendMessage}
              disabled={!selectedSessionId || !messageInput.trim() || sending}
              className="px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors flex items-center gap-2 shrink-0"
            >
              {sending ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
              )}
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </div>
    </>
  );
}
