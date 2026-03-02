import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { useWebSocket } from './hooks/useWebSocket';
import { AgentsPage } from './pages/AgentsPage';
import { ApiTesterPage } from './pages/ApiTesterPage';
import { BoardPage } from './pages/BoardPage';
import { EventsPage } from './pages/EventsPage';
import { SettingsPage } from './pages/SettingsPage';
import { TaskDetailPage } from './pages/TaskDetailPage';

function AppContent() {
  useWebSocket();

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<BoardPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="events" element={<EventsPage />} />
        <Route path="tasks/:id" element={<TaskDetailPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="api-tester" element={<ApiTesterPage />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
