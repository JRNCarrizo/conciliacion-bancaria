import { useState } from 'react'
import type { ConciliacionShareRef } from './utils/shareLink'
import { ShareToChatContactModal } from './ShareToChatContactModal'

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ShareInChatButton({
  shareRef,
  disabled,
}: {
  shareRef: ConciliacionShareRef
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="comment-thread-btn share-in-chat-btn"
        disabled={disabled}
        onClick={() => setOpen(true)}
        title="Compartir en chat"
        aria-label="Compartir en chat"
      >
        <span className="comment-thread-btn-inner">
          <ShareIcon className="comment-thread-svg" />
        </span>
      </button>
      {open ? (
        <ShareToChatContactModal shareRef={shareRef} onClose={() => setOpen(false)} />
      ) : null}
    </>
  )
}
