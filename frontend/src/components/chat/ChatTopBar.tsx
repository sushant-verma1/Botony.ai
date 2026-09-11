import { ChevronDown, LogOut, Settings, ShieldAlert, User } from "lucide-react";
import type { ConversationSummary } from "../../types/chat";
import Mark from "../Mark";
import Spinner from "../Spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { SidebarTrigger, useSidebar } from "../ui/sidebar";

interface ChatTopBarProps {
  name: string | undefined;
  email: string | undefined;
  conversation: ConversationSummary | null;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onOpenSafety: () => void;
  onRequestLogout: () => void;
  loggingOut: boolean;
}

export default function ChatTopBar({
  name,
  email,
  conversation,
  onOpenProfile,
  onOpenSettings,
  onOpenSafety,
  onRequestLogout,
  loggingOut,
}: ChatTopBarProps) {
  const { state, isMobile } = useSidebar();

  // The wordmark lives in the rail. When the rail is away it comes here, so
  // the screen is never unbranded and never shows the mark twice.
  const showBrand = isMobile || state === "collapsed";

  const initial = name?.trim()?.[0]?.toUpperCase() ?? "?";

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
      <SidebarTrigger className="size-8 rounded-full text-muted-foreground hover:text-foreground" />

      {showBrand && (
        <span className="flex shrink-0 items-center gap-2 pl-1">
          <Mark className="w-[22px] text-foreground" />
          <span className="hidden text-[15px] tracking-[-0.012em] sm:inline">
            Botony
          </span>
        </span>
      )}

      <div className="mx-1 min-w-0 flex-1 sm:mx-2">
        <p className="truncate text-[13.5px] text-muted-foreground">
          {conversation?.title || "New conversation"}
        </p>
      </div>

      {conversation?.status === "emergency" && (
        <span className="chat-label hidden shrink-0 items-center gap-1.5 text-destructive sm:flex">
          <ShieldAlert className="size-3.5" aria-hidden="true" />
          Emergency
        </span>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger
          className="ml-1 flex shrink-0 items-center gap-2 rounded-full py-1 pr-1 pl-1 text-sm transition-colors hover:bg-accent sm:pl-3"
          aria-label={`Account: ${name ?? "signed in"}`}
        >
          <span className="hidden max-w-[14ch] truncate sm:inline">{name}</span>
          <ChevronDown
            className="hidden size-3.5 text-muted-foreground sm:inline"
            aria-hidden="true"
          />
          <span
            className="grid size-7 shrink-0 place-items-center rounded-full bg-foreground text-[11px] font-medium text-background"
            aria-hidden="true"
          >
            {loggingOut ? <Spinner className="size-3" /> : initial}
          </span>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-auto min-w-56">
          {/* The identity names the group it labels, which is what these
              three act on. Base UI requires the pairing. */}
          <DropdownMenuGroup>
            <DropdownMenuLabel className="px-2 py-2">
              <span className="block truncate text-sm font-medium text-foreground">
                {name}
              </span>
              <span className="block truncate text-xs font-normal text-muted-foreground">
                {email}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            {/* All three open in place. Nothing here is worth taking you out of
              a conversation you are in the middle of. */}
            <DropdownMenuItem onClick={onOpenProfile}>
              <User aria-hidden="true" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenSettings}>
              <Settings aria-hidden="true" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenSafety}>
              <ShieldAlert aria-hidden="true" />
              Safety and limits
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={onRequestLogout}
            disabled={loggingOut}
          >
            <LogOut aria-hidden="true" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
