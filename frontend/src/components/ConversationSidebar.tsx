import { useRef, useState } from "react";
import type { ConversationSummary } from "../types/chat";
import Spinner from "./Spinner";

interface ConversationSidebarProps {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onRequestDelete: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  creatingChat: boolean;
  disabled: boolean;
}

export default function ConversationSidebar({
  conversations,
  activeConversationId,
  onSelect,
  onNewChat,
  onRequestDelete,
  onRename,
  creatingChat,
  disabled,
}: ConversationSidebarProps) {
  return (
    <div className="w-64 shrink-0 bg-white border-r flex flex-col h-full">
      <div className="p-3 border-b">
        <button
          onClick={onNewChat}
          disabled={disabled || creatingChat}
          className="w-full bg-blue-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {creatingChat && <Spinner className="h-4 w-4" />}
          + New Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 && (
          <p className="text-sm text-gray-400 text-center mt-6 px-4">
            No conversations yet
          </p>
        )}

        {conversations.map((c) => (
          <ConversationItem
            key={c.id}
            conversation={c}
            isActive={c.id === activeConversationId}
            disabled={disabled}
            onSelect={onSelect}
            onRequestDelete={onRequestDelete}
            onRename={onRename}
          />
        ))}
      </div>
    </div>
  );
}

interface ConversationItemProps {
  conversation: ConversationSummary;
  isActive: boolean;
  disabled: boolean;
  onSelect: (id: string) => void;
  onRequestDelete: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
}

function ConversationItem({
  conversation,
  isActive,
  disabled,
  onSelect,
  onRequestDelete,
  onRename,
}: ConversationItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(conversation.title || "");
  const [saving, setSaving] = useState(false);
  const skipBlurSaveRef = useRef(false);

  const startEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraftTitle(conversation.title || "");
    setIsEditing(true);
  };

  const cancelEditing = () => {
    skipBlurSaveRef.current = true;
    setIsEditing(false);
  };

  const saveTitle = async () => {
    const trimmed = draftTitle.trim();

    if (!trimmed || trimmed === conversation.title) {
      setIsEditing(false);
      return;
    }

    setSaving(true);
    try {
      await onRename(conversation.id, trimmed);
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-1 px-3 py-2 border-b">
        <input
          autoFocus
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveTitle();
            if (e.key === "Escape") cancelEditing();
          }}
          onBlur={() => {
            if (skipBlurSaveRef.current) {
              skipBlurSaveRef.current = false;
              return;
            }
            saveTitle();
          }}
          maxLength={100}
          disabled={saving}
          className="flex-1 min-w-0 text-sm border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        />
        {saving && <Spinner className="h-3.5 w-3.5 text-gray-400" />}
      </div>
    );
  }

  return (
    <div
      className={`group flex items-center border-b hover:bg-gray-50 ${
        isActive ? "bg-blue-50 border-l-4 border-l-blue-600" : ""
      }`}
    >
      <button
        onClick={() => onSelect(conversation.id)}
        disabled={disabled}
        className="flex-1 min-w-0 text-left px-4 py-3 text-sm disabled:opacity-50"
      >
        <p className="font-medium text-gray-700 truncate">
          {conversation.title || "New chat"}
        </p>
        {conversation.status === "emergency" && (
          <span className="text-xs text-red-500 font-medium">
            ⚠ Emergency
          </span>
        )}
      </button>
      <button
        onClick={startEditing}
        disabled={disabled}
        aria-label="Rename conversation"
        className="px-2 text-gray-400 hover:text-blue-600 disabled:opacity-50 opacity-0 group-hover:opacity-100"
      >
        ✎
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRequestDelete(conversation.id);
        }}
        disabled={disabled}
        aria-label="Delete conversation"
        className="px-3 text-gray-400 hover:text-red-600 disabled:opacity-50 opacity-0 group-hover:opacity-100"
      >
        ✕
      </button>
    </div>
  );
}
