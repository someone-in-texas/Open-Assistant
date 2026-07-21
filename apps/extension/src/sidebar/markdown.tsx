import { isSafeExternalUrl } from "@open-assistant/prompt-security";
import { Fragment, type ReactNode } from "react";

function inlineMarkdown(text: string): ReactNode[] {
  const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^)\n]+\))/gu;
  const output: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index;
    if (index > cursor) output.push(text.slice(cursor, index));
    const token = match[0];
    if (token.startsWith("`")) {
      output.push(<code key={index}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      output.push(<strong key={index}>{token.slice(2, -2)}</strong>);
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/u.exec(token);
      const label = link?.[1] ?? token;
      const url = link?.[2];
      output.push(
        url && isSafeExternalUrl(url) ? (
          <a key={index} href={url} target="_blank" rel="noopener noreferrer">
            {label}
          </a>
        ) : (
          label
        ),
      );
    }
    cursor = index + token.length;
  }
  if (cursor < text.length) output.push(text.slice(cursor));
  return output;
}

export function MarkdownView({ markdown }: { markdown: string }) {
  const lines = markdown.split("\n");
  const nodes: ReactNode[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.startsWith("```")) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").startsWith("```")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      nodes.push(
        <pre key={`code-${index}`}>
          <code>{code.join("\n")}</code>
        </pre>,
      );
    } else if (/^#{1,4}\s/u.test(line)) {
      const level = Math.min(4, line.match(/^#+/u)?.[0].length ?? 1);
      const content = line.replace(/^#{1,4}\s+/u, "");
      const Heading = `h${level}` as "h1" | "h2" | "h3" | "h4";
      nodes.push(<Heading key={`heading-${index}`}>{inlineMarkdown(content)}</Heading>);
    } else if (/^[-*]\s+/u.test(line)) {
      const items: string[] = [];
      let itemIndex = index;
      while (itemIndex < lines.length && /^[-*]\s+/u.test(lines[itemIndex] ?? "")) {
        items.push((lines[itemIndex] ?? "").replace(/^[-*]\s+/u, ""));
        itemIndex += 1;
      }
      nodes.push(
        <ul key={`list-${index}`}>
          {items.map((item, position) => (
            <li key={position}>{inlineMarkdown(item)}</li>
          ))}
        </ul>,
      );
      index = itemIndex - 1;
    } else if (line.startsWith("> ")) {
      nodes.push(<blockquote key={`quote-${index}`}>{inlineMarkdown(line.slice(2))}</blockquote>);
    } else if (line.trim()) {
      nodes.push(<p key={`paragraph-${index}`}>{inlineMarkdown(line)}</p>);
    } else {
      nodes.push(<Fragment key={`space-${index}`} />);
    }
  }
  return <>{nodes}</>;
}
