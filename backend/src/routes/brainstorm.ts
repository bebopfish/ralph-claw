import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';

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
</stories>`;

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
  const claudeCmd = process.platform === 'win32' ? 'claude.cmd' : 'claude';

  try {
    const content = await new Promise<string>((resolve, reject) => {
      const proc = spawn(claudeCmd, ['--dangerously-skip-permissions', '-p', prompt], {
        shell: process.platform === 'win32',
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
    let stories = null;
    if (storiesMatch) {
      try {
        stories = JSON.parse(storiesMatch[1].trim());
      } catch (_e) {
        // ignore parse error
      }
    }

    res.json({ content, stories });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
