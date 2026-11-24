import { T } from "gt-react";
import { FolderGitIcon, HistoryIcon } from "lucide-react";

import type { ExistingWorktreeOption } from "./BranchToolbar.logic";
import { MiddleTruncate } from "./ui/middle-truncate";

const EXISTING_WORKTREE_VALUE_PREFIX = "existing-worktree:";

/** Select values are strings, so an option travels through the menu as its prefixed path. */
export const existingWorktreeValue = (worktreePath: string) =>
  `${EXISTING_WORKTREE_VALUE_PREFIX}${worktreePath}`;

export const findExistingWorktree = (
  options: readonly ExistingWorktreeOption[],
  value: string | null,
) =>
  value?.startsWith(EXISTING_WORKTREE_VALUE_PREFIX)
    ? options.find((option) => existingWorktreeValue(option.worktreePath) === value)
    : undefined;

export function ExistingWorktreeItemContent({ option }: { option: ExistingWorktreeOption }) {
  const Icon = option.previous ? HistoryIcon : FolderGitIcon;
  return (
    <span className="flex min-w-0 items-start gap-1.5">
      <Icon className="mt-1 size-3 shrink-0" />
      <span className="flex min-w-0 flex-col">
        <span className="min-w-0">
          {option.previous ? (
            <T>Previous worktree</T>
          ) : option.branch ? (
            <MiddleTruncate value={option.branch} />
          ) : (
            <T>Detached HEAD</T>
          )}
        </span>
        <span className="min-w-0 text-xs text-muted-foreground">
          <MiddleTruncate
            value={option.previous && option.branch ? option.branch : option.worktreePath}
          />
        </span>
      </span>
    </span>
  );
}
