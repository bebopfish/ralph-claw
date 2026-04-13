import React, { useState } from 'react';
import { Story } from '../../types';

interface StoryInput {
  title: string;
  description: string;
  acceptanceCriteria: string[];
  priority: number;
  resetStatus?: boolean;
}

interface Props {
  initial?: Partial<Story>;
  onSave: (data: StoryInput) => Promise<void>;
  onCancel: () => void;
}

export default function StoryEditor({ initial, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [criteria, setCriteria] = useState<string[]>(
    initial?.acceptanceCriteria ?? ['']
  );
  const [priority, setPriority] = useState(initial?.priority ?? 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const needsReset = initial?.status === 'completed' || initial?.status === 'in-progress' || initial?.status === 'failed';
  const [resetStatus, setResetStatus] = useState(initial?.status === 'failed' ? true : needsReset);

  const addCriterion = () => setCriteria([...criteria, '']);
  const removeCriterion = (i: number) => setCriteria(criteria.filter((_, idx) => idx !== i));
  const updateCriterion = (i: number, value: string) => {
    setCriteria(criteria.map((c, idx) => (idx === i ? value : c)));
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError('标题不能为空');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        acceptanceCriteria: criteria.filter((c) => c.trim()),
        priority,
        resetStatus: needsReset ? resetStatus : undefined,
      });
    } catch {
      setError('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '14px', color: 'rgba(255,255,255,0.48)',
    letterSpacing: '-0.224px', marginBottom: '6px',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#000',
    border: '1px solid rgba(255,255,255,0.14)', borderRadius: '8px',
    padding: '8px 12px', color: '#fff',
    fontFamily: 'var(--font-text)', fontSize: '15px',
    letterSpacing: '-0.224px', lineHeight: 1.47,
    transition: 'border-color 0.15s',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <label style={labelStyle}>标题 *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="简洁描述要实现的功能"
          style={inputStyle}
          onFocus={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = '#0071e3'; (e.currentTarget as HTMLInputElement).style.outline = 'none'; }}
          onBlur={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.14)'; }}
        />
      </div>

      <div>
        <label style={labelStyle}>描述</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="详细描述实现要求、背景、技术要求等"
          rows={4}
          style={{ ...inputStyle, resize: 'none' }}
          onFocus={(e) => { (e.currentTarget as HTMLTextAreaElement).style.borderColor = '#0071e3'; (e.currentTarget as HTMLTextAreaElement).style.outline = 'none'; }}
          onBlur={(e) => { (e.currentTarget as HTMLTextAreaElement).style.borderColor = 'rgba(255,255,255,0.14)'; }}
        />
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>验收标准</label>
          <button
            onClick={addCriterion}
            style={{ background: 'none', border: 'none', color: '#2997ff', fontSize: '13px', cursor: 'pointer', letterSpacing: '-0.12px' }}
          >
            + 添加
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {criteria.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={c}
                onChange={(e) => updateCriterion(i, e.target.value)}
                placeholder={`验收标准 ${i + 1}`}
                style={{ ...inputStyle, fontSize: '14px' }}
                onFocus={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = '#0071e3'; (e.currentTarget as HTMLInputElement).style.outline = 'none'; }}
                onBlur={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.14)'; }}
              />
              {criteria.length > 1 && (
                <button
                  onClick={() => removeCriterion(i)}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.28)', cursor: 'pointer', fontSize: '18px', padding: '0 4px' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#ff453a'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.28)'; }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <label style={labelStyle}>优先级</label>
        <input
          type="number"
          min="1"
          value={priority}
          onChange={(e) => setPriority(parseInt(e.target.value, 10) || 1)}
          style={{ ...inputStyle, width: '80px' }}
          onFocus={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = '#0071e3'; (e.currentTarget as HTMLInputElement).style.outline = 'none'; }}
          onBlur={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.14)'; }}
        />
      </div>

      {error && <p style={{ color: '#ff453a', fontSize: '14px', letterSpacing: '-0.224px' }}>{error}</p>}

      {needsReset && (
        <label
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 12px',
            borderRadius: '8px',
            background: resetStatus ? 'rgba(255,159,10,0.08)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${resetStatus ? 'rgba(255,159,10,0.3)' : 'rgba(255,255,255,0.1)'}`,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <input
            type="checkbox"
            checked={resetStatus}
            onChange={(e) => setResetStatus(e.target.checked)}
            style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: '#ff9f0a' }}
          />
          <span style={{ fontSize: '13px', color: resetStatus ? '#ff9f0a' : 'rgba(255,255,255,0.4)', letterSpacing: '-0.12px' }}>
            {initial?.status === 'failed' ? '重置为待处理，让 Ralph 重新尝试' : '重置为待处理，让 Ralph 重新实现'}
          </span>
        </label>
      )}

      <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            flex: 1, padding: '8px 15px',
            background: saving ? 'rgba(0,113,227,0.4)' : '#0071e3',
            border: 'none', borderRadius: '8px',
            color: '#fff', fontSize: '15px', fontFamily: 'var(--font-text)',
            letterSpacing: '-0.224px', cursor: saving ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {saving ? '保存中...' : '保存'}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: '8px 15px',
            background: 'var(--apple-surface-2)',
            border: 'none', borderRadius: '8px',
            color: 'rgba(255,255,255,0.64)', fontSize: '15px', fontFamily: 'var(--font-text)',
            letterSpacing: '-0.224px', cursor: 'pointer',
            transition: 'background 0.15s',
          }}
        >
          取消
        </button>
      </div>
    </div>
  );
}
