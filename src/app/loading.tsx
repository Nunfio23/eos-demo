export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="mb-6 flex justify-center">
          <div className="relative h-20 w-20">
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600"></div>
            <div className="absolute inset-2 animate-pulse rounded-full bg-indigo-50"></div>
          </div>
        </div>

        <h3 className="mb-2 text-lg font-semibold text-slate-800">
          Cargando E-OS
        </h3>
        <p className="text-sm text-slate-500">
          Preparando tu experiencia educativa...
        </p>

        <div className="mt-4 flex justify-center gap-1">
          <div className="h-2 w-2 animate-bounce rounded-full bg-indigo-600" style={{ animationDelay: '0ms' }}></div>
          <div className="h-2 w-2 animate-bounce rounded-full bg-indigo-600" style={{ animationDelay: '150ms' }}></div>
          <div className="h-2 w-2 animate-bounce rounded-full bg-indigo-600" style={{ animationDelay: '300ms' }}></div>
        </div>
      </div>
    </div>
  )
}
