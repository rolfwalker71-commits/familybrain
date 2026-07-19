"use client";

import { usePathname } from "next/navigation";
import { AnalysisProvider } from "@/components/analysis/analysis-provider";
import { AnalysisStatusBar } from "@/components/analysis/analysis-status-bar";
import { MobileHeader } from "./mobile-header";
import { Sidebar } from "./sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <AnalysisProvider>
      <div className="min-h-dvh bg-background lg:flex">
        <div className="sticky top-0 hidden h-dvh shrink-0 lg:block">
          <Sidebar />
        </div>
        <main className="relative min-h-dvh min-w-0 flex-1 lg:h-dvh lg:overflow-y-auto">
          <MobileHeader />
          <AnalysisStatusBar />
          <div className="mx-auto w-full max-w-7xl min-w-0 px-4 py-5 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-7 lg:px-8 lg:py-8">
            {children}
          </div>
        </main>
      </div>
    </AnalysisProvider>
  );
}
