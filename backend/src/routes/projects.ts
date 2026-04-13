import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { exec } from 'child_process';
import {
  getCurrentProject,
  setCurrentProject,
  clearCurrentProject,
  getRecentProjects,
  removeRecentProject,
} from '../services/configService';

const router = Router();

async function isGitRepo(dirPath: string): Promise<boolean> {
  try {
    await fs.access(path.join(dirPath, '.git'));
    return true;
  } catch {
    return false;
  }
}

router.get('/current', async (_req: Request, res: Response) => {
  const project = await getCurrentProject();
  res.json({ project });
});

router.post('/current', async (req: Request, res: Response) => {
  const { path: projectPath } = req.body as { path: string };
  if (!projectPath) {
    res.status(400).json({ error: 'path is required' });
    return;
  }
  try {
    await fs.access(projectPath);
  } catch {
    res.status(400).json({ error: 'Path does not exist or is not accessible' });
    return;
  }
  if (!(await isGitRepo(projectPath))) {
    res.status(400).json({ error: 'NOT_GIT_REPO' });
    return;
  }
  await setCurrentProject(projectPath);
  res.json({ project: projectPath });
});

router.delete('/current', async (_req: Request, res: Response) => {
  await clearCurrentProject();
  res.json({ ok: true });
});

router.get('/recent', async (_req: Request, res: Response) => {
  const projects = await getRecentProjects();
  res.json({ projects });
});

router.delete('/recent', async (req: Request, res: Response) => {
  const { path: projectPath } = req.body as { path: string };
  if (!projectPath) {
    res.status(400).json({ error: 'path is required' });
    return;
  }
  await removeRecentProject(projectPath);
  res.json({ ok: true });
});

router.get('/drives', async (_req: Request, res: Response) => {
  if (process.platform !== 'win32') {
    res.json({ drives: ['/'] });
    return;
  }
  try {
    const drives = await new Promise<string[]>((resolve, reject) => {
      exec('wmic logicaldisk get name', (err, stdout) => {
        if (err) { reject(err); return; }
        const list = stdout
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => /^[A-Za-z]:$/.test(line))
          .map((d) => d + '\\');
        resolve(list.length > 0 ? list : ['C:\\']);
      });
    });
    res.json({ drives });
  } catch {
    res.json({ drives: ['C:\\'] });
  }
});

router.post('/browse', async (req: Request, res: Response) => {
  const { path: dirPath } = req.body as { path?: string };
  const targetPath = dirPath || os.homedir();

  try {
    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    const rawDirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => ({ name: e.name, path: path.join(targetPath, e.name) }));

    const [currentIsGitRepo, dirs] = await Promise.all([
      isGitRepo(targetPath),
      Promise.all(rawDirs.map(async (d) => ({ ...d, isGitRepo: await isGitRepo(d.path) }))),
    ]);

    res.json({ path: targetPath, isGitRepo: currentIsGitRepo, dirs });
  } catch {
    res.status(400).json({ error: 'Cannot read directory' });
  }
});

router.post('/mkdir', async (req: Request, res: Response) => {
  const { path: parentPath, name } = req.body as { path: string; name: string };
  if (!parentPath || !name) {
    res.status(400).json({ error: 'path and name are required' });
    return;
  }
  if (/[/\\<>:"|?*]/.test(name) || name === '.' || name === '..') {
    res.status(400).json({ error: 'Invalid directory name' });
    return;
  }
  const newPath = path.join(parentPath, name);
  try {
    await fs.mkdir(newPath);
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException).code;
    res.status(400).json({ error: code === 'EEXIST' ? '目录已存在' : '创建失败' });
    return;
  }
  await new Promise<void>((resolve, reject) => {
    exec('git init', { cwd: newPath }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  }).catch(() => {
    // git init failed — directory was created, proceed anyway
  });
  res.json({ path: newPath });
});

export default router;
