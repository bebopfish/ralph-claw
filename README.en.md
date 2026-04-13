# Ralph Claw

[中文](./README.md) | English

A more accessible [Ralph](https://github.com/snarktank/ralph) — a web-based AI autonomous coding loop tool.

Ralph repeatedly calls the Claude Code CLI to automatically implement each Story in your PRD (Product Requirements Document), one by one, until all are complete.

## Features

- **Brainstorm** — Chat with AI to break down requirements into Stories, then add them to your PRD in one click
- **Visual PRD Management** — Drag-and-drop kanban board to create, edit, and reorder Stories
- **One-click Start** — Launch Ralph's autonomous loop with a single button
- **Live Log Stream** — Real-time Claude output via WebSocket
- **Progress Tracking** — Story status updates in real time (pending → in-progress → completed / failed)
- **Progress Notes** — View and edit the `progress.txt` learning log
- **Git History** — Browse commits made automatically by Ralph
- **Cross-platform** — Supports macOS and Windows

## Prerequisites

- **Node.js 18+**
- **[Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code/overview)** installed and available as `claude` in your terminal
- **Git** — the target project must be a git repository

## Installation & Setup

```bash
# Clone the repo
git clone <repo-url>
cd ralph-claude

# Install all dependencies (frontend + backend in one step)
npm install

# Start the dev server (frontend + backend simultaneously)
npm run dev
```

Open **http://localhost:5173** in your browser.

## Usage

### 0. Brainstorm (optional)

Go to the **Brainstorm** page to discuss your requirements with AI:

1. Describe your product or feature (e.g. "I want to build a team task tool with assignment and progress tracking")
2. AI asks clarifying questions and helps you find the right Story granularity
3. Once you confirm the Story list, check the ones you want and click **"Add to PRD"**

### 1. Select a Project Directory

Click the **📁 Select Project** button in the top-right of the nav bar and choose the git repository you want to develop.

> Recently opened projects are remembered for quick switching.

### 2. Create a PRD

Go to the **PRD** page:

1. If the project has no `prd.json` yet, click "Create prd.json"
2. Click "+ Add Story" to fill in requirements
3. Drag to reorder execution priority

Each Story contains:

| Field | Description |
|-------|-------------|
| Title | A concise description of the feature to implement |
| Description | Detailed technical requirements and context |
| Acceptance Criteria | Clear completion conditions (one per line) |

> **Granularity tip**: Each Story should be completable within a single context window. For example, "Add user login API" rather than "Implement the entire auth system".

### 3. Start Ralph

Go to the **Dashboard** and click **▶ Start Ralph**.

Ralph runs the following loop for each pending Story:

```
1. Pick the first pending Story, mark it as in-progress
2. Build a prompt → call claude --dangerously-skip-permissions
3. Stream output to the UI in real time
4. Run quality checks (npm run typecheck && npm test)
5. On success, auto git commit and record the commit hash on the Story
6. Update progress.txt with accumulated project knowledge
7. Move to the next Story until all are complete
```

Use the "Max Stories" setting to limit how many Stories are processed per run.

### 4. Monitor Progress

| Page | Purpose |
|------|---------|
| Dashboard | Live logs + Story status counts |
| PRD | Completion status and commit hash per Story |
| Progress | Project constraints and patterns accumulated by Ralph |
| Git | All auto-committed change history |
| Brainstorm | Chat with AI to generate and import Stories |

## Project Structure

```
ralph-claude/
├── backend/                        # Node.js + Express + WebSocket
│   └── src/
│       ├── index.ts                # Server entry, port 3001
│       ├── services/
│       │   ├── ralphRunner.ts      # Core loop logic
│       │   ├── prdService.ts       # prd.json read/write
│       │   ├── progressService.ts  # progress.txt read/write
│       │   ├── gitService.ts       # git log / commit
│       │   └── configService.ts    # Recent projects config
│       └── routes/                 # REST API routes
└── frontend/                       # React + Vite
    └── src/
        ├── pages/                  # Five main pages (incl. Brainstorm)
        ├── components/             # UI components
        ├── store/appStore.ts       # Zustand global state
        ├── hooks/useWebSocket.ts   # WebSocket connection management
        └── api/                    # Axios API wrappers
```

## Ports

| Service | Port |
|---------|------|
| Frontend (Vite) | 5173 |
| Backend (Express + WebSocket) | 3001 |

## prd.json Format Reference

```json
{
  "project": "my-app",
  "version": "1.0.0",
  "created": "2026-01-01T00:00:00.000Z",
  "stories": [
    {
      "id": "story-001",
      "title": "Add user login API",
      "description": "Implement POST /auth/login, validate email/password, return JWT token",
      "acceptanceCriteria": [
        "POST /auth/login returns { token: string }",
        "Wrong password returns 401",
        "Unit tests cover main branches"
      ],
      "status": "pending",
      "priority": 1,
      "completedAt": null,
      "commitHash": null
    }
  ]
}
```

Story `status` values: `pending` | `in-progress` | `completed` | `failed`

## FAQ

**Q: Ralph starts but produces no output?**
Make sure the `claude` command works in your terminal and that the target project directory is a valid git repository.

**Q: Quality checks fail and Stories are marked as failed?**
The error is recorded in `progress.txt`. You can update the Story description, manually reset its status to `pending`, and restart Ralph.

**Q: How do I use this on Windows?**
Ralph Claude natively supports Windows — the backend automatically uses `claude.cmd` to launch the Claude Code CLI.

## Credits

- [Ralph](https://github.com/snarktank/ralph) — the original bash script implementation
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) — Anthropic's AI coding assistant
