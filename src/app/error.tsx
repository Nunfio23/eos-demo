'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error capturado:', error)
      console.error('Stack:', error.stack)
    }
    // TODO: Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg border border-slate-100">
        <div className="mb-4 flex items-center justify-center">
          <svg
            className="h-16 w-16 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <h2 className="mb-4 text-center text-2xl font-bold text-slate-800">
          Algo salio mal
        </h2>

        <p className="mb-6 text-center text-slate-600">
          {error.message || 'Ha ocurrido un error inesperado al cargar los datos del sistema.'}
        </p>

        {process.env.NODE_ENV === 'development' && (
          <details className="mb-4 rounded-xl bg-slate-100 p-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">
              Detalles tecnicos (solo en desarrollo)
            </summary>
            <pre className="mt-2 overflow-auto text-xs text-slate-600 max-h-40">
              {error.stack}
            </pre>
            {error.digest && (
              <p className="mt-2 text-xs text-slate-400">Error ID: {error.digest}</p>
            )}
          </details>
        )}

        <div className="flex gap-3">
          <button
            onClick={reset}
            className="flex-1 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-700 active:scale-95"
          >
            Reintentar
          </button>

          <button
            onClick={() => router.push('/dashboard')}
            className="flex-1 rounded-xl border-2 border-slate-200 px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-95"
          >
            Ir al Dashboard
          </button>
        </div>

        <button
          onClick={() => window.location.reload()}
          className="mt-3 w-full text-sm text-slate-400 underline hover:text-slate-600 transition"
        >
          Recargar pagina completa
        </button>
      </div>
    </div>
  )
}
