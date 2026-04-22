import Image from 'next/image'

export default function Footer() {
  return (
    <footer className="shrink-0 border-t border-slate-100 bg-white/70 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Texto corporativo */}
        <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-3 text-center sm:text-left">
          <span className="text-xs text-slate-400">
            Pertenece a{' '}
            <span className="font-semibold text-slate-500">Origins Capital Holding</span>
          </span>
          <span className="hidden sm:inline text-slate-200">·</span>
          <span className="text-xs text-slate-400">
            Desarrollado por{' '}
            <span className="font-semibold text-slate-500">Origins System Solution</span>
          </span>
        </div>

        {/* Logos */}
        <div className="flex items-center gap-5">
          <Image
            src="/logo-origins-system.svg"
            alt="Origins System Solution"
            width={130}
            height={32}
            className="opacity-60 hover:opacity-90 transition-opacity"
          />
          <div className="w-px h-5 bg-slate-200" />
          <Image
            src="/logo-origins-ai.svg"
            alt="Origins AI"
            width={90}
            height={32}
            className="opacity-60 hover:opacity-90 transition-opacity"
          />
        </div>
      </div>
    </footer>
  )
}
