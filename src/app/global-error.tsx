"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error(error);
  return (
    <html lang="en">
      <body className="flex min-h-svh items-center justify-center font-sans">
        <div className="space-y-3 text-center">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-neutral-500">
            An unexpected error occurred. Try reloading the app.
          </p>
          <button
            onClick={reset}
            className="rounded-md border px-3 py-1.5 text-sm font-medium"
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
