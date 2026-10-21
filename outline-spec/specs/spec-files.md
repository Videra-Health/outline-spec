# spec-files
Where live specs live on disk, how a spec's id maps to its file, and how specs in the old folder layout move to it.

1. Spec file layout: Each live spec is one Markdown file under `outline-spec/specs/`, named for its id plus `.md`.  
  a. A spec with id `cli-list` is `outline-spec/specs/cli-list.md`.  
  b. A nested id names folders for its leading segments, so `platform/session-layout` is `outline-spec/specs/platform/session-layout.md`.  
  c. A spec's id is its path under `outline-spec/specs/` without `.md`, written with forward slashes in output and outlines on every platform, including Windows.  
  d. Files and folders whose names start with a dot are ignored, and so are files not ending in `.md`.  
  e. A spec and a folder of the same name can sit side by side, so `platform.md` and `platform/session-layout.md` are two specs.  
  f. Creating a spec makes any area folders it needs; deleting one removes area folders it leaves empty and never `outline-spec/specs/` itself.  
  g. Ids match folder and file names exactly; on a case-insensitive file system, two ids that differ only in case are reported as a conflict.

2. Old layout is refused: Every command that reads live specs refuses to run while any spec is still in the old layout, and says how to move it.  
  a. A spec is in the old layout when a file named `spec.md` sits in a folder under `outline-spec/specs/`.  
  b. The error lists each old-layout spec by path and tells the user to run `outline-spec migrate-specs`, then exits non-zero.  
  c. With `--json`, the error is a JSON object whose code says the specs need migrating and which lists the old-layout paths.  
  d. A referenced repo or store whose specs are in the old layout gets the same error, naming that repo's root.  
  e. `migrate-specs` and `init` are the only commands that run while old-layout specs remain.

3. Moving to the flat layout: `outline-spec migrate-specs` moves every old-layout spec to its flat file before converting any spec format.  
  a. `outline-spec/specs/<id>/spec.md` moves to `outline-spec/specs/<id>.md`, with nested ids keeping their area folders.  
  b. Inside a git work tree the move is a git rename, so history follows the file; outside git it is a plain file move.  
  c. A folder the move leaves empty is removed; a folder that still holds other files is kept, and the report names them.  
  d. When `<id>.md` already exists, that spec is not moved and is reported as a conflict, and the command exits non-zero after moving the rest.  
  e. `--dry-run` lists each move and conflict without touching any file, and `--json` reports them as `{ from, to }` pairs and conflicts.  
  f. Running it on specs already in the flat layout moves nothing and says so.  
  g. `outline-spec adopt` writes each spec it adopts in the flat layout.
