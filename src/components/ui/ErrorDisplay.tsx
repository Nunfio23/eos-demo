'use client'

import { useRouter } from 'next/navigation'

interface ErrorDisplayProps {
  error: Error
  onRetry?: () => void
  showBackButton?: boolean
  compact?: boolean
}

export function ErrorDisplay({
  error,
  onRetry,
  showBackButton = false,
  compact = false,
}: ErrorDisplayProps) {
  const router = useRouter()

  if (compact) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="flex items-center gap-2">
          <svg className="h-5 w-5 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="flex-1 text-sm text-red-700">
            {error.message || 'Ha ocurrido un error inesperado'}
          </p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="ml-2 shrink-0 text-sm font-medium text-red-600 underline hover:text-red-800 transition"
            >
              Reintentar
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border-2 border-red-100 bg-red-50 p-6">
      <div className="flex items-start gap-3">
        <svg
          className="h-6 w-6 shrink-0 text-red-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>

        <div className="flex-1">
          <h3 className="font-semibold text-red-800">Error al cargar datos</h3>
          <p className="mt-1 text-sm text-red-700">
            {error.message || 'Ha ocurrido un error inesperado'}
          </p>

          {process.env.NODE_ENV === 'development' && error.stack && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-medium text-red-600 hover:text-red-800">
                Ver detalles tecnicos
              </summary>
              <pre className="mt-2 overflow-auto rounded-lg bg-red-100 p-2 text-xs text-red-800 max-h-40">
                {error.stack}
              </pre>
            </details>
          )}

          <div className="mt-4 flex gap-3">
            {onRetry && (
              <button
                onClick={onRetry}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 active:scale-95 transition"
              >
                Reintentar
              </button>
            )}

            {showBackButton && (
              <button
                onClick={() => router.back()}
                className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 active:scale-95 transition"
              >
                Volver
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function InlineError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {message}
    </div>
  )
}
