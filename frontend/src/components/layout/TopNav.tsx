import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAppStore } from '../../store/appStore';
import ProjectPicker from '../project/ProjectPicker';

const navItems = [
  { to: '/dashboard', label: '仪表盘' },
  { to: '/brainstorm', label: '头脑风暴' },
  { to: '/prd', label: 'PRD' },
  { to: '/progress', label: '进度' },
  { to: '/git', label: 'Git' },
];

export default function TopNav() {
  const currentProject = useAppStore((s) => s.currentProject);
  const wsConnected = useAppStore((s) => s.wsConnected);
  const ralphRunning = useAppStore((s) => s.ralphRunning);
  const [showPicker, setShowPicker] = useState(false);

  const projectName = currentProject
    ? currentProject.split(/[/\\]/).pop() ?? currentProject
    : null;

  return (
    <>
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          height: '48px',
          background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'saturate(180%) blur(20px)',
          WebkitBackdropFilter: 'saturate(180%) blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          gap: '0',
        }}
      >
        {/* Left: wordmark */}
        <div style={{ flex: '0 0 auto', marginRight: 'auto' }}>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '17px',
              fontWeight: 600,
              color: '#fff',
              letterSpacing: '-0.28px',
            }}
          >
            Ralph Claude
          </span>
        </div>

        {/* Center: nav links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                padding: '4px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontFamily: 'var(--font-text)',
                fontWeight: 400,
                letterSpacing: '-0.12px',
                color: isActive ? '#fff' : 'rgba(255,255,255,0.64)',
                textDecoration: 'none',
                transition: 'color 0.15s, background 0.15s',
                background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </div>

        {/* Right: project + status */}
        <div
          style={{
            flex: '0 0 auto',
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          {ralphRunning && (
            <span
              style={{
                fontSize: '12px',
                color: 'rgba(255,255,255,0.64)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                letterSpacing: '-0.12px',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#ff9f0a',
                  display: 'inline-block',
                  animation: 'pulse 1.4s ease-in-out infinite',
                }}
              />
              运行中
            </span>
          )}

          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: wsConnected ? '#30d158' : '#ff453a',
              display: 'inline-block',
              flexShrink: 0,
            }}
            title={wsConnected ? '已连接' : '未连接'}
          />

          <button
            onClick={() => setShowPicker(true)}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: 'none',
              borderRadius: '6px',
              padding: '4px 10px',
              color: 'rgba(255,255,255,0.8)',
              fontSize: '12px',
              fontFamily: 'var(--font-text)',
              letterSpacing: '-0.12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              maxWidth: '160px',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.12)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
            }}
            title={currentProject ?? '选择项目'}
          >
            <span style={{ fontSize: '11px' }}>📁</span>
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {projectName ?? '选择项目'}
            </span>
          </button>
        </div>
      </nav>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      {showPicker && <ProjectPicker onClose={() => setShowPicker(false)} />}
    </>
  );
}
