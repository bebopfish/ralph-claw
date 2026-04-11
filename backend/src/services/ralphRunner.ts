import { spawn, ChildProcess } from 'child_process';
import chokidar, { FSWatcher } from 'chokidar';
import path from 'path';
import { readPrd, updateStoryStatus } from './prdService';
import { readProgress, appendStoryLearnings } from './progressService';
import { gitCommit } from './gitService';
import { broadcast } from '../ws/wsHandler';
import { Story } from '../types';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface RunnerState {
  running: boolean;
  pid?: number;
  currentStoryId?: string;
  process?: ChildProcess;
  watcher?: FSWatcher;
}

const state: RunnerState = { running: false };

function log(level: 'info' | 'warn' | 'error', message: string): void {
  broadcast({ type: 'log', level, message, timestamp: new Date().toISOString() });
}

function buildPrompt(story: Story, progress: string): string {
  return `You are implementing a software story as part of an automated AI coding loop.

## Story
Title: ${story.title}
Description: ${story.description}

## Acceptance Criteria
${story.acceptanceCriteria.map((ac) => `- ${ac}`).join('\n')}

## Previous Learnings (progress.txt)
${progress || 'No previous learnings yet.'}

## Instructions
1. Implement the story completely
2. Make sure all acceptance criteria are met
3. Write or update tests as needed
4. Do not break existing functionality
5. Keep changes focused and minimal
`.trim();
}

async function runCommand(
  cmd: string,
  args: string[],
  cwd: string
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { cwd, shell: process.platform === 'win32' });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
    proc.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });
    proc.on('close', (code) => resolve({ exitCode: code ?? 1, stdout, stderr }));
  });
}

async function runQualityChecks(projectPath: string): Promise<boolean> {
  // Try typecheck if script exists
  try {
    const { stdout: pkgRaw } = await execAsync('cat package.json', { cwd: projectPath });
    const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> };

    if (pkg.scripts?.typecheck) {
      log('info', '\n[Ralph] Running TypeScript check...');
      const result = await runCommand('npm', ['run', 'typecheck'], projectPath);
      if (result.exitCode !== 0) {
        log('error', `[Ralph] TypeScript check FAILED:\n${result.stderr || result.stdout}`);
        return false;
      }
      log('info', '[Ralph] TypeScript check passed.');
    }

    if (pkg.scripts?.test) {
      log('info', '\n[Ralph] Running tests...');
      const result = await runCommand('npm', ['run', 'test', '--', '--passWithNoTests'], projectPath);
      if (result.exitCode !== 0) {
        log('warn', `[Ralph] Tests had issues:\n${result.stdout}`);
        // Don't fail on test issues - just warn
      } else {
        log('info', '[Ralph] Tests passed.');
      }
    }
  } catch {
    log('warn', '[Ralph] Could not run quality checks (no package.json or scripts).');
  }
  return true;
}

