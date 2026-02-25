import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { BoardPage } from './pages/BoardPage';
import { AgentsPage } from './pages/AgentsPage';
import { EventsPage } from './pages/EventsPage';
import { TaskDetailPage } from './pages/TaskDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { useWebSocket } from './hooks/useWebSocket';

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
