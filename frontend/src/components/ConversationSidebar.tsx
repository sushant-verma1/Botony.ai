import { useRef, useState } from "react";
import {
  Ellipsis,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import type { ConversationSummary } from "../types/chat";
import Mark from "./Mark";
import Spinner from "./Spinner";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "./ui/sidebar";

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
  const { isMobile, setOpenMobile } = useSidebar();

  // On a phone the rail is a sheet over the transcript, so picking a
  // conversation has to close it or the thing you chose is behind it.
  const select = (id: string) => {
    onSelect(id);
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="offcanvas" className="border-r border-border">
      <SidebarHeader className="gap-4 px-3 pt-4 pb-3">
        <div className="flex items-center gap-2.5 px-1">
          <Mark className="w-[26px] text-foreground" />
          <span className="text-[19px] tracking-[-0.012em]">Botony</span>
        </div>

        {/* .button--solid, in the shape the sidebar needs it. */}
        <Button
          onClick={onNewChat}
          disabled={disabled || creatingChat}
          className="h-9 w-full justify-start gap-2 rounded-full px-4 text-[13.5px]"
        >
          {creatingChat ? (
            <Spinner className="size-3.5" />
          ) : (
            <Plus className="size-3.5" aria-hidden="true" />
          )}
          New conversation
        </Button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="px-3">
          <SidebarGroupLabel className="chat-label h-auto px-1 pb-2">
            Conversations
          </SidebarGroupLabel>

          <SidebarGroupContent>
            {conversations.length === 0 ? (
              <p className="px-1 py-1 text-[13px] leading-relaxed text-muted-foreground">
                Nothing here yet. Your conversations will be listed as you
                start them.
              </p>
            ) : (
              <SidebarMenu className="gap-0.5">
                {conversations.map((c) => (
                  <ConversationItem
                    key={c.id}
                    conversation={c}
                    isActive={c.id === activeConversationId}
                    disabled={disabled}
                    onSelect={select}
                    onRequestDelete={onRequestDelete}
                    onRename={onRename}
                  />
                ))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* The landing's footer note, where it is just as true. */}
      <SidebarFooter className="px-4 pt-3 pb-5">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Prototype. Not a regulated medical device and not a diagnostic tool.
        </p>
      </SidebarFooter>
    </Sidebar>
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

  const startEditing = () => {
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
      <SidebarMenuItem className="flex items-center gap-1.5 py-0.5">
        <Input
          autoFocus
          aria-label="Conversation title"
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
          className="h-8 bg-background text-[13px]"
        />
        {saving && <Spinner className="size-3.5 text-muted-foreground" />}
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={() => onSelect(conversation.id)}
        disabled={disabled}
        isActive={isActive}
        className="chat-conv h-auto rounded-lg px-2.5 py-2 text-[13.5px] font-normal transition-colors data-active:font-normal"
      >
        {conversation.status === "emergency" && (
          <TriangleAlert
            className="size-3.5 text-destructive"
            aria-hidden="true"
          />
        )}
        <span className={isActive ? undefined : "text-muted-foreground"}>
          {conversation.title || "New conversation"}
        </span>
        {conversation.status === "emergency" && (
          <span className="sr-only">(emergency)</span>
        )}
      </SidebarMenuButton>

      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={disabled}
          render={
            <SidebarMenuAction
              showOnHover
              aria-label={`Options for ${conversation.title || "New conversation"}`}
            />
          }
        >
          <Ellipsis aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="right"
          align="start"
          className="w-auto min-w-40"
        >
          <DropdownMenuItem onClick={startEditing}>
            <Pencil aria-hidden="true" />
            Rename conversation
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => onRequestDelete(conversation.id)}
          >
            <Trash2 aria-hidden="true" />
            Delete conversation
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}
