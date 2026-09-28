export default function Loading() {
  return (
    <div className="px-5 pt-8" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-12 w-48 rounded-[14px]" />
      <div className="skeleton mt-6 h-14 rounded-[18px]" />
      <div className="mt-8 grid grid-cols-2 gap-3.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <div className="skeleton aspect-[4/5] rounded-[20px]" />
            <div className="skeleton mt-2.5 h-4 w-3/4 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
