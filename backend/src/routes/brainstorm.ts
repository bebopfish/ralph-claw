import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { readProgress } from '../services/progressService';
import { readProjectContext, writeProjectContext } from '../services/projectContextService';

const router = Router();

const SYSTEM_PROMPT = `你是一个经验丰富的敏捷开发顾问，擅长帮助团队将产品需求分解为可执行的 User Story。

你的工作方式：
1. 先充分理解用户描述的产品或功能需求
2. 通过提问帮助澄清需求细节、边界和优先级
3. 提出合理的 Story 分解方案，每个 Story 应该独立、可测试、有明确价值
4. 根据用户反馈不断调整完善 Story 列表
5. 当用户确认 Story 列表后，输出结构化的 JSON 数据

每个 Story 格式：
- storyId：可选，仅在修改已有 Story 时填写，填写被修改 Story 的 id（如 "story-1234"）
- title：简洁的标题（中文，15字以内）
- description：用用户故事格式描述（"作为[角色]，我想要[功能]，以便[价值]"）
- acceptanceCriteria：具体可验证的验收标准列表（3-5条）

当你准备好输出最终确认的 Story 列表时（用户确认后或你认为讨论已足够充分），在回复末尾用以下格式输出，除此之外不要在其他地方输出该格式：

<stories>
[
  {
    "storyId": "story-1234",
    "title": "Story标题",
    "description": "作为用户，我想要...",
    "acceptanceCriteria": ["条件1", "条件2", "条件3"]
  }
]
</stories>

新增 Story 时省略 storyId 字段。修改已有 Story 时必须填写对应的 storyId。

**严格的 JSON 格式要求**：
- 字符串值内部绝对不能出现英文双引号（"）
- 如需引用状态名称（如「待分配」「执行中」），请使用中文书名号「」，而非英文引号
- 不要在 JSON 字符串内用任何引号来强调词语

**项目上下文（CLAUDE.md）生成规则**：
每当你输出 <stories> 时，如果你对项目的背景、目标和技术选型已有足够了解，同时在回复末尾附加输出以下格式的项目上下文（紧跟在 <stories> 后面）。该内容将保存为项目的 CLAUDE.md 文件，供后续 AI 编码 Agent（Ralph）自动读取：

<project_context>
# Project Context

## Overview
[项目概述：做什么、目标用户、核心价值。2-4句话]

## Tech Stack
[技术栈：编程语言、框架、数据库、主要依赖库。如果用户未提及则省略此节]

## Architecture
[架构说明：关键设计决策、模块划分、数据流。如果尚不清楚则省略此节]

## Notes for Ralph
[给自动编码 AI 的特殊说明：编码规范、目录结构偏好、需要注意的约束。如果没有特殊要求则省略此节]
</project_context>

注意：
- 只在输出 <stories> 时才输出 <project_context>，普通对话中不输出
- 内容要精炼准确，基于对话中用户实际提到的信息，不要凭空推测
- 如果信息不足，宁可省略某节，也不要写不确定的内容`;

interface ExistingStory {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  status: string;
}

interface StoryDraft {
  storyId?: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
}

/**
 * Lenient story extractor.
 * Finds each { } block, extracts title/description by position,
 * and extracts acceptance criteria line-by-line with greedy quote matching.
 * Handles the common case where Claude uses "xxx" inside JSON string values.
 */
function extractStoriesLenient(text: string): StoryDraft[] | null {
  const stories: StoryDraft[] = [];

  // Collect top-level { } blocks
  const blocks: string[] = [];
  let depth = 0, start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') { if (!depth) start = i; depth++; }
    else if (text[i] === '}') {
      depth--;
      if (!depth && start >= 0) { blocks.push(text.slice(start, i + 1)); start = -1; }
    }
  }

  for (const block of blocks) {
    // storyId: optional field
    const storyIdM = /"storyId"\s*:\s*"([^"]+)"/.exec(block);

    // Title: no inner quotes expected
    const titleM = /"title"\s*:\s*"([^"]+)"/.exec(block);
    if (!titleM) continue;

    // Description: extract everything from the opening " after "description":
    // up to the "acceptanceCriteria" key, then strip trailing quote/comma/whitespace
    let description = '';
    const descIdx = block.indexOf('"description"');
    const acIdx = block.indexOf('"acceptanceCriteria"');
    if (descIdx >= 0 && acIdx > descIdx) {
      const colonIdx = block.indexOf(':', descIdx);
      const openQ = block.indexOf('"', colonIdx + 1);
      if (openQ >= 0) {
        description = block.slice(openQ + 1, acIdx).trimEnd().replace(/[",\s]+$/, '');
      }
    }

    // Acceptance criteria: find the [ ] array, then per-line greedy extraction
    const acceptanceCriteria: string[] = [];
    if (acIdx >= 0) {
      const arrStart = block.indexOf('[', acIdx);
      let arrEnd = -1, d = 0;
      for (let i = arrStart; i < block.length; i++) {
        if (block[i] === '[') d++;
        else if (block[i] === ']') { d--; if (!d) { arrEnd = i; break; } }
      }
      if (arrStart >= 0 && arrEnd > arrStart) {
        for (const line of block.slice(arrStart + 1, arrEnd).split('\n')) {
          const t = line.trim();
          // Greedy: first " to last " — correctly handles "status"xxx"status" patterns
          const m = /^"(.*)"[,]?$/.exec(t);
          if (m && m[1]) acceptanceCriteria.push(m[1]);
        }
      }
    }

    stories.push({
      ...(storyIdM ? { storyId: storyIdM[1] } : {}),
      title: titleM[1],
      description,
      acceptanceCriteria,
    });
  }

  return stories.length > 0 ? stories : null;
}

