import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import AppLayout from './components/layout/AppLayout';
import DashboardPage from './pages/DashboardPage';
import PrdPage from './pages/PrdPage';
import ProgressPage from './pages/ProgressPage';
import GitPage from './pages/GitPage';
import BrainstormPage from './pages/BrainstormPage';
import { useWebSocket } from './hooks/useWebSocket';
import { useAppStore } from './store/appStore';
import { apiProjects } from './api/projects';

function AppInner() {
  useWebSocket();
  const setCurrentProject = useAppStore((s) => s.setCurrentProject);
  const fetchPrd = useAppStore((s) => s.fetchPrd);

  useEffect(() => {
    apiProjects.getCurrent().then(({ project }) => {
      if (project) {
        setCurrentProject(project);
        fetchPrd();
      }
    });
  }, []);

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/prd" element={<PrdPage />} />
        <Route path="/progress" element={<ProgressPage />} />
        <Route path="/git" element={<GitPage />} />
        <Route path="/brainstorm" element={<BrainstormPage />} />
      </Routes>
    </AppLayout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}
