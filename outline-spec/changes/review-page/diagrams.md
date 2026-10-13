# Diagrams

How a propose ends with a page, and how an update republishes it.

<sub>Propose and update flow</sub>

```mermaid
sequenceDiagram
  participant S as Skill (propose/update)
  participant C as outline-spec CLI
  participant A as Agent page tool
  S->>C: review <change> --for propose --json
  alt review-on excludes workflow
    C-->>S: enabled: false
  else enabled
    C->>C: validate + pending + planChange, fill template
    C-->>S: path, reviewUrl?
    alt agent can publish
      S->>A: publish path (at reviewUrl if set)
      A-->>S: link
      S->>C: review <change> --url <link>
    else no page tool
      S-->>S: give developer the path
    end
  end
```

Where each setting comes from; config wins over schema.

<sub>Resolution of review settings</sub>

| Setting | Schema `review` block | `config.yaml` | Default |
|---|---|---|---|
| Which workflows render | — | `review-on` | `[propose, update]` |
| Tabs | `tabs` | `review.tabs` (replaces) | outline schema's three tabs |
| Template | `template` (fork to replace) | — | `review.html` |

<sub>Default page</sub>

```
┌ review-page ─────────────────────────────────────────┐
│ ✓ Valid · overlaps add-foo on review-page.Tabs       │
├──────────┬───────────┬──────────────────────────────┤
│ Outline  │ Diagrams  │ Spec changes                 │
├──────────┴───────────┴──────────────────────────────┤
│ review-page  NEW                                     │
│   Review command   ADDED   …                         │
│ config-loading                                       │
│   Use resilient field-by-field parsing   EDITED      │
│     live │ after archive (changed words marked)      │
└──────────────────────────────────────────────────────┘
```
