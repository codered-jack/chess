'use client'

export interface ToastItem {
  id: string
  message: string
  type: 'success' | 'warn'
  action?: { label: string; onClick: () => void }
}

interface ToastContainerProps {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}

export default function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 items-center pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-2xl border min-w-[280px] max-w-sm backdrop-blur-sm animate-in fade-in slide-in-from-top-2 duration-200 ${
            toast.type === 'warn'
              ? 'bg-amber-950/95 border-amber-600/50 text-amber-100'
              : 'bg-[#1b2d07]/95 border-[#86b114]/50 text-[#d6ec93]'
          }`}
        >
          <span className="text-base shrink-0">
            {toast.type === 'warn' ? '⚠' : '✓'}
          </span>
          <span className="flex-1 text-[12px] font-semibold leading-snug">
            {toast.message}
          </span>
          {toast.action && (
            <button
              onClick={() => {
                toast.action!.onClick()
                onDismiss(toast.id)
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 transition-all ${
                toast.type === 'warn'
                  ? 'bg-amber-600 hover:bg-amber-500 text-white'
                  : 'bg-[#86b114] hover:bg-[#97c815] text-white'
              }`}
            >
              {toast.action.label}
            </button>
          )}
          <button
            onClick={() => onDismiss(toast.id)}
            className="opacity-50 hover:opacity-100 transition-opacity text-[13px] leading-none shrink-0"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
