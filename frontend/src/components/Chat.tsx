import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { chatAPI } from "../services/api/chatApi";
import {
  attachmentAPI,
  mimeToKind,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
} from "../services/api/attachmentApi";
import type { ChatMessage, ConversationSummary } from "../types/chat";
import MessageBubble from "./MessageBubble";
import Mark from "./Mark";
import Spinner from "./Spinner";
import ConversationSidebar from "./ConversationSidebar";
import ConfirmDialog from "./ConfirmDialog";
import ChatComposer from "./chat/ChatComposer";
import type { PendingAttachment } from "./chat/ChatComposer";
import ChatTopBar from "./chat/ChatTopBar";
import {
  ProfileDialog,
  SafetyDialog,
  SettingsDialog,
} from "./chat/AccountDialogs";
import { useChatPrefs } from "./chat/prefs";
import { SidebarInset, SidebarProvider } from "./ui/sidebar";
import "./chat/chat.css";

/** Mirrors createMessageSchema's bound, so the field stops where the API
 *  would have refused. */
const MAX_MESSAGE_LENGTH = 3000;

/** Openings that show the range rather than sell it: one to watch, one to
 *  book, one to decide about. The three cases the landing page names. */
const OPENERS = [
  "I've had a headache for three days",
  "My throat hurts and I've been running a fever",
  "I'm not sure whether this rash needs a doctor",
];

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
  // Which of the account errands is open, if any. One at a time — they are
  // alternatives, not a stack.
  const [openDialog, setOpenDialog] = useState<
    "profile" | "settings" | "safety" | null
  >(null);
  // Set once the answer starts arriving: the waiting mark gives way to the
  // turn that is filling in.
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const isPrependingRef = useRef<boolean>(false);
  const prependAdjustRef = useRef<{
    prevScrollHeight: number;
    prevScrollTop: number;
  } | null>(null);
  const [prefs, setPrefs] = useChatPrefs();
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

  // Leaving the page stops the answer being generated server-side too.
  useEffect(() => {
    return () => streamAbortRef.current?.abort();
  }, []);

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

  const handleFilesPicked = async (files: File[]) => {
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

  const handleSend = async () => {
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

    // The answer arrives as deltas, so it is accumulated here and the
    // placeholder turn is rewritten as it grows. MessageBubble renders
    // plain text, so a half-received answer can never render as broken
    // markup.
    const placeholderId = crypto.randomUUID();
    let streamed = "";

    const controller = new AbortController();
    streamAbortRef.current = controller;

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const result = await chatAPI.streamMessage(
        conversationId,
        trimmed,
        attachmentIds.length > 0 ? attachmentIds : undefined,
        {
          signal: controller.signal,
          onStart: () => {
            setStreamingId(placeholderId);
            setMessages((prev) => [
              ...prev,
              {
                id: placeholderId,
                role: "assistant",
                content: "",
                emergencyDetected: false,
                createdAt: new Date().toISOString(),
              },
            ]);
          },
          onDelta: (text) => {
            streamed += text;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === placeholderId ? { ...m, content: streamed } : m,
              ),
            );
          },
        },
      );

      // The placeholder becomes the persisted message: same text, real id.
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholderId
            ? {
                ...m,
                id: result.assistantMessageId,
                content: streamed,
                emergencyDetected: result.type === "emergency",
              }
            : m,
        ),
      );
      setAttachments([]);
      fetchConversations();
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? err.response?.data?.message || "Failed to send message"
        : err instanceof Error && err.message
          ? err.message
          : "Failed to send message";
      toast.error(message);
      // Nothing was persisted, so the placeholder and the optimistic user
      // message both go, and the text returns to the composer.
      setMessages((prev) =>
        prev.filter((m) => m.id !== placeholderId && m.id !== userMessage.id),
      );
      setInput(trimmed);
    } finally {
      setStreamingId(null);
      streamAbortRef.current = null;
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

  const activeConversation =
    conversations.find((c) => c.id === conversationId) ?? null;

  return (
    <SidebarProvider
      className="chat h-svh min-h-svh overflow-hidden"
      data-text-size={prefs.textSize}
    >
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

      <SidebarInset className="min-w-0 overflow-hidden">
        <ChatTopBar
          name={user?.name}
          email={user?.email}
          conversation={activeConversation}
          onOpenProfile={() => setOpenDialog("profile")}
          onOpenSettings={() => setOpenDialog("settings")}
          onOpenSafety={() => setOpenDialog("safety")}
          onRequestLogout={() => setShowLogoutConfirm(true)}
          loggingOut={loggingOut}
        />

        {/* The transcript and the hem that fades it into the composer. */}
        <div className="relative min-h-0 flex-1">
          <div
            ref={messagesContainerRef}
            onScroll={handleMessagesScroll}
            data-testid="messages-container"
            data-lenis-prevent
            className="h-full overflow-y-auto px-3 py-8 sm:px-6"
          >
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-7">
              {loadingOlder && (
                <div className="flex justify-center py-1">
                  <Spinner className="size-4 text-muted-foreground" />
                </div>
              )}

              {messages.length === 0 && !switchingChat && (
                <EmptyTranscript
                  disabled={loading || switchingChat || !conversationId}
                  onPick={setInput}
                />
              )}

              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}

              {loading && !streamingId && (
                <div className="flex gap-3 sm:gap-4">
                  <div className="w-7 shrink-0 pt-[0.6rem]">
                    <Mark className="chat-waiting w-7" />
                  </div>
                  <p className="sr-only" aria-live="polite">
                    Botony is thinking
                  </p>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </div>

          <div
            className="chat-hem pointer-events-none absolute inset-x-0 bottom-0 h-8"
            aria-hidden="true"
          />
        </div>

        <ChatComposer
          value={input}
          onChange={setInput}
          onSubmit={handleSend}
          onFilesPicked={handleFilesPicked}
          attachments={attachments}
          onRemoveAttachment={handleRemoveAttachment}
          disabled={loading || switchingChat || !conversationId}
          sending={loading}
          enterSends={prefs.enterSends}
          maxLength={MAX_MESSAGE_LENGTH}
        />
      </SidebarInset>

      <ProfileDialog
        open={openDialog === "profile"}
        onOpenChange={(open) => setOpenDialog(open ? "profile" : null)}
      />
      <SettingsDialog
        open={openDialog === "settings"}
        onOpenChange={(open) => setOpenDialog(open ? "settings" : null)}
        prefs={prefs}
        onChange={setPrefs}
      />
      <SafetyDialog
        open={openDialog === "safety"}
        onOpenChange={(open) => setOpenDialog(open ? "safety" : null)}
      />

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
    </SidebarProvider>
  );
}

/** An empty conversation, picking up the landing page's last line. The three
 *  openings are not features — they are the shape of a first message, which
 *  is the thing people actually stall on. */
function EmptyTranscript({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (text: string) => void;
}) {
  return (
    <div className="chat-turn pt-6 pb-2 sm:pt-12">
      <Mark className="w-8 text-foreground" />
      <h2 className="mt-6 max-w-[18ch] text-[clamp(27px,3.4vw,38px)] leading-[1.16] font-normal tracking-[-0.02em] text-balance">
        Start with how you feel.
      </h2>
      <p className="mt-4 max-w-[52ch] text-[15px] leading-[1.66] text-muted-foreground text-pretty">
        Plain language, the way you would tell a friend or a nurse. Botony
        reads what you write and helps you tell the difference between
        something to watch, something to book, and something to act on now.
      </p>

      <ul className="mt-9 mb-0 list-none p-0">
        {OPENERS.map((opener) => (
          <li key={opener} className="border-b border-border first:border-t">
            <button
              type="button"
              onClick={() => onPick(opener)}
              disabled={disabled}
              className="w-full cursor-pointer py-3.5 text-left text-[15px] tracking-[-0.008em] text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              {opener}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
