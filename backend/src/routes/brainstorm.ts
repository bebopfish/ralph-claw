import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import { tmpdir } from 'os';

const router = Router();

const SYSTEM_PROMPT = `你是一个经验丰富的敏捷开发顾问，擅长帮助团队将产品需求分解为可执行的 User Story。

你的工作方式：
1. 先充分理解用户描述的产品或功能需求
2. 通过提问帮助澄清需求细节、边界和优先级
3. 提出合理的 Story 分解方案，每个 Story 应该独立、可测试、有明确价值
4. 根据用户反馈不断调整完善 Story 列表
5. 当用户确认 Story 列表后，输出结构化的 JSON 数据

每个 Story 格式：
- title：简洁的标题（中文，15字以内）
- description：用用户故事格式描述（"作为[角色]，我想要[功能]，以便[价值]"）
- acceptanceCriteria：具体可验证的验收标准列表（3-5条）

当你准备好输出最终确认的 Story 列表时（用户确认后或你认为讨论已足够充分），在回复末尾用以下格式输出，除此之外不要在其他地方输出该格式：

<stories>
[
  {
    "title": "Story标题",
    "description": "作为用户，我想要...",
    "acceptanceCriteria": ["条件1", "条件2", "条件3"]
  }
]
</stories>

**严格的 JSON 格式要求**：
- 字符串值内部绝对不能出现英文双引号（"）
- 如需引用状态名称（如「待分配」「执行中」），请使用中文书名号「」，而非英文引号
- 不要在 JSON 字符串内用任何引号来强调词语`;

interface StoryDraft {
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

    stories.push({ title: titleM[1], description, acceptanceCriteria });
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

function buildPrompt(messages: { role: 'user' | 'assistant'; content: string }[]): string {
  const history = messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  return `${SYSTEM_PROMPT}

<conversation>
${history}
</conversation>

根据以上对话，继续以 Assistant 身份回复（只输出回复内容，不要重复对话历史）：`;
}

router.post('/chat', async (req: Request, res: Response) => {
  const { messages } = req.body as {
    messages: { role: 'user' | 'assistant'; content: string }[];
  };

  if (!messages || messages.length === 0) {
    res.status(400).json({ error: 'messages required' });
    return;
  }

  const prompt = buildPrompt(messages);

  try {
    const content = await new Promise<string>((resolve, reject) => {
      const proc = spawn('claude', ['--dangerously-skip-permissions', '-p', prompt], {
        cwd: tmpdir(),
        shell: false,
        env: process.env,
      });

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

    const storiesMatch = content.match(/<stories>([\s\S]*?)<\/stories>/);
    const stories = storiesMatch ? parseStories(storiesMatch[1].trim()) : null;

    res.json({ content, stories });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
