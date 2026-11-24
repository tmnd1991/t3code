import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ProjectId, ThreadId, VcsRef } from "@t3tools/contracts";
import { msg, T, useGT, useMessages } from "gt-react";
import { GitBranchIcon } from "lucide-react";
import { useImperativeHandle, useState, type Ref } from "react";

import { useComposerDraftStore, type DraftId } from "../composerDraftStore";
import { cn } from "../lib/utils";
import { usePaginatedBranches } from "../state/queries";
import { useEnvironmentQuery } from "../state/query";
import { useAtomCommand } from "../state/use-atom-command";
import { vcsEnvironment } from "../state/vcs";
import { BranchPicker, BranchPickerRefItem } from "./BranchPicker";
import {
  deriveLocalBranchNameFromRemoteRef,
  resolveBranchSelectionTarget,
  resolveConfirmedSelectedRef,
  sanitizeNewRefName,
} from "./BranchToolbar.logic";
import { ComposerContextLabel } from "./ComposerContextLabel";
import { ComposerControl } from "./chat/ComposerControl";
import { useComposerMenuProps } from "./chat/composerEventScope";
import { THREAD_DETAILS_PANEL_ICON_CLASS } from "./chat/threadDetailsPanelStyles";
import { ThreadDetailsControl } from "./chat/ThreadDetailsControl";
import { ComboboxItem, ComboboxTrigger } from "./ui/combobox";
import { MiddleTruncate } from "./ui/middle-truncate";
import { stackedThreadToast, toastManager } from "./ui/toast";

const AUTO_BRANCH_ITEM = "__auto_branch__";
const CREATE_BRANCH_PREFIX = "__create_new_branch__:";

const BRANCH_MOVED_THREAD_MESSAGE = msg(
  "{branch} is checked out in {location}, so this thread moved there.",
);

/**
 * What a thread headed for a New worktree runs on: a branch the server names, one the user
 * names, or an existing one checked out into the worktree. A branch held by another checkout
 * cannot be checked out twice, so picking one moves the draft to that checkout instead.
 */
export interface WorktreeBranchChoiceHandle {
  open: () => void;
}

