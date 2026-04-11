import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import projectsRouter from './routes/projects';
import prdRouter from './routes/prd';
import progressRouter from './routes/progress';
import gitRouter from './routes/git';
import ralphRouter from './routes/ralph';
import brainstormRouter from './routes/brainstorm';
import { setupWsHandler } from './ws/wsHandler';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json());

app.use('/api/projects', projectsRouter);
app.use('/api/prd', prdRouter);
app.use('/api/progress', progressRouter);
app.use('/api/git', gitRouter);
app.use('/api/ralph', ralphRouter);
app.use('/api/brainstorm', brainstormRouter);

setupWsHandler(wss);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Ralph backend running on http://localhost:${PORT}`);
});
