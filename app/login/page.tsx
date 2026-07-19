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
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-slate-950 px-4 py-[max(2rem,env(safe-area-inset-top))]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.45),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(20,184,166,0.28),transparent_38%)]" />
      <div className="absolute left-1/2 top-1/2 size-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
      <div className="relative z-10 w-full">
        <LoginForm nextPath={safeNextPath(params.next)} />
      </div>
    </main>
  );
}
