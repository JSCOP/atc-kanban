import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { ProjectRail } from './ProjectRail';

export function Layout() {
  return (
    <div className="min-h-screen bg-gray-950 flex">
      <ProjectRail />
      <div className="flex-1 flex flex-col ml-14">
        <Header />
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
