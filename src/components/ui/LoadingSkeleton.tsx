export function LoadingSkeleton({
  count = 1,
  className = 'h-24',
}: {
  count?: number
  className?: string
}) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`animate-pulse rounded-xl bg-slate-200 ${className}`}
        />
      ))}
    </>
  )
}

export function CardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      <LoadingSkeleton count={count} className="h-32" />
    </div>
  )
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      <LoadingSkeleton count={1} className="h-12" />
      <LoadingSkeleton count={rows} className="h-16" />
    </div>
  )
}

export function ChartSkeleton() {
  return (
    <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-100">
      <LoadingSkeleton count={1} className="mb-4 h-5 w-40" />
      <LoadingSkeleton count={1} className="h-56 w-full" />
    </div>
  )
}
