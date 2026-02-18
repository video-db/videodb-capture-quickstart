import type { ReactNode } from 'react';
import type { View } from '../App';
import Sidebar from './Sidebar';

interface Props {
  currentView: View;
  onViewChange: (view: View) => void;
  children: ReactNode;
}

export default function Layout({ currentView, onViewChange, children }: Props) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <div className="titlebar-drag fixed top-0 left-0 right-0 h-8 z-50" />

      <Sidebar currentView={currentView} onViewChange={onViewChange} />

      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
