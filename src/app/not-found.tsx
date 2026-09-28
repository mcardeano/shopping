import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center bg-bg px-8 text-center">
      <p className="font-display text-[44px]">Not on the menu</p>
      <p className="mt-2 text-[15px] text-muted">That page doesn&apos;t exist, or the recipe was deleted.</p>
      <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-[14px] bg-ink px-5 text-[15px] font-medium text-bg">
        Back home
      </Link>
    </div>
  );
}
