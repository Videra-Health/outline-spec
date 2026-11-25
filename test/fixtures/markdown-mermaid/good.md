# Good

```mermaid
sequenceDiagram
    participant WF as workflow
    participant CLI as outline-spec
    WF->>CLI: validate --markdown
    CLI-->>WF: exit 0
```
