"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [signupDone, setSignupDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) { setError(error.message); }
      else { setSignupDone(true); }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setError(error.message); }
      else { window.location.href = "/"; }
    }
    setLoading(false);
  }

  if (signupDone) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Check your email</h1>
          <p className="text-sm text-gray-500 mt-2">
            We sent a confirmation link to <strong>{email}</strong>.<br />
            Click it to activate your account, then sign in.
          </p>
          <button
            onClick={() => { setSignupDone(false); setMode("signin"); }}
            className="mt-6 text-sm text-gray-500 hover:text-gray-900 underline"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 w-full max-w-sm">
        <h1 className="text-2xl font-extrabold bg-gradient-to-r from-brand-900 via-brand-700 to-brand-300 bg-clip-text text-transparent text-center mb-1">NAPAI</h1>
        <p className="text-xs text-brand-500 font-semibold text-center mb-8">Job Application Hub</p>

        <form onSubmit={handleSubmit} className="space-y-4" suppressHydrationWarning>
          <div suppressHydrationWarning>
            <label className="block text-xs text-gray-500 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="you@example.com"
            />
          </div>
          <div suppressHydrationWarning>
            <label className="block text-xs text-gray-500 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-brand-900 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 cursor-pointer transition-colors"
          >
            {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center mt-6">
          {mode === "signin" ? (
            <>No account?{" "}
              <button onClick={() => { setMode("signup"); setError(""); }} className="text-gray-700 underline">
                Sign up
              </button>
            </>
          ) : (
            <>Already have an account?{" "}
              <button onClick={() => { setMode("signin"); setError(""); }} className="text-gray-700 underline">
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
