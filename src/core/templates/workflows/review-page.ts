/**
 * The review page step shared by the propose and update workflows.
 */

/** Renders, publishes, and records the change's review page; `workflow` is the `--for` value. */
export function reviewPageStep(workflow: 'propose' | 'update'): string {
  return `render the page the developer reads to check the change:
   \`\`\`bash
   outline-spec review "<name>" --for ${workflow} --out "<folder>/review-<name>.html" --json
   \`\`\`
   Pick \`<folder>\` so your page tool can publish from it; in Claude Code, that is your scratchpad directory. Without a page tool, omit \`--out\`.
   - \`enabled: false\`: the project turned the page off for this workflow. Skip the rest of this step and don't mention the page.
   - If you can publish a private HTML page (for example, Claude Code's Artifact tool), publish the file at \`path\` so only the developer can see it, and open it for them. When the JSON has \`reviewUrl\`, publish to that link so the developer keeps one page. After the first publish, record the link: \`outline-spec review "<name>" --url "<link>"\`.
   - Otherwise, give the developer the file at \`path\` to open in a browser.`;
}
