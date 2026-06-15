import type { ChatMessage } from "../types/chat";

interface MessageBubbleProps {
  message: ChatMessage;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isEmergency = message.emergencyDetected;
  if (!isUser && isEmergency) {
    return (
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-sm flex-shrink-0">
          🚨
        </div>
        <div className="bg-red-50 border border-red-300 rounded-2xl rounded-tl-none px-4 py-3 max-w-xl shadow-sm">
          <p className="text-red-700 font-semibold text-sm whitespace-pre-wrap">
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="bg-blue-600 text-white rounded-2xl rounded-tr-none px-4 py-3 max-w-xl shadow-sm">
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm flex-shrink-0">
        🩺
      </div>
      <div className="bg-white border rounded-2xl rounded-tl-none px-4 py-3 max-w-xl shadow-sm">
        <p className="text-sm text-gray-800 whitespace-pre-wrap">
          {message.content}
        </p>
      </div>
    </div>
  );
}

export default MessageBubble;
