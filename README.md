# Ralph Claude

更易使用的 [Ralph](https://github.com/snarktank/ralph) —— 基于 Web UI 的 AI 自动编程循环工具。

Ralph 通过反复调用 Claude Code CLI，自动逐条实现 PRD（产品需求文档）中的 Story，直到全部完成。

## 功能特性

- **可视化 PRD 管理** — 拖拽看板创建、编辑、排序 Story
- **一键启动** — 点击按钮启动 Ralph 自动循环
- **实时日志流** — WebSocket 实时展示 Claude 运行输出
- **进度追踪** — Story 状态实时更新（待处理 → 进行中 → 已完成 / 失败）
- **进度记录** — 查看和编辑 `progress.txt` 学习记录
- **Git 历史** — 查看 Ralph 自动提交的代码变更
- **跨平台** — 支持 macOS 和 Windows

## 前置要求

- **Node.js 18+**
- **[Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code/overview)** 已安装，`claude` 命令可在终端使用
- **Git** — 目标项目必须是 git 仓库

## 安装与启动

```bash
# 克隆仓库
git clone <repo-url>
cd ralph-claude

# 安装所有依赖（前后端一次性安装）
npm install

# 启动开发服务器（前后端同时启动）
npm run dev
```

浏览器打开 **http://localhost:5173**

## 使用方法

### 1. 选择项目目录

点击顶部导航栏右侧的 **📁 选择项目** 按钮，在文件浏览器中选择你要开发的 git 仓库目录。

> 最近打开的项目会被记住，下次可快速切换。

### 2. 创建 PRD

进入 **PRD 管理** 页面：

1. 若项目尚无 `prd.json`，点击"创建 prd.json"
2. 点击"+ 添加 Story"填写需求
3. 可拖拽调整执行顺序

每个 Story 包含：

| 字段 | 说明 |
|------|------|
| 标题 | 简洁描述要实现的功能 |
| 描述 | 详细的技术要求、背景 |
| 验收标准 | 明确的完成条件（每条一行） |

> **粒度建议**：每个 Story 应能在一个上下文窗口内完成。例如"添加用户登录 API"，而不是"实现整个用户系统"。

### 3. 启动 Ralph

进入 **仪表盘** 页面，点击 **▶ 启动 Ralph**。

Ralph 对每个待处理 Story 执行以下循环：

```
1. 选取第一个 pending Story，标记为 in-progress
2. 构建 prompt → 调用 claude --dangerously-skip-permissions
3. 流式输出日志到界面
4. 运行质量检查（npm run typecheck && npm test）
5. 通过后自动 git commit，记录 commit hash 到 Story
6. 更新 progress.txt（积累项目知识）
7. 继续下一个 Story，直到全部完成
```

可通过"最多执行 Story 数"限制本次运行数量。

### 4. 监控进度

| 页面 | 用途 |
|------|------|
| 仪表盘 | 实时日志 + Story 状态统计 |
| PRD 管理 | 各 Story 完成状态和 commit hash |
| 进度记录 | Ralph 积累的项目约束和模式 |
| Git 历史 | 所有自动提交记录 |

## 项目结构

```
ralph-claude/
├── backend/                        # Node.js + Express + WebSocket
│   └── src/
│       ├── index.ts                # 服务入口，端口 3001
│       ├── services/
│       │   ├── ralphRunner.ts      # 核心循环逻辑
│       │   ├── prdService.ts       # prd.json 读写
│       │   ├── progressService.ts  # progress.txt 读写
│       │   ├── gitService.ts       # git log / commit
│       │   └── configService.ts   # 最近项目记录
│       └── routes/                 # REST API 路由
└── frontend/                       # React + Vite
    └── src/
        ├── pages/                  # 四个主页面
        ├── components/             # UI 组件
        ├── store/appStore.ts       # Zustand 全局状态
        ├── hooks/useWebSocket.ts   # WS 连接管理
        └── api/                    # axios API 封装
```

## 端口

| 服务 | 端口 |
|------|------|
| 前端（Vite） | 5173 |
| 后端（Express + WebSocket） | 3001 |

## prd.json 格式参考

```json
{
  "project": "my-app",
  "version": "1.0.0",
  "created": "2026-01-01T00:00:00.000Z",
  "stories": [
    {
      "id": "story-001",
      "title": "添加用户登录 API",
      "description": "实现 POST /auth/login 接口，验证邮箱密码，返回 JWT token",
      "acceptanceCriteria": [
        "POST /auth/login 返回 { token: string }",
        "密码错误返回 401",
        "单元测试覆盖主要分支"
      ],
      "status": "pending",
      "priority": 1,
      "completedAt": null,
      "commitHash": null
    }
  ]
}
```

Story `status` 可选值：`pending` | `in-progress` | `completed` | `failed`

## 常见问题

**Q: Ralph 启动后没有输出？**
确认 `claude` 命令在终端可以正常使用，且目标项目目录是有效的 git 仓库。

**Q: 质量检查失败导致 Story 标记为 failed？**
`progress.txt` 中会记录错误信息。你可以修改 Story 描述后手动将状态重置为 `pending`，然后重新启动。

**Q: 如何在 Windows 上使用？**
Ralph Claude 原生支持 Windows，后端会自动使用 `claude.cmd` 启动 Claude Code CLI。

## 致谢

- [Ralph](https://github.com/snarktank/ralph) — 原始 bash 脚本实现
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) — Anthropic 的 AI 编程助手
