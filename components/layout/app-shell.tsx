"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { AnalysisProvider } from "@/components/analysis/analysis-provider";
import { AnalysisStatusBar } from "@/components/analysis/analysis-status-bar";
import { TriageMassPauseBanner } from "@/components/analysis/triage-mass-pause-banner";
import { AuthProvider, useAuth } from "@/components/auth/auth-provider";
import { AdminNavProvider } from "@/components/layout/admin-nav-provider";
import { RealtimeToasts } from "@/components/realtime/realtime-toasts";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { CloseoutAssistant } from "@/components/closeout/closeout-assistant";
import { BuddyScene } from "./buddy-scene";
import { MobileHeader } from "./mobile-header";
import { Sidebar } from "./sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AnalysisProvider>
        <AdminNavProvider>
          <AppShellInner>{children}</AppShellInner>
        </AdminNavProvider>
      </AnalysisProvider>
    </AuthProvider>
  );
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { me, loading } = useAuth();
  const isLogin = pathname === "/login";
  const isChat = pathname === "/chat";
  const isWideContent = pathname.startsWith("/maringo");
  const isBareChrome =
    isLogin ||
    (pathname.startsWith("/trips/") && pathname.endsWith("/print")) ||
    pathname.startsWith("/share/");
  const isLimitedUser = !loading && me != null && !me.isAdmin;

  useEffect(() => {
    if (!isChat) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, [isChat]);

  if (isBareChrome) {
    return <>{children}</>;
  }

  return (
    <div
      className={
        isChat
          ? "flex h-dvh max-h-dvh overflow-hidden bg-background lg:flex"
          : "min-h-dvh bg-background lg:flex"
      }
    >
      <div className="sticky top-0 z-20 hidden h-dvh shrink-0 lg:block">
        <Sidebar />
      </div>
      <main
        className={
          isChat
            ? "relative flex h-dvh max-h-dvh min-w-0 flex-1 flex-col overflow-hidden"
            : "relative min-h-dvh min-w-0 flex-1 lg:h-dvh lg:overflow-y-auto"
        }
      >
        <BuddyScene variant={isChat ? "chat" : "default"} />
        <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
          <MobileHeader />
          {!isLimitedUser ? <TriageMassPauseBanner /> : null}
          {!isLimitedUser ? <AnalysisStatusBar /> : null}
          {me ? <RealtimeToasts /> : null}
          {me ? <ServiceWorkerRegister /> : null}
          {me && !isLimitedUser ? <CloseoutAssistant /> : null}
          <div
            className={
              isChat
                ? "mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-4 py-3 sm:px-6 lg:px-8 lg:py-4"
                : `mx-auto w-full min-w-0 px-4 py-5 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-7 lg:px-8 lg:py-8 ${
                    isWideContent ? "max-w-[96rem]" : "max-w-7xl"
                  }`
            }
          >
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