function parseStories(jsonStr: string): StoryDraft[] | null {
  // Pass 1: direct parse
  try { return JSON.parse(jsonStr) as StoryDraft[]; } catch (_e1) { /* fall through */ }

  // Pass 2: fix common punctuation substitutions and trailing commas
  const fixed = jsonStr
    .replace(/，/g, ',').replace(/：/g, ':')
    .replace(/"/g, '"').replace(/"/g, '"')
    .replace(/'/g, "'").replace(/'/g, "'")
    .replace(/,(\s*[}\]])/g, '$1');
  try { return JSON.parse(fixed) as StoryDraft[]; } catch (_e2) { /* fall through */ }

  // Pass 3: lenient block extraction — handles unescaped inner quotes in strings
  return extractStoriesLenient(fixed);
}

function buildExistingStoriesContext(stories: ExistingStory[]): string {
  if (!stories || stories.length === 0) return '';

  const list = stories
    .map((s, i) => {
      const ac = s.acceptanceCriteria.map((c) => `    - ${c}`).join('\n');
      return `${i + 1}. [id: ${s.id}] [状态: ${s.status}] ${s.title}\n   ${s.description}\n   验收标准：\n${ac}`;
    })
    .join('\n\n');

  return `
<existing_prd>
当前 PRD 已有以下 ${stories.length} 个 Story，请在此基础上继续讨论。修改已有 Story 时，输出中必须包含对应的 storyId 字段：

${list}
</existing_prd>
`;
}

function buildPrompt(
  messages: { role: 'user' | 'assistant'; content: string }[],
  existingStories?: ExistingStory[],
  progressContent?: string,
  projectContext?: string,
): string {
  const history = messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  const existingCtx = existingStories && existingStories.length > 0
    ? buildExistingStoriesContext(existingStories)
    : '';

  const projectCtx = projectContext
    ? `\n<project_context_existing>\n以下是该项目已有的上下文文件（CLAUDE.md），请基于此进行讨论，并在输出 <stories> 时更新该内容（如有新发现）：\n\n${projectContext}\n</project_context_existing>\n`
    : '';

  const progressCtx = progressContent
    ? `\n<project_progress>\n以下是 Ralph 在该项目执行过程中积累的技术记录，反映了真实的实现情况、技术约束和架构决策，请在分解 Story 时参考：\n\n${progressContent}\n</project_progress>\n`
    : '';

  return `${SYSTEM_PROMPT}
${existingCtx}${projectCtx}${progressCtx}
<conversation>
${history}
</conversation>

根据以上对话，继续以 Assistant 身份回复（只输出回复内容，不要重复对话历史）：`;
}

router.post('/chat', async (req: Request, res: Response) => {
  const { messages, existingStories, projectPath } = req.body as {
    messages: { role: 'user' | 'assistant'; content: string }[];
    existingStories?: ExistingStory[];
    projectPath?: string;
  };

  if (!messages || messages.length === 0) {
    res.status(400).json({ error: 'messages required' });
    return;
  }

  const [progressContent, projectContext] = await Promise.all([
    projectPath ? readProgress(projectPath) : Promise.resolve(''),
    projectPath ? readProjectContext(projectPath) : Promise.resolve(null),
  ]);

  const prompt = buildPrompt(
    messages,
    existingStories,
    progressContent || undefined,
    projectContext || undefined,
  );

  try {
    const rawContent = await new Promise<string>((resolve, reject) => {
      // Pass prompt via stdin instead of -p arg to avoid Windows CMD 8191-char line length limit
      const proc = spawn('claude', ['--dangerously-skip-permissions', '-p'], {
        cwd: tmpdir(),
        shell: process.platform === 'win32',
        env: process.env,
      });
      proc.stdin?.write(prompt, 'utf-8');
      proc.stdin?.end();

      let stdout = '';
      let stderr = '';
      proc.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
      proc.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });
      proc.on('close', (code) => {
        if (code !== 0) reject(new Error(stderr || `claude exited with code ${code}`));
        else resolve(stdout.trim());
      });
      proc.on('error', reject);
    });

    // Extract and save project_context if present
    const projectContextMatch = rawContent.match(/<project_context>([\s\S]*?)<\/project_context>/);
    let projectContextSaved = false;
    if (projectContextMatch && projectPath) {
      const newContext = projectContextMatch[1].trim();
      await writeProjectContext(projectPath, newContext);
      projectContextSaved = true;
    }

    // Strip <project_context> block from content shown to user
    const content = rawContent.replace(/<project_context>[\s\S]*?<\/project_context>/g, '').trim();

    const storiesMatch = content.match(/<stories>([\s\S]*?)<\/stories>/);
    const stories = storiesMatch ? parseStories(storiesMatch[1].trim()) : null;

    res.json({ content, stories, projectContextSaved });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Get project context (CLAUDE.md)
router.get('/project-context', async (req: Request, res: Response) => {
  const { projectPath } = req.query as { projectPath?: string };
  if (!projectPath) {
    res.status(400).json({ error: 'projectPath required' });
    return;
  }
  const context = await readProjectContext(projectPath);
  res.json({ context });
});

export default router;
