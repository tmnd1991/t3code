import { ComposerSelectControl } from "./chat/ComposerControl";
import { ComposerContextLabel } from "./ComposerContextLabel";
import { FolderGit2Icon, FolderGitIcon, FolderIcon } from "lucide-react";
import { memo, type MouseEvent as ReactMouseEvent } from "react";
import { T, useGT, useMessages } from "gt-react";

import {
  resolveCurrentWorkspaceLabel,
  resolveEnvModeLabel,
  resolveLockedWorkspaceLabel,
  type EnvMode,
  type ExistingWorktreeOption,
} from "./BranchToolbar.logic";
import { useComposerMenuProps } from "./chat/composerEventScope";
import {
  existingWorktreeValue,
  ExistingWorktreeItemContent,
  findExistingWorktree,
} from "./ExistingWorktreeItemContent";
import {
  Select,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectPopup,
  SelectValue,
} from "./ui/select";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { useAtomValue } from "@effect/atom-react";
import { shortcutLabelForCommand } from "../keybindings";
import { primaryServerKeybindingsAtom } from "../state/server";

interface BranchToolbarEnvModeSelectorProps {
  forceNewWorktree?: boolean;
  envLocked: boolean;
  effectiveEnvMode: EnvMode;
  activeWorktreePath: string | null;
  onEnvModeChange: (mode: EnvMode) => void;
  existingWorktrees?: readonly ExistingWorktreeOption[];
  onUseWorktree?: (option: ExistingWorktreeOption) => void;
  onUseMainCheckout?: () => void;
}

export const BranchToolbarEnvModeSelector = memo(function BranchToolbarEnvModeSelector({
  forceNewWorktree = false,
  envLocked,
  effectiveEnvMode,
  activeWorktreePath,
  onEnvModeChange,
  existingWorktrees = [],
  onUseWorktree,
  onUseMainCheckout,
}: BranchToolbarEnvModeSelectorProps) {
  const gt = useGT();
  const m = useMessages();
  const composerFloatingLayerProps = useComposerMenuProps();
  const shortcutLabel = shortcutLabelForCommand(
    useAtomValue(primaryServerKeybindingsAtom),
    "composer.workspace",
  );
  const worktreeOptions = onUseWorktree ? existingWorktrees : [];
  const envModeItems = [
    { value: "local", label: resolveLockedWorkspaceLabel(null, "local", m) },
    { value: "worktree", label: resolveEnvModeLabel("worktree", m) },
    ...worktreeOptions.map((option) => ({
      value: existingWorktreeValue(option.worktreePath),
      label: option.branch ?? option.worktreePath,
    })),
  ];
  const selectedValue = activeWorktreePath
    ? existingWorktreeValue(activeWorktreePath)
    : effectiveEnvMode;

  const stopContextMenuMouseDown = (event: ReactMouseEvent) => {
    if (event.button !== 0 || event.ctrlKey) {
      event.stopPropagation();
    }
  };

  if (envLocked || forceNewWorktree) {
    const lockedRow = (
      <span
        className="inline-flex h-7 min-w-0 items-center gap-1.5 border border-transparent px-1.75 font-normal text-muted-foreground/70 text-sm sm:h-6 sm:text-xs"
        data-composer-context-control
      >
        {activeWorktreePath ? (
          <FolderGitIcon className="size-3" />
        ) : effectiveEnvMode === "worktree" ? (
          <FolderGit2Icon className="size-3" />
        ) : (
          <FolderIcon className="size-3" />
        )}
        <ComposerContextLabel>
          {forceNewWorktree
            ? resolveEnvModeLabel("worktree", m)
            : resolveLockedWorkspaceLabel(activeWorktreePath, effectiveEnvMode, m)}
        </ComposerContextLabel>
      </span>
    );

    return (
      <Tooltip>
        <TooltipTrigger render={lockedRow} />
        <TooltipPopup>
          {forceNewWorktree
            ? gt("Each model starts in its own worktree.")
            : (activeWorktreePath ??
              resolveLockedWorkspaceLabel(activeWorktreePath, effectiveEnvMode, m))}
        </TooltipPopup>
      </Tooltip>
    );
  }

  return (
    <Select
      modal={false}
      value={selectedValue}
      onValueChange={(value: string | null) => {
        const option = findExistingWorktree(worktreeOptions, value);
        if (option) {
          onUseWorktree?.(option);
          return;
        }
        if (value === "local" && activeWorktreePath && onUseMainCheckout) {
          onUseMainCheckout();
          return;
        }
        onEnvModeChange(value as EnvMode);
      }}
      items={envModeItems}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <ComposerSelectControl
              size="xs"
              className="min-w-0 shrink"
              aria-label={gt("Workspace")}
              data-composer-shortcut="composer.workspace"
              data-composer-context-control
              onMouseDownCapture={stopContextMenuMouseDown}
            />
          }
        >
          {effectiveEnvMode === "worktree" ? (
            <FolderGit2Icon className="size-3" />
          ) : activeWorktreePath ? (
            <FolderGitIcon className="size-3" />
          ) : (
            <FolderIcon className="size-3" />
          )}
          <ComposerContextLabel>
            <SelectValue />
          </ComposerContextLabel>
        </TooltipTrigger>
        <TooltipPopup>
          {effectiveEnvMode === "worktree"
            ? resolveEnvModeLabel("worktree", m)
            : resolveCurrentWorkspaceLabel(activeWorktreePath, m)}
          {shortcutLabel ? ` · ${shortcutLabel}` : null}
        </TooltipPopup>
      </Tooltip>
      <SelectPopup
        alignItemWithTrigger={false}
        {...composerFloatingLayerProps}
        className={worktreeOptions.length > 0 ? "w-[min(21rem,calc(100vw-2rem))]" : undefined}
      >
        <SelectGroup>
          <SelectGroupLabel>
            <T>Workspace</T>
          </SelectGroupLabel>
          <SelectItem value="local">
            <span className="inline-flex items-center gap-1.5">
              <FolderIcon className="size-3" />
              {resolveLockedWorkspaceLabel(null, "local", m)}
            </span>
          </SelectItem>
          <SelectItem value="worktree">
            <span className="inline-flex items-center gap-1.5">
              <FolderGit2Icon className="size-3" />
              {resolveEnvModeLabel("worktree", m)}
            </span>
          </SelectItem>
        </SelectGroup>
        {worktreeOptions.length > 0 ? (
          <SelectGroup>
            <SelectGroupLabel>
              <T>Existing worktrees</T>
            </SelectGroupLabel>
            {worktreeOptions.map((option) => (
              <SelectItem
                key={option.worktreePath}
                value={existingWorktreeValue(option.worktreePath)}
              >
                <ExistingWorktreeItemContent option={option} />
              </SelectItem>
            ))}
          </SelectGroup>
        ) : null}
      </SelectPopup>
    </Select>
  );
});
