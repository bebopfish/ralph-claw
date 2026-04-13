import { useState, useEffect, useRef } from 'react';
import { apiProjects } from '../../api/projects';
import { useAppStore } from '../../store/appStore';

interface Props {
  onClose: () => void;
}

export default function ProjectPicker({ onClose }: Props) {
  const [recent, setRecent] = useState<string[]>([]);
  const [browsePath, setBrowsePath] = useState('');
  const [pathInput, setPathInput] = useState('');
  const [browsePathIsGit, setBrowsePathIsGit] = useState(false);
  const [dirs, setDirs] = useState<{ name: string; path: string; isGitRepo: boolean }[]>([]);
  const [browseError, setBrowseError] = useState('');
  const [selectError, setSelectError] = useState('');
  const [loading, setLoading] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [mkdirError, setMkdirError] = useState('');
  const [drives, setDrives] = useState<string[]>([]);
  const [showDrives, setShowDrives] = useState(false);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  // True when browsePath is a drive root like "C:\" or Unix root "/"
  const isAtRoot = (p: string) => p === '/' || /^[A-Za-z]:\\?$/.test(p);

  const { setCurrentProject, fetchPrd } = useAppStore.getState();

  useEffect(() => {
    apiProjects.getRecent().then(({ projects }) => setRecent(projects));
    apiProjects.browse().then(({ path, isGitRepo, dirs }) => {
      setBrowsePath(path);
      setPathInput(path);
      setBrowsePathIsGit(isGitRepo);
      setDirs(dirs);
    }).catch(() => {
      setBrowseError('无法读取默认目录');
    });
    apiProjects.getDrives().then(({ drives: d }) => setDrives(d));
  }, []);

  useEffect(() => {
    if (creatingFolder) {
      setTimeout(() => newFolderInputRef.current?.focus(), 50);
    }
  }, [creatingFolder]);

  // Keep pathInput in sync when browsePath changes via clicking dirs
  useEffect(() => {
    setPathInput(browsePath);
  }, [browsePath]);

  const browse = async (path?: string) => {
    setBrowseError('');
    setShowDrives(false);
    try {
      const result = await apiProjects.browse(path);
      setBrowsePath(result.path);
      setBrowsePathIsGit(result.isGitRepo);
      setDirs(result.dirs);
    } catch {
      setBrowseError('无法访问该路径');
      setPathInput(browsePath); // reset on error
    }
  };

  const selectProject = async (path: string) => {
    setLoading(true);
    setSelectError('');
    try {
      await apiProjects.setCurrent(path);
      setCurrentProject(path);
      await fetchPrd();
      onClose();
    } catch (e: unknown) {
      const errCode = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setSelectError(errCode === 'NOT_GIT_REPO' ? '该目录不是 Git 仓库' : '无法访问该目录，请检查路径是否正确');
    } finally {
      setLoading(false);
    }
  };

  const handleMkdir = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    setMkdirError('');
    try {
      const { path: newPath } = await apiProjects.mkdir(browsePath, name);
      setCreatingFolder(false);
      setNewFolderName('');
      await browse(newPath);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setMkdirError(msg ?? '创建失败');
    }
  };

  const cancelMkdir = () => {
    setCreatingFolder(false);
    setNewFolderName('');
    setMkdirError('');
  };

  const labelStyle = {
    display: 'block', fontSize: '12px', color: 'rgba(255,255,255,0.4)',
    letterSpacing: '-0.12px', marginBottom: '6px',
  } as React.CSSProperties;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          background: '#1c1c1e',
          borderRadius: '12px',
          boxShadow: 'rgba(0,0,0,0.6) 0 24px 64px',
          width: '100%', maxWidth: '540px',
          maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-display)', fontSize: '17px', fontWeight: 600,
              color: '#fff', letterSpacing: '-0.28px',
            }}
          >
            选择项目目录
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.08)', border: 'none',
              borderRadius: '50%', width: '28px', height: '28px',
              cursor: 'pointer', color: 'rgba(255,255,255,0.56)',
              fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Recent projects */}
          {recent.length > 0 && (
            <div>
              <label style={labelStyle}>最近打开</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {recent.map((p) => (
                  <div
                    key={p}
                    style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
                    onMouseEnter={(e) => {
                      const btn = e.currentTarget.querySelector<HTMLButtonElement>('.delete-btn');
                      if (btn) btn.style.opacity = '1';
                      const main = e.currentTarget.querySelector<HTMLButtonElement>('.main-btn');
                      if (main) main.style.background = 'rgba(255,255,255,0.08)';
                    }}
                    onMouseLeave={(e) => {
                      const btn = e.currentTarget.querySelector<HTMLButtonElement>('.delete-btn');
                      if (btn) btn.style.opacity = '0';
                      const main = e.currentTarget.querySelector<HTMLButtonElement>('.main-btn');
                      if (main) main.style.background = 'rgba(255,255,255,0.04)';
                    }}
                  >
                    <button
                      className="main-btn"
                      onClick={() => selectProject(p)}
                      style={{
                        flex: 1, background: 'rgba(255,255,255,0.04)', border: 'none',
                        borderRadius: '8px', padding: '10px 36px 10px 12px',
                        color: 'rgba(255,255,255,0.8)', fontSize: '13px',
                        fontFamily: 'var(--font-text)', letterSpacing: '-0.12px',
                        textAlign: 'left', cursor: 'pointer',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        transition: 'background 0.15s',
                      }}
                      title={p}
                    >
                      📁 {p}
                    </button>
                    <button
                      className="delete-btn"
                      onClick={async (e) => {
                        e.stopPropagation();
                        await apiProjects.removeRecent(p);
                        setRecent((prev) => prev.filter((r) => r !== p));
                      }}
                      style={{
                        position: 'absolute', right: '8px',
                        background: 'none', border: 'none',
                        cursor: 'pointer', padding: '2px 4px',
                        color: 'rgba(255,255,255,0.4)', fontSize: '14px',
                        lineHeight: 1, opacity: 0,
                        transition: 'opacity 0.15s, color 0.15s',
                        borderRadius: '4px',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#ff453a'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.4)'; }}
                      title="删除记录"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Directory browser */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>浏览目录</label>
              {!creatingFolder && (
                <button
                  onClick={() => setCreatingFolder(true)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#2997ff', fontSize: '12px',
                    fontFamily: 'var(--font-text)', letterSpacing: '-0.12px',
                    padding: '0', display: 'flex', alignItems: 'center', gap: '4px',
                    transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.7'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
                >
                  + 新建文件夹
                </button>
              )}
            </div>

            {/* Inline new folder input */}
            {creatingFolder && (
              <div style={{ marginBottom: '8px' }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    ref={newFolderInputRef}
                    type="text"
                    value={newFolderName}
                    onChange={(e) => { setNewFolderName(e.target.value); setMkdirError(''); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleMkdir();
                      if (e.key === 'Escape') cancelMkdir();
                    }}
                    placeholder="新文件夹名称"
                    style={{
                      flex: 1, background: '#000',
                      border: '1px solid #0071e3', borderRadius: '8px',
                      padding: '7px 12px', color: '#fff',
                      fontFamily: 'var(--font-text)', fontSize: '13px', letterSpacing: '-0.12px',
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={handleMkdir}
                    disabled={!newFolderName.trim()}
                    style={{
                      padding: '7px 14px',
                      background: newFolderName.trim() ? '#0071e3' : 'rgba(0,113,227,0.3)',
                      border: 'none', borderRadius: '8px',
                      color: '#fff', fontSize: '13px', fontFamily: 'var(--font-text)',
                      cursor: newFolderName.trim() ? 'pointer' : 'not-allowed',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    创建
                  </button>
                  <button
                    onClick={cancelMkdir}
                    style={{
                      padding: '7px 12px',
                      background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '8px',
                      color: 'rgba(255,255,255,0.56)', fontSize: '13px', fontFamily: 'var(--font-text)',
                      cursor: 'pointer',
                    }}
                  >
                    取消
                  </button>
                </div>
                {mkdirError && (
                  <p style={{ color: '#ff453a', fontSize: '12px', marginTop: '5px', letterSpacing: '-0.12px' }}>
                    {mkdirError}
                  </p>
                )}
              </div>
            )}

            <div
              style={{
                background: '#000', borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.08)',
                maxHeight: '240px', overflowY: 'auto',
              }}
            >
              {/* Current path row — editable address bar */}
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '6px 8px',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <button
                  onClick={() => {
                    if (showDrives) return;
                    if (isAtRoot(browsePath) && drives.length > 1) {
                      setShowDrives(true);
                      return;
                    }
                    let parent = browsePath.replace(/[/\\][^/\\]+$/, '');
                    // Normalize bare drive letter "C:" → "C:\" so it's browsable
                    if (/^[A-Za-z]:$/.test(parent)) parent = parent + '\\';
                    if (parent && parent !== browsePath) browse(parent);
                  }}
                  style={{
                    background: 'none', border: 'none',
                    cursor: showDrives ? 'default' : 'pointer',
                    color: showDrives ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.4)',
                    fontSize: '14px', padding: '0 4px',
                    flexShrink: 0, transition: 'color 0.15s',
                  }}
                  onMouseEnter={(e) => { if (!showDrives) (e.currentTarget as HTMLButtonElement).style.color = '#fff'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = showDrives ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.4)'; }}
                  title={showDrives ? undefined : '上一级'}
                >
                  ←
                </button>
                {showDrives ? (
                  <span style={{
                    flex: 1, fontSize: '11px', color: 'rgba(255,255,255,0.4)',
                    letterSpacing: '-0.12px', fontFamily: 'monospace', padding: '4px 2px',
                  }}>
                    计算机
                  </span>
                ) : (
                  <input
                    type="text"
                    value={pathInput}
                    onChange={(e) => { setPathInput(e.target.value); setBrowseError(''); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') browse(pathInput);
                      if (e.key === 'Escape') setPathInput(browsePath);
                    }}
                    onBlur={() => setPathInput(browsePath)}
                    style={{
                      flex: 1, background: 'none', border: 'none', outline: 'none',
                      fontSize: '11px', color: 'rgba(255,255,255,0.5)',
                      letterSpacing: '-0.12px', fontFamily: 'monospace',
                      padding: '4px 2px', minWidth: 0,
                    }}
                    onFocus={(e) => {
                      (e.currentTarget as HTMLInputElement).style.color = '#fff';
                      (e.currentTarget as HTMLInputElement).select();
                    }}
                    title="输入路径后按 Enter 跳转"
                  />
                )}
                {!showDrives && (
                  <button
                    onClick={() => browsePathIsGit ? selectProject(browsePath) : undefined}
                    disabled={loading || !browsePathIsGit}
                    title={browsePathIsGit ? undefined : '非 Git 仓库'}
                    style={{
                      flexShrink: 0, padding: '3px 10px',
                      background: browsePathIsGit ? '#0071e3' : 'rgba(255,255,255,0.1)',
                      border: 'none', borderRadius: '980px', color: '#fff',
                      fontSize: '11px', fontFamily: 'var(--font-text)',
                      cursor: (loading || !browsePathIsGit) ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.5 : 1,
                      letterSpacing: '-0.12px',
                    }}
                  >
                    选择此目录
                  </button>
                )}
              </div>

              {browseError && (
                <p style={{ padding: '6px 12px', color: '#ff453a', fontSize: '11px', letterSpacing: '-0.12px' }}>
                  {browseError}
                </p>
              )}

              {showDrives ? (
                drives.map((drive) => (
                  <button
                    key={drive}
                    onClick={() => { setShowDrives(false); browse(drive); }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      background: 'none', border: 'none',
                      padding: '8px 12px', color: 'rgba(255,255,255,0.72)',
                      fontSize: '13px', fontFamily: 'var(--font-text)', letterSpacing: '-0.12px',
                      cursor: 'pointer', transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                  >
                    💾 {drive}
                  </button>
                ))
              ) : (
                <>
                  {dirs.map((d) => (
                    <div
                      key={d.path}
                      style={{ display: 'flex', alignItems: 'center' }}
                    >
                      <button
                        onClick={() => browse(d.path)}
                        style={{
                          flex: 1, textAlign: 'left', background: 'none', border: 'none',
                          padding: '8px 12px', color: 'rgba(255,255,255,0.72)',
                          fontSize: '13px', fontFamily: 'var(--font-text)', letterSpacing: '-0.12px',
                          cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                      >
                        📁 {d.name}
                        {d.isGitRepo && (
                          <span style={{
                            marginLeft: '6px', fontSize: '10px',
                            color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace',
                            verticalAlign: 'middle',
                          }}>git</span>
                        )}
                      </button>
                      <button
                        onClick={() => d.isGitRepo ? selectProject(d.path) : undefined}
                        disabled={!d.isGitRepo}
                        title={d.isGitRepo ? undefined : '非 Git 仓库'}
                        style={{
                          background: 'none', border: 'none', padding: '8px 12px',
                          color: d.isGitRepo ? '#2997ff' : 'rgba(255,255,255,0.2)',
                          fontSize: '12px', fontFamily: 'var(--font-text)',
                          letterSpacing: '-0.12px',
                          cursor: d.isGitRepo ? 'pointer' : 'not-allowed',
                          flexShrink: 0, transition: 'opacity 0.15s',
                        }}
                        onMouseEnter={(e) => { if (d.isGitRepo) (e.currentTarget as HTMLButtonElement).style.opacity = '0.7'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
                      >
                        选择
                      </button>
                    </div>
                  ))}
                  {dirs.length === 0 && !browseError && (
                    <p
                      style={{
                        padding: '10px 12px', fontSize: '12px',
                        color: 'rgba(255,255,255,0.24)', letterSpacing: '-0.12px',
                      }}
                    >
                      无子目录
                    </p>
                  )}
                </>
              )}
            </div>
            {selectError && (
              <p style={{ color: '#ff453a', fontSize: '12px', marginTop: '6px', letterSpacing: '-0.12px' }}>
                {selectError}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
