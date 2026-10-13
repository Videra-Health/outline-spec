# Diagrams

A file tab now picks how to show each file by its extension, and a glob that matches nothing drops the tab.

<sub>File tab rendering</sub>

```mermaid
flowchart LR
    from["from entries"] --> glob{"glob?"}
    glob -- yes --> match["files in the change folder, by name"]
    glob -- no --> exists["the file, if present"]
    match --> any{"any files?"}
    exists --> any
    any -- no --> drop["tab left off"]
    any -- yes --> ext{"extension"}
    ext -- ".md" --> md["Markdown, Mermaid drawn"]
    ext -- ".html" --> frame["sandboxed frame, resizable"]
```

Where a design lives across a change's life.

<sub>Design lifecycle</sub>

| Step | designs/ | Review page |
|---|---|---|
| Propose, visual change | Written | Designs tab |
| Propose, no visual change | Skipped | No Designs tab |
| Update edits a design | Edited | Re-rendered |
| Archive | Deleted with the change | — |
