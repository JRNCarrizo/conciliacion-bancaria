import { parseShareMarkerFromText } from '../conciliacion/utils/shareLink'
import { ChatConciliacionShareCard } from './ChatConciliacionShareCard'

export function ChatMessageBody({ body }: { body: string }) {
  const { ref, userText } = parseShareMarkerFromText(body)

  if (!ref && !userText) {
    return <div className="chat-bubble-text">{body}</div>
  }

  return (
    <div className="chat-bubble-body">
      {ref ? <ChatConciliacionShareCard shareRef={ref} /> : null}
      {userText ? <div className="chat-bubble-text">{userText}</div> : null}
    </div>
  )
}
