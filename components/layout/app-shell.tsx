"use client";

import { AnalysisProvider } from "@/components/analysis/analysis-provider";
import { AnalysisStatusBar } from "@/components/analysis/analysis-status-bar";
import { Sidebar } from "./sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AnalysisProvider>
      <div className="flex min-h-screen bg-background">
        <div className="sticky top-0 h-screen shrink-0">
          <Sidebar />
        </div>
        <main className="relative min-w-0 flex-1 overflow-auto">
          <AnalysisStatusBar />
          <div className="mx-auto w-full max-w-7xl min-w-0 px-6 py-8 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </AnalysisProvider>
  );
}
