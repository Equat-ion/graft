import { Suspense } from "react";
import LoginForm from "./login-form";

function LoginFormFallback() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm animate-pulse rounded-lg border border-border bg-card p-6">
        <div className="mb-6 h-6 w-32 rounded bg-muted" />
        <div className="mb-4 h-10 rounded bg-muted" />
        <div className="mb-3 h-10 rounded bg-muted" />
        <div className="h-10 rounded bg-muted" />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFormFallback />}>
      <LoginForm />
    </Suspense>
  );
}
