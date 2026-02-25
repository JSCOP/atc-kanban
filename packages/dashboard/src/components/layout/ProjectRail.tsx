import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useProjectStore } from '../../stores/project-store';
import type { Project } from '../../types';
import { CreateProjectModal } from '../projects/CreateProjectModal';

function getProjectColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 60%, 45%)`;
}

function BoardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
      />
    </svg>
  );
}

function AgentsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
      />
    </svg>
  );
}

function EventsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

const navItems = [
  { path: '/', label: 'Board', icon: BoardIcon },
  { path: '/agents', label: 'Agents', icon: AgentsIcon },
  { path: '/events', label: 'Events', icon: EventsIcon },
  { path: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function ProjectRail() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { projects, selectedProjectId, selectProject, fetchProjects } = useProjectStore();

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return (
    <>
      <aside className="fixed left-0 top-0 h-full w-14 bg-gray-900 border-r border-gray-800 flex flex-col items-center py-3 z-50">
        {/* Logo */}
        <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        </div>

        {/* Separator */}
        <div className="w-6 h-px bg-gray-700 my-2" />

        {/* Nav icons */}
        <nav className="flex flex-col items-center gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `group relative w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                  isActive
                    ? 'bg-blue-500/10 text-blue-400'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              {/* Tooltip */}
              <span className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-gray-200 text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                {item.label}
              </span>
            </NavLink>
          ))}
        </nav>

        {/* Separator */}
        <div className="w-6 h-px bg-gray-700 my-2" />

        {/* Projects */}
        <div className="flex flex-col items-center gap-2">
          {projects.map((project: Project) => {
            const isSelected = project.id === selectedProjectId;
            return (
              <button
                key={project.id}
                onClick={() => selectProject(project.id)}
                className={`group relative w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white transition-all ${
                  isSelected ? 'ring-2 ring-blue-500' : 'ring-1 ring-gray-700 hover:ring-gray-500'
                }`}
                style={{ backgroundColor: getProjectColor(project.name) }}
              >
                {/* Left accent bar for selected project */}
                {isSelected && (
                  <span className="absolute -left-1.5 w-[3px] h-8 bg-blue-500 rounded-r" />
                )}
                {project.name.slice(0, 2).toUpperCase()}
                {/* Tooltip */}
                <span className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-gray-200 text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                  {project.name}
                </span>
              </button>
            );
          })}

          {/* Add project button */}
          <button
            onClick={() => setIsModalOpen(true)}
            className="group relative w-9 h-9 rounded-full flex items-center justify-center border-2 border-dashed border-gray-600 hover:border-gray-400 text-gray-500 hover:text-gray-300 transition-colors"
          >
            <PlusIcon className="w-5 h-5" />
            {/* Tooltip */}
            <span className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-gray-200 text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
              New Project
            </span>
          </button>
        </div>

        {/* Flex spacer */}
        <div className="flex-1" />

        {/* User avatar */}
        <div className="group relative w-9 h-9 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-sm font-bold text-white">
          A{/* Tooltip */}
          <span className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-gray-200 text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
            Admin
          </span>
        </div>
      </aside>

      <CreateProjectModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
