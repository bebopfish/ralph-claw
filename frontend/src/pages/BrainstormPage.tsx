import { useState, useRef, useEffect } from 'react';
import { apiBrainstorm, ChatMessage, StoryDraft } from '../api/brainstorm';
import { apiPrd } from '../api/prd';
import { useAppStore } from '../store/appStore';

interface MessageWithStories extends ChatMessage {
  stories?: StoryDraft[];
}

const STORAGE_KEY = 'brainstorm-messages';

export default function BrainstormPage() {
  const [messages, setMessages] = useState<MessageWithStories[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? (JSON.parse(saved) as MessageWithStories[]) : [];
    } catch (_e) {
      return [];
    }
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedStories, setSelectedStories] = useState<Set<string>>(new Set());
  const [addingToPrd, setAddingToPrd] = useState(false);
  const [addResult, setAddResult] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const currentProject = useAppStore((s) => s.currentProject);
  const fetchPrd = useAppStore((s) => s.fetchPrd);

  // Persist messages to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Collect all suggested stories from assistant messages
  const allStories: { story: StoryDraft; key: string }[] = [];
  messages.forEach((msg, msgIdx) => {
    if (msg.stories) {
      msg.stories.forEach((story, storyIdx) => {
        allStories.push({ story, key: `${msgIdx}-${storyIdx}` });
      });
    }
  });

  // Latest set of stories (from the last assistant message that has stories)
  const latestStories: { story: StoryDraft; key: string }[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].stories && messages[i].stories!.length > 0) {
      messages[i].stories!.forEach((story, storyIdx) => {
        latestStories.push({ story, key: `${i}-${storyIdx}` });
      });
      break;
    }
  }

  const selectedCount = selectedStories.size;

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const newUserMsg: MessageWithStories = { role: 'user', content: text };
    const nextMessages = [...messages, newUserMsg];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    setAddResult(null);

    try {
      const apiMessages: ChatMessage[] = nextMessages.map(({ role, content }) => ({ role, content }));
      const result = await apiBrainstorm.chat(apiMessages);

      const assistantMsg: MessageWithStories = {
        role: 'assistant',
        content: result.content,
        stories: result.stories ?? undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (result.stories && result.stories.length > 0) {
        // Auto-select all new stories
        const newKeys = result.stories.map((_, idx) => `${nextMessages.length}-${idx}`);
        setSelectedStories((prev) => {
          const next = new Set(prev);
          newKeys.forEach((k) => next.add(k));
          return next;
        });
      }
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      const errMsg: MessageWithStories = {
        role: 'assistant',
        content: `❌ 出错了：${errorMsg}`,
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function toggleStory(key: string) {
    setSelectedStories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function addSelectedToPrd() {
    if (selectedCount === 0 || !currentProject) return;
    setAddingToPrd(true);
    setAddResult(null);

    const toAdd = allStories.filter(({ key }) => selectedStories.has(key));
    let addedCount = 0;
    const errors: string[] = [];

    for (const { story } of toAdd) {
      try {
        await apiPrd.addStory({
          title: story.title,
          description: story.description,
          acceptanceCriteria: story.acceptanceCriteria,
          priority: 0,
        });
        addedCount++;
      } catch (e) {
        errors.push(story.title);
      }
    }

    await fetchPrd();
    setAddingToPrd(false);
    setSelectedStories(new Set());

    if (errors.length === 0) {
      setAddResult(`✅ 已成功添加 ${addedCount} 个 Story 到 PRD`);
    } else {
      setAddResult(`✅ 添加了 ${addedCount} 个，❌ 失败 ${errors.length} 个：${errors.join('、')}`);
    }
  }

  // Strip <stories>...</stories> from displayed content
  function stripStoriesTag(content: string) {
    return content.replace(/<stories>[\s\S]*?<\/stories>/g, '').trim();
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 48px)',
        background: '#0a0a0a',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 24px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: '16px',
              fontWeight: 600,
              color: '#fff',
              letterSpacing: '-0.3px',
            }}
          >
            头脑风暴
          </h2>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: '12px',
              color: 'rgba(255,255,255,0.4)',
              letterSpacing: '-0.1px',
            }}
          >
            描述你的产品或功能，AI 帮你分解 Story，确认后一键添加到 PRD
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => {
              setMessages([]);
              setSelectedStories(new Set());
              setAddResult(null);
              localStorage.removeItem(STORAGE_KEY);
            }}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '6px',
              padding: '4px 10px',
              color: 'rgba(255,255,255,0.4)',
              fontSize: '11px',
              cursor: 'pointer',
              letterSpacing: '-0.1px',
              flexShrink: 0,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'rgba(255,255,255,0.4)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
            }}
          >
            清空对话
          </button>
        )}
      </div>

      {/* Messages area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              gap: '12px',
              color: 'rgba(255,255,255,0.3)',
            }}
          >
            <div style={{ fontSize: '32px' }}>💡</div>
            <div style={{ fontSize: '14px', textAlign: 'center', maxWidth: '320px', lineHeight: 1.6 }}>
              试试描述你想做的产品，例如：
              <br />
              <span style={{ color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>
                "我想做一个团队任务协作工具，支持任务分配和进度跟踪"
              </span>
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Message bubble */}
            <div
              style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <div
                style={{
                  maxWidth: '80%',
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: msg.role === 'user' ? '#1a6cf5' : 'rgba(255,255,255,0.07)',
                  border: msg.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  fontSize: '13px',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {msg.role === 'user' ? msg.content : stripStoriesTag(msg.content)}
              </div>
            </div>

            {/* Story cards (if AI returned stories in this message) */}
            {msg.stories && msg.stories.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginLeft: '0' }}>
                <div
                  style={{
                    fontSize: '11px',
                    color: 'rgba(255,255,255,0.4)',
                    letterSpacing: '-0.1px',
                    marginBottom: '2px',
                  }}
                >
                  AI 建议的 Story 列表（点击选择/取消）
                </div>
                {msg.stories.map((story, sIdx) => {
                  const key = `${idx}-${sIdx}`;
                  const isSelected = selectedStories.has(key);
                  return (
                    <div
                      key={key}
                      onClick={() => toggleStory(key)}
                      style={{
                        border: isSelected
                          ? '1px solid rgba(26,108,245,0.7)'
                          : '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '10px',
                        padding: '12px 14px',
                        background: isSelected ? 'rgba(26,108,245,0.12)' : 'rgba(255,255,255,0.04)',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        maxWidth: '640px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                        }}
                      >
                        {/* Checkbox */}
                        <div
                          style={{
                            width: '16px',
                            height: '16px',
                            borderRadius: '4px',
                            border: isSelected ? '2px solid #1a6cf5' : '2px solid rgba(255,255,255,0.25)',
                            background: isSelected ? '#1a6cf5' : 'transparent',
                            flexShrink: 0,
                            marginTop: '2px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.15s',
                          }}
                        >
                          {isSelected && (
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                              <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: '13px',
                              fontWeight: 600,
                              color: '#fff',
                              marginBottom: '4px',
                              letterSpacing: '-0.2px',
                            }}
                          >
                            {story.title}
                          </div>
                          <div
                            style={{
                              fontSize: '12px',
                              color: 'rgba(255,255,255,0.55)',
                              marginBottom: '8px',
                              lineHeight: 1.5,
                            }}
                          >
                            {story.description}
                          </div>
                          {story.acceptanceCriteria.length > 0 && (
                            <ul
                              style={{
                                margin: 0,
                                padding: '0 0 0 14px',
                                listStyle: 'disc',
                                color: 'rgba(255,255,255,0.4)',
                                fontSize: '11px',
                                lineHeight: 1.6,
                              }}
                            >
                              {story.acceptanceCriteria.map((ac, acIdx) => (
                                <li key={acIdx}>{ac}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '14px 14px 14px 4px',
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                gap: '4px',
                alignItems: 'center',
              }}
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.5)',
                    display: 'inline-block',
                    animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Add result feedback */}
      {addResult && (
        <div
          style={{
            padding: '10px 24px',
            background: 'rgba(48,209,88,0.08)',
            borderTop: '1px solid rgba(48,209,88,0.15)',
            fontSize: '13px',
            color: '#30d158',
            flexShrink: 0,
          }}
        >
          {addResult}
        </div>
      )}

      {/* Add to PRD bar (shown when stories are selected) */}
      {selectedCount > 0 && (
        <div
          style={{
            padding: '10px 24px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(26,108,245,0.08)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
            已选择 <strong style={{ color: '#fff' }}>{selectedCount}</strong> 个 Story
          </span>
          <button
            onClick={addSelectedToPrd}
            disabled={addingToPrd || !currentProject}
            style={{
              padding: '6px 16px',
              borderRadius: '7px',
              background: addingToPrd ? 'rgba(26,108,245,0.4)' : '#1a6cf5',
              border: 'none',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: addingToPrd || !currentProject ? 'not-allowed' : 'pointer',
              letterSpacing: '-0.1px',
              transition: 'opacity 0.15s',
            }}
            title={!currentProject ? '请先选择项目' : ''}
          >
            {addingToPrd ? '添加中...' : `添加到 PRD`}
          </button>
        </div>
      )}

      {/* Input area */}
      <div
        style={{
          padding: '12px 24px 16px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(0,0,0,0.3)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'flex-end',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '12px',
            padding: '8px 8px 8px 14px',
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="描述你的产品需求，或继续讨论... (Enter 发送，Shift+Enter 换行)"
            rows={1}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#fff',
              fontSize: '13px',
              fontFamily: 'inherit',
              resize: 'none',
              lineHeight: 1.5,
              maxHeight: '120px',
              overflowY: 'auto',
              padding: '2px 0',
            }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
            }}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background:
                loading || !input.trim() ? 'rgba(255,255,255,0.08)' : '#1a6cf5',
              border: 'none',
              color: '#fff',
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'background 0.15s',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M12.5 7L1.5 1.5L4.5 7L1.5 12.5L12.5 7Z" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
