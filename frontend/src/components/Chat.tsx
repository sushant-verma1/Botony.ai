import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { chatAPI } from "../services/api/chatApi";
import {
  attachmentAPI,
  mimeToKind,
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
} from "../services/api/attachmentApi";
import type { ChatMessage, ConversationSummary } from "../types/chat";
import MessageBubble from "./MessageBubble";
import Spinner from "./Spinner";
import ConversationSidebar from "./ConversationSidebar";
import ConfirmDialog from "./ConfirmDialog";

interface PendingAttachment {
  attachmentId: string;
  name: string;
  status: "uploading" | "ready" | "error";
  error?: string;
}

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [loggingOut, setLoggingOut] = useState<boolean>(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState<boolean>(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>(
    [],
  );
  const [creatingChat, setCreatingChat] = useState<boolean>(false);
  const [switchingChat, setSwitchingChat] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState<boolean>(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const isPrependingRef = useRef<boolean>(false);
  const prependAdjustRef = useRef<{
    prevScrollHeight: number;
    prevScrollTop: number;
  } | null>(null);
  const { user, logout, loading: authLoading, isLoggedIn } = useAuth();
  const navigate = useNavigate();

  const fetchConversations = async (): Promise<ConversationSummary[]> => {
    try {
      const { data } = await chatAPI.getConversations();
      setConversations(data.conversations);
      return data.conversations;
    } catch {
      toast.error("Could not load conversations");
      return [];
    }
  };

  const loadConversation = async (id: string) => {
    setSwitchingChat(true);
    try {
      const { data } = await chatAPI.getHistory(id);
      setMessages(data.messages);
      setConversationId(id);
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
    } catch {
      toast.error("Could not load conversation");
    } finally {
      setSwitchingChat(false);
    }
  };

  const loadOlderMessages = async () => {
    if (!conversationId || !hasMore || loadingOlder || !nextCursor) return;

    setLoadingOlder(true);
    const container = messagesContainerRef.current;

    try {
      const { data } = await chatAPI.getHistory(conversationId, {
        before: nextCursor,
      });

      if (container) {
        isPrependingRef.current = true;
        prependAdjustRef.current = {
          prevScrollHeight: container.scrollHeight,
          prevScrollTop: container.scrollTop,
        };
      }

      setMessages((prev) => [...data.messages, ...prev]);
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
    } catch {
      toast.error("Could not load earlier messages");
    } finally {
      setLoadingOlder(false);
    }
  };

  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;

    if (container.scrollTop < 100 && hasMore && !loadingOlder) {
      loadOlderMessages();
    }
  };

  const startNewChat = async () => {
    setCreatingChat(true);
    try {
      const { data } = await chatAPI.createConversation();
      setConversationId(data.conversationId);
      setMessages([]);
      await fetchConversations();
    } catch {
      toast.error("Could not start conversation");
    } finally {
      setCreatingChat(false);
    }
  };

  const handleSelectConversation = (id: string) => {
    if (id === conversationId) return;
    loadConversation(id);
  };

  const handleRenameConversation = async (id: string, title: string) => {
    try {
      await chatAPI.renameConversation(id, title);
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title } : c)),
      );
    } catch {
      toast.error("Could not rename conversation");
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;

    const idToDelete = deleteTargetId;
    setIsDeleting(true);

    try {
      await chatAPI.deleteConversation(idToDelete);
      setDeleteTargetId(null);

      const list = await fetchConversations();

      if (idToDelete === conversationId) {
        if (list.length > 0) {
          await loadConversation(list[0].id);
        } else {
          await startNewChat();
        }
      }
    } catch {
      toast.error("Could not delete conversation");
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!isLoggedIn) return;

    const init = async () => {
      const list = await fetchConversations();
      if (list.length > 0) {
        await loadConversation(list[0].id);
      } else {
        await startNewChat();
      }
    };

    init();
  }, [authLoading, isLoggedIn]);

  useLayoutEffect(() => {
    const container = messagesContainerRef.current;
    const adjust = prependAdjustRef.current;

    if (container && adjust) {
      container.scrollTop =
        container.scrollHeight - adjust.prevScrollHeight + adjust.prevScrollTop;
      prependAdjustRef.current = null;
    }
  }, [messages]);

  useEffect(() => {
    if (isPrependingRef.current) {
      isPrependingRef.current = false;
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleFileSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";

    for (const file of files) {
      const kind = mimeToKind(file.type);
      if (!kind) {
        toast.error(`${file.name}: unsupported file type`);
        continue;
      }
      const maxBytes = kind === "IMAGE" ? MAX_IMAGE_BYTES : MAX_PDF_BYTES;
      if (file.size > maxBytes) {
        toast.error(`${file.name}: file is too large`);
        continue;
      }

      const placeholderId = crypto.randomUUID();
      setAttachments((prev) => [
        ...prev,
        { attachmentId: placeholderId, name: file.name, status: "uploading" },
      ]);

      try {
        const { data: signature } = await attachmentAPI.requestSignature(
          kind,
          file.type,
          file.size,
        );
        await attachmentAPI.uploadToCloudinary(signature, file);
        await attachmentAPI.confirm(signature.attachmentId);

        setAttachments((prev) =>
          prev.map((a) =>
            a.attachmentId === placeholderId
              ? { ...a, attachmentId: signature.attachmentId, status: "ready" }
              : a,
          ),
        );
      } catch (err) {
        const message = axios.isAxiosError(err)
          ? err.response?.data?.message || "Upload failed"
          : "Upload failed";
        setAttachments((prev) =>
          prev.map((a) =>
            a.attachmentId === placeholderId
              ? { ...a, status: "error", error: message }
              : a,
          ),
        );
        toast.error(`${file.name}: ${message}`);
      }
    }
  };

  const handleRemoveAttachment = async (attachmentId: string) => {
    setAttachments((prev) => prev.filter((a) => a.attachmentId !== attachmentId));
    try {
      await attachmentAPI.remove(attachmentId);
    } catch {
      // Best-effort cleanup; the row is orphaned but never bound to a
      // message, so it carries no information and is swept later.
    }
  };

  const handleSend = async (e: React.SubmitEvent) => {
    e.preventDefault();

    const trimmed = input.trim();
    if (!trimmed || !conversationId) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      emergencyDetected: false,
      createdAt: new Date().toISOString(),
    };

    const attachmentIds = attachments
      .filter((a) => a.status === "ready")
      .map((a) => a.attachmentId);

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const { data } = await chatAPI.sendMessage(
        conversationId,
        trimmed,
        attachmentIds.length > 0 ? attachmentIds : undefined,
      );

      const assistantMessage: ChatMessage = {
        id: data.assistantMessageId,
        role: "assistant",
        content: data.response,
        emergencyDetected: data.type === "emergency",
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setAttachments([]);
      fetchConversations();
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? err.response?.data?.message || "Failed to send message"
        : "Failed to send message";
      toast.error(message);
      setMessages((prev) => prev.slice(0, -1));
      setInput(trimmed);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setShowLogoutConfirm(false);
    setLoggingOut(true);
    try {
      await logout();
      navigate("/login");
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <ConversationSidebar
        conversations={conversations}
        activeConversationId={conversationId}
        onSelect={handleSelectConversation}
        onNewChat={startNewChat}
        onRequestDelete={setDeleteTargetId}
        onRename={handleRenameConversation}
        creatingChat={creatingChat}
        disabled={creatingChat || switchingChat || loading}
      />
      <div className="flex flex-col flex-1 min-w-0">
      <div className="bg-white border-b px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-blue-600 text-xl">🏥</span>
          <span className="font-semibold text-gray-800">Medical AI</span>
          <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
            Prototype
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{user?.name}</span>
          <button
            onClick={() => setShowLogoutConfirm(true)}
            disabled={loggingOut}
            className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {loggingOut && <Spinner className="h-3.5 w-3.5" />}
            Logout
          </button>
        </div>
      </div>

      {showLogoutConfirm && (
        <ConfirmDialog
          title="Log out?"
          message="You'll need to sign in again to continue this conversation."
          confirmLabel="Log out"
          onCancel={() => setShowLogoutConfirm(false)}
          onConfirm={handleLogout}
          loading={loggingOut}
        />
      )}

      {deleteTargetId && (
        <ConfirmDialog
          title="Delete conversation?"
          message="This will permanently delete this conversation and all of its messages."
          confirmLabel="Delete"
          onCancel={() => setDeleteTargetId(null)}
          onConfirm={handleConfirmDelete}
          loading={isDeleting}
        />
      )}

      <div
        ref={messagesContainerRef}
        onScroll={handleMessagesScroll}
        data-testid="messages-container"
        data-lenis-prevent
        className="flex-1 overflow-y-auto px-4 py-6 space-y-4"
      >
        {loadingOlder && (
          <div className="flex justify-center py-2">
            <Spinner className="h-5 w-5 text-gray-400" />
          </div>
        )}

        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-16">
            <p className="text-4xl mb-3">🩺</p>
            <p className="text-lg font-medium text-gray-600">
              How can I help you today?
            </p>
            <p className="text-sm mt-1">
              Describe your symptoms and I'll provide general health
              information.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {loading && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm flex-shrink-0">
              🩺
            </div>
            <div className="bg-white border rounded-2xl rounded-tl-none px-4 py-3 shadow-sm">
              <div className="flex gap-1 items-center h-5">
                <span
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0ms" }}
                />
                <span
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="bg-white border-t px-4 py-4 shadow-sm">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 max-w-3xl mx-auto mb-2">
            {attachments.map((a) => (
              <span
                key={a.attachmentId}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
                  a.status === "error"
                    ? "bg-red-50 border-red-200 text-red-600"
                    : "bg-gray-100 border-gray-200 text-gray-600"
                }`}
              >
                {a.status === "uploading" && <Spinner className="h-3 w-3" />}
                {a.name}
                <button
                  type="button"
                  onClick={() => handleRemoveAttachment(a.attachmentId)}
                  aria-label={`Remove ${a.name}`}
                  className="text-gray-400 hover:text-gray-700"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        <form onSubmit={handleSend} className="flex gap-3 max-w-3xl mx-auto">
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_ATTACHMENT_MIME_TYPES.join(",")}
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || switchingChat || !conversationId}
            aria-label="Attach a photo or report"
            className="border border-gray-300 text-gray-500 rounded-xl px-3.5 py-2.5 hover:bg-gray-50 disabled:opacity-50"
          >
            📎
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe your symptoms..."
            disabled={loading || switchingChat || !conversationId}
            maxLength={3000}
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={
              loading ||
              switchingChat ||
              !input.trim() ||
              !conversationId ||
              attachments.some((a) => a.status === "uploading")
            }
            className="bg-blue-600 text-white px-5 py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-50 font-medium flex items-center justify-center gap-2"
          >
            {loading && <Spinner />}
            Send
          </button>
        </form>
        <div className="flex justify-between items-center max-w-3xl mx-auto mt-2 px-1">
          <p className="text-xs text-gray-400">
            Not a substitute for professional medical advice
          </p>
          <p
            className={`text-xs font-medium ${
              input.length >= 2500
                ? "text-red-500"
                : input.length >= 1000
                  ? "text-yellow-500"
                  : "text-gray-400"
            }`}
          >
            {input.length}/3000
          </p>
        </div>
      </div>
      </div>
    </div>
  );
}
