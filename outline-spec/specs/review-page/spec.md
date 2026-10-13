# review-page
A rendered page a developer reads to check a change before approving it.

1. Review command: `outline-spec review <change>` SHALL render the change's review page to one self-contained HTML file and print its path.
  a. The file goes under the operating system's temp directory, in a folder for the project, named for the change, so it never appears in the project's working tree.
  b. Paths are built with the platform's path rules, so the command works the same on macOS, Linux, and Windows.
  c. Each run overwrites the change's previous file.
  d. With `--json`, the command prints the file path, the change name, the recorded page link if any, and whether the page is enabled, and prints `enabled: false` with no path when the page is off.
  e. `--for <workflow>` renders only when `review-on` includes that workflow, and otherwise reports `enabled: false` and writes nothing.
  f. `--url <link>` records the page's published link in the change's `.outline-spec.yaml` without rendering.
  g. An unknown change name fails with the list of open changes, as `outline-spec status` does.
  h. `--out <path>` writes the file to that path instead, resolved against the current directory with the platform's path rules and creating missing parent folders, so an agent can render into a folder its page tool publishes from.
2. Tabs: The page SHALL show one tab per entry in the schema's review block, in order, the first tab open.
  a. A file tab renders the listed change files as Markdown, in the listed order, skipping any file the change does not have.
  b. A file tab whose files are all missing is left off the page.
  c. In the outline, struck text shows as removed and bold text in an edit shows as added, so edits read as a diff.
  d. Mermaid code blocks render as diagrams fit to the tab's width; clicking one opens it in a lightbox the developer can zoom and pan, and Escape or a click outside closes it.
  e. A view tab shows a view the CLI computes; `spec-changes` is the one view.
3. Spec changes view: The `spec-changes` view SHALL list every spec the change touches, and under each, every requirement it adds, edits, or removes.
  a. Each requirement is tagged added, edited, or removed, and each spec is tagged new or removed when the change creates or deletes it.
  b. An edited requirement shows its live text beside the text it will have after archive, with the changed words marked.
  c. An added requirement shows its full text, and a removed one shows the live text it drops.
  d. Table edits show the changed cells, rows, and columns, as `outline-spec pending` reports them.
4. Banner: The page SHALL open with a banner stating whether the change passes `outline-spec validate`, listing each error when it fails.
  a. The banner names every other open change that touches the same requirements, with the requirements they share.
  b. A change that validates and overlaps nothing shows a one-line passing banner.
5. Schema review block: A schema SHALL declare its review page in a `review` block of `schema.yaml`, with the page template and the tabs.
  a. Each tab has a `title` and either `from`, a list of change files, or `view`, the name of a computed view.
  b. The `template` names an HTML file in the schema's templates folder; a forked schema can replace it.
  c. `outline-spec schema validate` reports a tab with neither or both of `from` and `view`, an unknown view, and a missing template file.
  d. A schema with no review block has no review page, and `outline-spec review` says so.
  e. The `outline` schema ships a review block with three tabs: Outline from `outline.md`, Diagrams from `diagrams.md`, and Spec changes from the `spec-changes` view.
6. Project overrides: A project SHALL control the page from `outline-spec/config.yaml` without forking its schema.
  a. `review-on` lists the workflows that produce the page, from `propose` and `update`; it defaults to both, and `review-on: []` turns the page off.
  b. `review.tabs` replaces the schema's tabs, in the same form as the schema's review block.
  c. An unknown workflow in `review-on` or an invalid tab is warned about and ignored, and the rest of the config still loads (see `config-loading`).
7. Publishing from workflows: The propose and update workflows SHALL render the review page when `review-on` includes them, the agent can publish a page, and a developer is in the session.
  a. Propose renders the page once every planning artifact exists.
  b. Update renders the page after a revision that changes `outline.md`, and skips it when only other artifacts changed.
  c. The agent publishes the page privately, as a page only the developer can see, and opens it for the developer.
  d. The first publish records the page's link in the change's `.outline-spec.yaml`, and later publishes update the page at that link and open it again.
  e. An agent that cannot publish pages gives the developer the file path instead.
  f. When `review-on` excludes the workflow, the workflow does not render the page or mention it.
  g. When no developer is in the session, as for a subagent, a headless or scripted run, or CI, the workflow does not render, publish, or open the page, and does not mention it.
