import { Router, Request, Response } from 'express';
import {
  readPrd,
  writePrd,
  createPrd,
  addStory,
  updateStory,
  deleteStory,
  reorderStories,
} from '../services/prdService';
import { getCurrentProject } from '../services/configService';
import { Story } from '../types';

const router = Router();

async function getProject(res: Response): Promise<string | null> {
  const project = await getCurrentProject();
  if (!project) {
    res.status(400).json({ error: 'No project selected' });
    return null;
  }
  return project;
}

router.get('/', async (_req: Request, res: Response) => {
  const project = await getProject(res);
  if (!project) return;
  const prd = await readPrd(project);
  if (!prd) {
    res.status(404).json({ error: 'prd.json not found' });
    return;
  }
  res.json(prd);
});

router.post('/', async (req: Request, res: Response) => {
  const project = await getProject(res);
  if (!project) return;
  const { projectName } = req.body as { projectName?: string };
  const prd = await createPrd(project, projectName ?? 'my-project');
  res.json(prd);
});

router.put('/', async (req: Request, res: Response) => {
  const project = await getProject(res);
  if (!project) return;
  try {
    await writePrd(project, req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post('/stories', async (req: Request, res: Response) => {
  const project = await getProject(res);
  if (!project) return;
  try {
    // Auto-create prd.json if it doesn't exist yet (e.g. when importing from brainstorm)
    const existing = await readPrd(project);
    if (!existing) {
      const projectName = project.split(/[/\\]/).pop() ?? 'my-project';
      await createPrd(project, projectName);
    }
    const story = await addStory(project, req.body as Omit<Story, 'id' | 'status' | 'completedAt' | 'commitHash'>);
    res.json(story);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post('/stories/reorder', async (req: Request, res: Response) => {
  const project = await getProject(res);
  if (!project) return;
  const { orderedIds } = req.body as { orderedIds: string[] };
  try {
    await reorderStories(project, orderedIds);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.put('/stories/:id', async (req: Request, res: Response) => {
  const project = await getProject(res);
  if (!project) return;
  try {
    const story = await updateStory(project, req.params.id, req.body as Partial<Story>);
    res.json(story);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.delete('/stories/:id', async (req: Request, res: Response) => {
  const project = await getProject(res);
  if (!project) return;
  try {
    await deleteStory(project, req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