export function WorktreeBranchChoice({
  ref,
  environmentId,
  threadId,
  projectId,
  draftId,
  projectCwd,
  displayMode = "toolbar",
  className,
  onComposerFocusRequest,
}: {
  ref?: Ref<WorktreeBranchChoiceHandle>;
  environmentId: EnvironmentId;
  threadId: ThreadId;
  projectId: ProjectId;
  draftId?: DraftId | undefined;
  projectCwd: string;
  displayMode?: "toolbar" | "panel";
  className?: string;
  onComposerFocusRequest?: (() => void) | undefined;
}) {
  const gt = useGT();
  const messages = useMessages();
  const composerFloatingLayerProps = useComposerMenuProps();
  const threadRef = scopeThreadRef(environmentId, threadId);
  const draftTarget = draftId ?? threadRef;
  const draftThread = useComposerDraftStore((store) =>
    draftId ? store.getDraftSession(draftId) : store.getDraftThreadByRef(threadRef),
  );
  const setDraftThreadContext = useComposerDraftStore((store) => store.setDraftThreadContext);
  const readRefs = useAtomCommand(vcsEnvironment.readRefs, { reportFailure: false });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  useImperativeHandle(ref, () => ({ open: () => setOpen(true) }), []);
  const trimmedQuery = query.trim();
  const newName = sanitizeNewRefName(trimmedQuery);

  const projectStatusQuery = useEnvironmentQuery(
    vcsEnvironment.status({ environmentId, input: { cwd: projectCwd } }),
  );
  const checkoutRoot = projectStatusQuery.data?.workingTree.rootPath;
  const branches = usePaginatedBranches(
    { environmentId, cwd: projectCwd, query: newName },
    messages,
  );
  const refByName = new Map(branches.refs.map((ref) => [ref.name, ref] as const));

  const choice = draftThread?.worktreeBranch;
  const label =
    choice?.kind === "new"
      ? choice.name
      : choice?.kind === "existing"
        ? (draftThread?.branch ?? gt("Auto-named branch"))
        : gt("Auto-named branch");

  const createItem =
    newName.length > 0 && !refByName.has(newName) ? `${CREATE_BRANCH_PREFIX}${newName}` : null;
  const items = [
    AUTO_BRANCH_ITEM,
    ...branches.refs.map((ref) => ref.name),
    ...(createItem ? [createItem] : []),
  ];
  const filteredItems = items.filter(
    (item) => item !== AUTO_BRANCH_ITEM || trimmedQuery.length === 0,
  );

  const close = () => {
    setOpen(false);
    setQuery("");
    onComposerFocusRequest?.();
  };

  const selectRef = async (listed: VcsRef) => {
    close();
    if (listed.isRemote) {
      // No local branch exists yet, so this is a new branch started from the remote one.
      setDraftThreadContext(draftTarget, {
        branch: listed.name,
        worktreeBranch: { kind: "new", name: deriveLocalBranchNameFromRemoteRef(listed.name) },
      });
      return;
    }
    // The picker's list can predate a checkout made elsewhere; only the holder's live HEAD counts.
    let holder = listed;
    if (listed.worktreePath) {
      const result = await readRefs({
        environmentId,
        input: { cwd: listed.worktreePath, query: listed.name, refKind: "local", limit: 1 },
      });
      holder = resolveConfirmedSelectedRef(listed, result._tag === "Success" ? result.value : null);
    }
    if (!holder.worktreePath) {
      setDraftThreadContext(draftTarget, {
        branch: holder.name,
        worktreeBranch: { kind: "existing" },
      });
      return;
    }
    const { nextWorktreePath } = resolveBranchSelectionTarget({
      activeProjectCwd: projectCwd,
      activeProjectCheckoutRoot: checkoutRoot,
      activeWorktreePath: null,
      refName: holder,
    });
    setDraftThreadContext(draftTarget, {
      branch: holder.name,
      worktreePath: nextWorktreePath,
      envMode: "local",
      worktreeBranch: null,
      projectRef: scopeProjectRef(environmentId, projectId),
    });
    toastManager.add(
      stackedThreadToast({
        type: "info",
        title: messages(BRANCH_MOVED_THREAD_MESSAGE, {
          branch: holder.name,
          location: nextWorktreePath ?? gt("the local checkout"),
        }),
      }),
    );
  };

  const selectItem = (item: string) => {
    if (item === AUTO_BRANCH_ITEM) {
      setDraftThreadContext(draftTarget, { worktreeBranch: null });
      close();
    } else if (item.startsWith(CREATE_BRANCH_PREFIX)) {
      setDraftThreadContext(draftTarget, {
        worktreeBranch: { kind: "new", name: item.slice(CREATE_BRANCH_PREFIX.length) },
      });
      close();
    } else {
      const ref = refByName.get(item);
      if (ref) void selectRef(ref);
    }
  };

  const renderItem = (item: string, index: number) => {
    if (item === AUTO_BRANCH_ITEM) {
      return (
        <ComboboxItem
          key={item}
          hideIndicator
          index={index}
          value={item}
          onClick={() => selectItem(item)}
        >
          <span className="truncate">
            <T>Auto-named branch</T>
          </span>
        </ComboboxItem>
      );
    }
    if (item === createItem) {
      return (
        <ComboboxItem
          key={item}
          hideIndicator
          index={index}
          value={item}
          onClick={() => selectItem(item)}
        >
          <span className="truncate">{gt('Create new branch "{name}"', { name: newName })}</span>
        </ComboboxItem>
      );
    }
    const ref = refByName.get(item);
    if (!ref) return null;
    return (
      <BranchPickerRefItem
        branch={ref}
        projectCwd={projectCwd}
        index={index}
        value={item}
        onClick={() => selectItem(item)}
      />
    );
  };

  return (
    <BranchPicker
      items={items}
      filteredItems={filteredItems}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
      onSelectItem={selectItem}
      value={choice?.kind === "new" ? null : (draftThread?.branch ?? null)}
      query={query}
      onQueryChange={setQuery}
      hasNextPage={branches.data?.nextCursor !== null && branches.data?.nextCursor !== undefined}
      isFetchingNextPage={branches.isFetchingNextPage}
      onLoadNext={branches.loadNext}
      statusText={null}
      renderItem={renderItem}
      getItemType={(item) =>
        item === AUTO_BRANCH_ITEM ? "auto-branch" : item === createItem ? "create-branch" : "branch"
      }
      popupProps={{
        align: displayMode === "panel" ? "start" : "end",
        side: displayMode === "panel" ? "bottom" : "top",
        className: cn("flex flex-col", displayMode === "panel" ? "w-(--anchor-width)" : "w-80"),
        ...(displayMode === "toolbar" ? composerFloatingLayerProps : {}),
      }}
    >
      <span className={cn("flex min-w-0", className)}>
        <ComboboxTrigger
          render={
            displayMode === "panel" ? (
              <ThreadDetailsControl part="select" />
            ) : (
              <ComposerControl size="xs" />
            )
          }
          className="min-w-0 max-w-full active:scale-100"
          aria-label={gt("Branch: {branch}", { branch: label })}
        >
          <GitBranchIcon
            className={cn(
              "size-3 shrink-0",
              displayMode === "panel" && THREAD_DETAILS_PANEL_ICON_CLASS,
            )}
          />
          <ComposerContextLabel displayMode={displayMode}>
            <MiddleTruncate value={label} variant="cap-aligned" className="w-full" aria-hidden />
          </ComposerContextLabel>
        </ComboboxTrigger>
      </span>
    </BranchPicker>
  );
}