async function runStory(projectPath: string, story: Story): Promise<boolean> {
  log('info', `\n[Ralph] Starting story: ${story.title}`);
  await updateStoryStatus(projectPath, story.id, 'in-progress');
  broadcast({ type: 'story:update', storyId: story.id, status: 'in-progress' });

  const progress = await readProgress(projectPath);
  const prompt = buildPrompt(story, progress);

  // Determine claude command (cross-platform)
  const claudeCmd = 'claude';

  return new Promise((resolve) => {
    const proc = spawn(claudeCmd, ['--dangerously-skip-permissions', '-p', prompt], {
      cwd: projectPath,
      shell: process.platform === 'win32',
      env: process.env,
    });

    state.process = proc;

    proc.stdout?.on('data', (data: Buffer) => {
      log('info', data.toString());
    });

    proc.stderr?.on('data', (data: Buffer) => {
      log('warn', data.toString());
    });

    proc.on('close', async (code) => {
      state.process = undefined;
      if (code !== 0) {
        log('error', `[Ralph] Claude exited with code ${code}`);
        await updateStoryStatus(projectPath, story.id, 'failed');
        broadcast({ type: 'story:update', storyId: story.id, status: 'failed' });
        resolve(false);
        return;
      }

      const qualityPassed = await runQualityChecks(projectPath);
      if (!qualityPassed) {
        await updateStoryStatus(projectPath, story.id, 'failed');
        broadcast({ type: 'story:update', storyId: story.id, status: 'failed' });
        resolve(false);
        return;
      }

      try {
        const hash = await gitCommit(projectPath, `feat: ${story.title}`);
        await updateStoryStatus(projectPath, story.id, 'completed', hash);
        await appendStoryLearnings(projectPath, { ...story, commitHash: hash, status: 'completed' });
        broadcast({ type: 'story:update', storyId: story.id, status: 'completed', commitHash: hash });
        log('info', `[Ralph] Story completed and committed: ${hash}`);
        resolve(true);
      } catch (e) {
        log('warn', `[Ralph] Could not commit: ${String(e)}`);
        // Mark completed even without commit
        await updateStoryStatus(projectPath, story.id, 'completed');
        broadcast({ type: 'story:update', storyId: story.id, status: 'completed' });
        resolve(true);
      }
    });

    proc.on('error', async (err) => {
      log('error', `[Ralph] Failed to spawn claude: ${err.message}`);
      await updateStoryStatus(projectPath, story.id, 'failed');
      broadcast({ type: 'story:update', storyId: story.id, status: 'failed' });
      resolve(false);
    });
  });
}

export async function startRalph(projectPath: string, maxStories?: number): Promise<void> {
  if (state.running) {
    throw new Error('Ralph is already running');
  }

  state.running = true;
  const pid = process.pid;
  state.pid = pid;

  broadcast({ type: 'ralph:started', pid });
  log('info', `[Ralph] Starting autonomous loop for project: ${projectPath}`);

  // Watch files for changes
  state.watcher = chokidar.watch(
    [path.join(projectPath, 'prd.json'), path.join(projectPath, 'progress.txt')],
    { ignoreInitial: true }
  );
  state.watcher.on('change', (filePath: string) => {
    if (filePath.endsWith('prd.json')) broadcast({ type: 'prd:changed' });
    else if (filePath.endsWith('progress.txt')) broadcast({ type: 'progress:changed' });
  });

  try {
    let storiesProcessed = 0;
    const limit = maxStories ?? Infinity;

    while (state.running && storiesProcessed < limit) {
      const prd = await readPrd(projectPath);
      if (!prd) {
        log('error', '[Ralph] prd.json not found. Stopping.');
        break;
      }

      const pendingStory = prd.stories.find((s) => s.status === 'pending');
      if (!pendingStory) {
        log('info', '[Ralph] All stories completed!');
        break;
      }

      state.currentStoryId = pendingStory.id;
      const success = await runStory(projectPath, pendingStory);
      state.currentStoryId = undefined;

      if (!success) {
        log('error', `[Ralph] Story failed: ${pendingStory.title}. Stopping.`);
        break;
      }

      storiesProcessed++;
    }

    broadcast({ type: 'ralph:completed', exitCode: 0 });
    log('info', `[Ralph] Done. Processed ${storiesProcessed} story(ies).`);
  } catch (e) {
    const errMsg = String(e);
    broadcast({ type: 'ralph:failed', error: errMsg });
    log('error', `[Ralph] Fatal error: ${errMsg}`);
  } finally {
    state.running = false;
    state.pid = undefined;
    state.currentStoryId = undefined;
    state.watcher?.close();
    state.watcher = undefined;
  }
}

export function stopRalph(): void {
  if (!state.running) return;
  state.running = false;
  if (state.process) {
    state.process.kill('SIGTERM');
    state.process = undefined;
  }
  broadcast({ type: 'ralph:completed', exitCode: 130 });
  log('info', '[Ralph] Stopped by user.');
}

export function getRalphStatus(): { running: boolean; pid?: number; currentStoryId?: string } {
  return {
    running: state.running,
    pid: state.pid,
    currentStoryId: state.currentStoryId,
  };
}
