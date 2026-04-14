import { useState, useRef, useEffect } from 'react';
import { apiBrainstorm, ChatMessage, StoryDraft } from '../api/brainstorm';
import { apiPrd } from '../api/prd';
import { useAppStore } from '../store/appStore';
import { Story } from '../types';

const STORAGE_KEY_CONTEXT = 'brainstorm-has-project-context';

interface MessageWithStories extends ChatMessage {
  stories?: StoryDraft[];
  attachmentNames?: string[];
  displayText?: string;
}

interface Attachment {
  name: string;
  content: string;
}

const STORAGE_KEY_PREFIX = 'brainstorm-messages';
const STORAGE_KEY_ADDED = 'brainstorm-added-stories';

export default function BrainstormPage() {
  const [messages, setMessages] = useState<MessageWithStories[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedStories, setSelectedStories] = useState<Set<string>>(new Set());
  const [addedStories, setAddedStories] = useState<Set<string>>(new Set());
  const [addingToPrd, setAddingToPrd] = useState(false);
  const [addResult, setAddResult] = useState<string | null>(null);
  const [prdExpanded, setPrdExpanded] = useState(true);
  const [hasProjectContext, setHasProjectContext] = useState(false);
  const [contextJustSaved, setContextJustSaved] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isRestoringRef = useRef(false);
  const currentProject = useAppStore((s) => s.currentProject);
  const fetchPrd = useAppStore((s) => s.fetchPrd);
  const prd = useAppStore((s) => s.prd);
  const existingStories = prd?.stories ?? [];

  // Load messages and addedStories when project changes
  useEffect(() => {
    isRestoringRef.current = true;
    if (!currentProject) { setMessages([]); setAddedStories(new Set()); return; }
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}:${currentProject}`);
      setMessages(saved ? (JSON.parse(saved) as MessageWithStories[]) : []);
    } catch {
      setMessages([]);
    }
    try {
      const savedAdded = localStorage.getItem(`${STORAGE_KEY_ADDED}:${currentProject}`);
      setAddedStories(savedAdded ? new Set(JSON.parse(savedAdded) as string[]) : new Set());
    } catch {
      setAddedStories(new Set());
    }
  }, [currentProject]);

  // Persist messages to localStorage whenever they change
  // Skip the first write after restoring from storage to avoid overwriting with empty array
  useEffect(() => {
    if (isRestoringRef.current) {
      isRestoringRef.current = false;
      return;
    }
    if (!currentProject) return;
    localStorage.setItem(`${STORAGE_KEY_PREFIX}:${currentProject}`, JSON.stringify(messages));
  }, [messages, currentProject]);

  // Persist addedStories to localStorage whenever it changes
  useEffect(() => {
    if (!currentProject) return;
    localStorage.setItem(`${STORAGE_KEY_ADDED}:${currentProject}`, JSON.stringify([...addedStories]));
  }, [addedStories, currentProject]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Check if CLAUDE.md exists for current project
  useEffect(() => {
    if (!currentProject) { setHasProjectContext(false); return; }
    apiBrainstorm.getProjectContext(currentProject).then((ctx) => {
      setHasProjectContext(!!ctx);
    });
  }, [currentProject]);

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

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        setAttachments((prev) => [...prev, { name: file.name, content }]);
      };
      reader.readAsText(file, 'utf-8');
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeAttachment(idx: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  async function sendMessage() {
    const text = input.trim();
    if ((!text && attachments.length === 0) || loading) return;

    let fullContent = text;
    if (attachments.length > 0) {
      const attachmentSection = attachments
        .map((a) => `\n\n--- 附件: ${a.name} ---\n${a.content}\n--- 附件结束 ---`)
        .join('');
      fullContent = text + attachmentSection;
    }

    const newUserMsg: MessageWithStories = {
      role: 'user',
      content: fullContent,
      displayText: text,
      attachmentNames: attachments.length > 0 ? attachments.map((a) => a.name) : undefined,
    };
    const nextMessages = [...messages, newUserMsg];
    setMessages(nextMessages);
    setInput('');
    setAttachments([]);
    setLoading(true);
    setAddResult(null);

    try {
      const apiMessages: ChatMessage[] = nextMessages.map(({ role, content }) => ({ role, content }));
      const storiesToPass = existingStories.map((s: Story) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        acceptanceCriteria: s.acceptanceCriteria,
        status: s.status,
      }));
      const result = await apiBrainstorm.chat(apiMessages, storiesToPass.length > 0 ? storiesToPass : undefined, currentProject);

      const assistantMsg: MessageWithStories = {
        role: 'assistant',
        content: result.content,
        stories: result.stories ?? undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (result.projectContextSaved) {
        setHasProjectContext(true);
        setContextJustSaved(true);
        setTimeout(() => setContextJustSaved(false), 4000);
      }

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

    const toProcess = allStories.filter(({ key }) => selectedStories.has(key));
    let addedCount = 0;
    let updatedCount = 0;
    let resetCount = 0;
    const errors: string[] = [];
    const successKeys: string[] = [];

    for (const { story, key } of toProcess) {
      try {
        if (story.storyId) {
          const existing = existingStories.find((s: Story) => s.id === story.storyId);
          const shouldReset = existing?.status === 'completed' || existing?.status === 'in-progress';
          await apiPrd.updateStory(story.storyId, {
            title: story.title,
            description: story.description,
            acceptanceCriteria: story.acceptanceCriteria,
            ...(shouldReset ? {
              status: 'pending',
              completedAt: undefined,
              previousCommitHash: existing?.commitHash ?? undefined,
              commitHash: null,
            } : {}),
          });
          updatedCount++;
          if (shouldReset) resetCount++;
          successKeys.push(key);
        } else {
          await apiPrd.addStory({
            title: story.title,
            description: story.description,
            acceptanceCriteria: story.acceptanceCriteria,
            priority: 0,
          });
          addedCount++;
          successKeys.push(key);
        }
      } catch (e) {
        errors.push(story.title);
      }
    }

    await fetchPrd();
    setAddingToPrd(false);
    setSelectedStories(new Set());
    setAddedStories((prev) => {
      const next = new Set(prev);
      successKeys.forEach((k) => next.add(k));
      return next;
    });

    const parts: string[] = [];
    if (addedCount > 0) parts.push(`新增 ${addedCount} 个`);
    if (updatedCount > 0) parts.push(`更新 ${updatedCount} 个`);
    const resetNote = resetCount > 0 ? `，其中 ${resetCount} 个已重置为待处理` : '';
    if (errors.length === 0) {
      setAddResult(`✅ 已成功${parts.join('、')} Story${resetNote}`);
    } else {
      setAddResult(`✅ ${parts.join('、')}${resetNote}，❌ 失败 ${errors.length} 个：${errors.join('、')}`);
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
          <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontFamily: 'monospace',
                background: hasProjectContext ? 'rgba(48,209,88,0.1)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${hasProjectContext ? 'rgba(48,209,88,0.25)' : 'rgba(255,255,255,0.1)'}`,
                color: hasProjectContext ? '#30d158' : 'rgba(255,255,255,0.25)',
                transition: 'all 0.3s',
              }}
            >
              <span style={{ fontSize: '9px' }}>{hasProjectContext ? '●' : '○'}</span>
              CLAUDE.md
              {contextJustSaved && (
                <span style={{ color: '#30d158', fontFamily: 'var(--font-text)', fontStyle: 'normal' }}>
                  已生成
                </span>
              )}
            </span>
            {!hasProjectContext && (
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', letterSpacing: '-0.1px' }}>
                与 AI 对话后自动生成项目上下文
              </span>
            )}
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => {
              setMessages([]);
              setSelectedStories(new Set());
              setAddedStories(new Set());
              setAddResult(null);
              if (currentProject) {
                localStorage.removeItem(`${STORAGE_KEY_PREFIX}:${currentProject}`);
                localStorage.removeItem(`${STORAGE_KEY_ADDED}:${currentProject}`);
              }
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

      {/* Existing PRD stories panel */}
      {existingStories.length > 0 && (
        <div
          style={{
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.02)',
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => setPrdExpanded((v) => !v)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 24px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.5)',
              fontSize: '11px',
              letterSpacing: '-0.1px',
              textAlign: 'left',
            }}
          >
            <span style={{ transition: 'transform 0.2s', transform: prdExpanded ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>▶</span>
            当前 PRD（{existingStories.length} 个 Story）— 点击"讨论修改"可让 AI 帮你修改
          </button>
          {prdExpanded && (
            <div
              style={{
                padding: '0 24px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                maxHeight: '220px',
                overflowY: 'auto',
              }}
            >
              {existingStories.map((story: Story) => (
                <div
                  key={story.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.07)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>
                      {story.title}
                    </span>
                    <span
                      style={{
                        marginLeft: '8px',
                        fontSize: '10px',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: story.status === 'completed'
                          ? 'rgba(48,209,88,0.15)'
                          : story.status === 'in-progress'
                          ? 'rgba(255,159,10,0.15)'
                          : 'rgba(255,255,255,0.08)',
                        color: story.status === 'completed'
                          ? '#30d158'
                          : story.status === 'in-progress'
                          ? '#ff9f0a'
                          : 'rgba(255,255,255,0.4)',
                      }}
                    >
                      {story.status === 'completed' ? '已完成' : story.status === 'in-progress' ? '执行中' : '待处理'}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      const prompt = `我想修改这个已有的 Story「${story.title}」，它的描述是：${story.description}`;
                      setInput(prompt);
                      textareaRef.current?.focus();
                    }}
                    style={{
                      flexShrink: 0,
                      padding: '3px 10px',
                      borderRadius: '5px',
                      background: 'none',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: 'rgba(255,255,255,0.5)',
                      fontSize: '11px',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#fff';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                    }}
                  >
                    讨论修改
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                {msg.role === 'user' && msg.attachmentNames && msg.attachmentNames.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'flex-end' }}>
                    {msg.attachmentNames.map((name, i) => (
                      <span
                        key={i}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: 'rgba(26,108,245,0.25)',
                          border: '1px solid rgba(26,108,245,0.4)',
                          color: 'rgba(255,255,255,0.8)',
                          fontSize: '11px',
                        }}
                      >
                        <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                          <path d="M11.5 6.5L6 12a3.5 3.5 0 01-4.95-4.95l5.5-5.5a2 2 0 012.83 2.83L4.38 9.38a.5.5 0 01-.71-.71L8.5 3.84" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        {name}
                      </span>
                    ))}
                  </div>
                )}
                <div
                  style={{
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
                  {msg.role === 'user' ? (msg.displayText ?? msg.content) : stripStoriesTag(msg.content)}
                </div>
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
                  AI 建议的 Story 列表（点击选择/取消，蓝色为新增，橙色为修改已有）
                </div>
                {msg.stories.map((story, sIdx) => {
                  const key = `${idx}-${sIdx}`;
                  const isSelected = selectedStories.has(key);
                  const isAdded = addedStories.has(key);
                  return (
                    <div
                      key={key}
                      onClick={() => !isAdded && toggleStory(key)}
                      style={{
                        border: isAdded
                          ? '1px solid rgba(48,209,88,0.4)'
                          : isSelected
                          ? story.storyId ? '1px solid rgba(255,159,10,0.7)' : '1px solid rgba(26,108,245,0.7)'
                          : '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '10px',
                        padding: '12px 14px',
                        background: isAdded
                          ? 'rgba(48,209,88,0.06)'
                          : isSelected
                          ? story.storyId ? 'rgba(255,159,10,0.08)' : 'rgba(26,108,245,0.12)'
                          : 'rgba(255,255,255,0.04)',
                        cursor: isAdded ? 'default' : 'pointer',
                        opacity: isAdded ? 0.65 : 1,
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
                            border: isAdded ? '2px solid #30d158' : isSelected ? '2px solid #1a6cf5' : '2px solid rgba(255,255,255,0.25)',
                            background: isAdded ? '#30d158' : isSelected ? '#1a6cf5' : 'transparent',
                            flexShrink: 0,
                            marginTop: '2px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.15s',
                          }}
                        >
                          {(isSelected || isAdded) && (
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
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                          >
                            {story.title}
                            {isAdded && (
                              <span style={{
                                fontSize: '10px',
                                fontWeight: 500,
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: 'rgba(48,209,88,0.18)',
                                color: '#30d158',
                                letterSpacing: 0,
                              }}>
                                已添加
                              </span>
                            )}
                            {!isAdded && story.storyId && (
                              <span style={{
                                fontSize: '10px',
                                fontWeight: 500,
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: 'rgba(255,159,10,0.18)',
                                color: '#ff9f0a',
                                letterSpacing: 0,
                              }}>
                                修改已有
                              </span>
                            )}
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
            {allStories.filter(({ key }) => selectedStories.has(key)).some(({ story }) => story.storyId) && (
              <span style={{ marginLeft: '6px', color: '#ff9f0a' }}>（含修改项）</span>
            )}
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
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.md,.markdown,.json,.yaml,.yml,.xml,.csv,.ts,.tsx,.js,.jsx,.py,.java,.go,.rs,.html,.css,.sh,.bash,.toml,.ini,.conf,.log"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '12px',
            overflow: 'hidden',
          }}
        >
          {/* Attachment chips */}
          {attachments.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px',
                padding: '8px 12px 6px',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              {attachments.map((a, i) => (
                <span
                  key={i}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '3px 8px 3px 6px',
                    borderRadius: '6px',
                    background: 'rgba(26,108,245,0.15)',
                    border: '1px solid rgba(26,108,245,0.35)',
                    color: 'rgba(255,255,255,0.75)',
                    fontSize: '11px',
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                    <path d="M11.5 6.5L6 12a3.5 3.5 0 01-4.95-4.95l5.5-5.5a2 2 0 012.83 2.83L4.38 9.38a.5.5 0 01-.71-.71L8.5 3.84" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {a.name}
                  <button
                    onClick={() => removeAttachment(i)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '0',
                      cursor: 'pointer',
                      color: 'rgba(255,255,255,0.4)',
                      display: 'flex',
                      alignItems: 'center',
                      lineHeight: 1,
                      fontSize: '13px',
                    }}
                    title="移除"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          {/* Textarea row */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              alignItems: 'flex-end',
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
            {/* Paperclip button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              title="添加附件"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: attachments.length > 0 ? 'rgba(26,108,245,0.2)' : 'transparent',
                border: 'none',
                color: attachments.length > 0 ? '#1a6cf5' : 'rgba(255,255,255,0.35)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#fff';
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = attachments.length > 0 ? '#1a6cf5' : 'rgba(255,255,255,0.35)';
                e.currentTarget.style.background = attachments.length > 0 ? 'rgba(26,108,245,0.2)' : 'transparent';
              }}
            >
              <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
                <path d="M11.5 6.5L6 12a3.5 3.5 0 01-4.95-4.95l5.5-5.5a2 2 0 012.83 2.83L4.38 9.38a.5.5 0 01-.71-.71L8.5 3.84" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {/* Send button */}
            <button
              onClick={sendMessage}
              disabled={loading || (!input.trim() && attachments.length === 0)}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background:
                  loading || (!input.trim() && attachments.length === 0) ? 'rgba(255,255,255,0.08)' : '#1a6cf5',
                border: 'none',
                color: '#fff',
                cursor: loading || (!input.trim() && attachments.length === 0) ? 'not-allowed' : 'pointer',
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
