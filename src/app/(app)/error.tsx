"use client";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center px-8 text-center">
      <p className="font-display text-[36px]">Something burnt</p>
      <p className="mt-2 text-[15px] text-muted">We couldn&apos;t load this just now. Your data is safe.</p>
      <button onClick={reset} className="mt-6 h-11 rounded-[14px] bg-ink px-5 text-[15px] font-medium text-bg">
        Try again
      </button>
    </div>
  );
}
