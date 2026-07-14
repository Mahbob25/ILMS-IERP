"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
      <h2 className="text-2xl font-bold text-slate-900 mb-2">Something went wrong</h2>
      <p className="text-slate-500 mb-6 max-w-md">
        An unexpected error occurred while loading the dashboard. Please try again.
      </p>
      <button
        onClick={reset}
        className="px-6 py-2.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors text-sm font-medium"
      >
        Try again
      </button>
    </div>
  );
}
