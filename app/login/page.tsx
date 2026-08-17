import { LoginForm } from "@/components/auth/login-form";

function safeNextPath(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate?.startsWith("/") || candidate.startsWith("//")) {
    return "/dashboard";
  }
  return candidate;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-foreground px-4 py-[max(2rem,env(safe-area-inset-top))]">
      <div
        className="absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(circle at top left, color-mix(in oklab, var(--chart-4) 45%, transparent), transparent 42%), radial-gradient(circle at bottom right, color-mix(in oklab, var(--chart-5) 28%, transparent), transparent 38%)",
        }}
        aria-hidden
      />
      <div className="absolute left-1/2 top-1/2 size-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-background/10" aria-hidden />
      <div className="relative z-10 w-full">
        <LoginForm nextPath={safeNextPath(params.next)} />
      </div>
    </main>
  );
}
