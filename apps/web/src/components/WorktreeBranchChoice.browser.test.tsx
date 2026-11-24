import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProjectId, ThreadId, type VcsRef } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

const ref = (name: string, worktreePath: string | null = null, isRemote = false): VcsRef => ({
  name,
  current: false,
  isDefault: false,
  worktreePath,
  ...(isRemote ? { isRemote: true } : {}),
});
const REFS = [
  ref("develop"),
  ref("main", "/repo"),
  ref("feature/in-tree", "/work/tree"),
  ref("origin/feature/remote-only", null, true),
];

vi.mock(import("../state/queries"), async (original) => ({
  ...(await original()),
  usePaginatedBranches: (target) => {
    const refs = REFS.filter((candidate) => candidate.name.includes(target.query ?? ""));
    return {
      data: {
        refs,
        isRepo: true,
        hasPrimaryRemote: true,
        nextCursor: null,
        totalCount: refs.length,
      },
      refs,
      error: null,
      isPending: false,
      isFetchingNextPage: false,
      refresh: () => {},
      loadNext: () => {},
    };
  },
}));
vi.mock(import("../state/query"), async (original) => ({
  ...(await original()),
  useEnvironmentQuery: (() => ({ data: { workingTree: { rootPath: "/repo" } } })) as never,
}));
// The holder's live HEAD still has the branch, so the list is confirmed as is.
vi.mock(import("../state/use-atom-command"), async (original) => ({
  ...(await original()),
  useAtomCommand: (() => async (input: { input: { query: string } }) => ({
    _tag: "Success",
    value: {
      refs: REFS.filter((candidate) => candidate.name === input.input.query).map((candidate) => ({
        ...candidate,
        current: true,
      })),
    },
  })) as never,
}));

import "~/index.css";
import { render } from "../../test/render";
import { DraftId, useComposerDraftStore } from "../composerDraftStore";
import { WorktreeBranchChoice } from "./WorktreeBranchChoice";

const environmentId = EnvironmentId.make("primary");
const projectId = ProjectId.make("project-a");
const threadId = ThreadId.make("thread-branch-choice");
const draftId = DraftId.make("draft-branch-choice");

// Rows with a slash or a badge compose odd accessible names, so read the highlighted row's text.
const waitForHighlighted = (text: string) =>
  vi.waitFor(() =>
    expect(document.querySelector('[role="option"][data-highlighted]')?.textContent).toContain(
      text,
    ),
  );

// A draft heading for a new worktree on `main`, removed when the test ends.
function seedDraft() {
  const reset = () => useComposerDraftStore.setState(useComposerDraftStore.getInitialState(), true);
  reset();
  useComposerDraftStore
    .getState()
    .setProjectDraftThreadId(scopeProjectRef(environmentId, projectId), draftId, {
      threadId,
      envMode: "worktree",
      branch: "main",
    });
  return { [Symbol.dispose]: reset };
}

const draft = () => useComposerDraftStore.getState().getDraftSession(draftId);

const renderChoice = () =>
  render(
    <WorktreeBranchChoice
      environmentId={environmentId}
      threadId={threadId}
      projectId={projectId}
      draftId={draftId}
      projectCwd="/repo"
    />,
  );

describe("WorktreeBranchChoice", () => {
  it("starts on an auto-named branch", async () => {
    using _draft = seedDraft();
    await using screen = await renderChoice();
    await expect.element(screen.getByRole("combobox")).toHaveTextContent("Auto-named branch");
  });

  it("checks a free branch out into the new worktree", async () => {
    using _draft = seedDraft();
    await using screen = await renderChoice();
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(page.getByRole("option", { name: "develop" }));

    expect(draft()).toMatchObject({
      branch: "develop",
      envMode: "worktree",
      worktreePath: null,
      worktreeBranch: { kind: "existing" },
    });
  });

  it("names a new branch from what the user typed, leaving Start from alone", async () => {
    using _draft = seedDraft();
    await using screen = await renderChoice();
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.type(page.getByPlaceholder("Search refs..."), "brand-new");
    await userEvent.click(page.getByRole("option", { name: /Create new branch "brand-new"/ }));

    expect(draft()).toMatchObject({
      branch: "main",
      worktreeBranch: { kind: "new", name: "brand-new" },
    });
  });

  it("starts a remote-only branch as a new local branch from the remote ref", async () => {
    using _draft = seedDraft();
    await using screen = await renderChoice();
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.type(page.getByPlaceholder("Search refs..."), "remote-only");
    await waitForHighlighted("origin/feature/remote-only");
    await userEvent.keyboard("{Enter}");

    expect(draft()).toMatchObject({
      branch: "origin/feature/remote-only",
      worktreeBranch: { kind: "new", name: "feature/remote-only" },
    });
  });

  it("moves the thread to the worktree that already has the branch", async () => {
    using _draft = seedDraft();
    await using screen = await renderChoice();
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.type(page.getByPlaceholder("Search refs..."), "in-tree");
    await waitForHighlighted("feature/in-tree");
    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() =>
      expect(draft()).toMatchObject({
        branch: "feature/in-tree",
        worktreePath: "/work/tree",
        envMode: "local",
      }),
    );
    expect(draft()?.worktreeBranch).toBeUndefined();
  });

  it("moves the thread back to the local checkout for the branch it has", async () => {
    using _draft = seedDraft();
    await using screen = await renderChoice();
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(page.getByRole("option", { name: "main" }));

    await vi.waitFor(() =>
      expect(draft()).toMatchObject({ branch: "main", worktreePath: null, envMode: "local" }),
    );
  });

  it("returns to an auto-named branch", async () => {
    useComposerDraftStore.getState().setDraftThreadContext(draftId, {
      worktreeBranch: { kind: "new", name: "feature/x" },
    });
    using _draft = seedDraft();
    await using screen = await renderChoice();
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(page.getByRole("option", { name: "Auto-named branch" }));

    expect(draft()?.worktreeBranch).toBeUndefined();
    expect(draft()?.envMode).toBe("worktree");
  });
});
