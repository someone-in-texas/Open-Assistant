import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownView } from "../../apps/extension/src/sidebar/markdown.js";

describe("model Markdown rendering", () => {
  it("renders model HTML and event handlers as inert text", () => {
    const output = renderToStaticMarkup(
      <MarkdownView markdown={'<img src=x onerror="alert(1)"> <script>alert(2)</script>'} />,
    );
    expect(output).toContain("&lt;img");
    expect(output).toContain("&lt;script&gt;");
    expect(output).not.toContain("<img");
    expect(output).not.toContain("<script");
  });

  it("drops unsafe link destinations and hardens HTTPS links", () => {
    const output = renderToStaticMarkup(
      <MarkdownView
        markdown={
          "[bad](javascript:alert(1)) [data](data:text/html,x) [safe](https://example.com/path)"
        }
      />,
    );
    expect(output).not.toContain("javascript:");
    expect(output).not.toContain("data:text");
    expect(output).toContain('href="https://example.com/path"');
    expect(output).toContain('rel="noopener noreferrer"');
  });

  it("keeps code blocks inert and renders bounded structural Markdown", () => {
    const output = renderToStaticMarkup(
      <MarkdownView
        markdown={
          '# Heading\n- one\n- **two**\n> quote\n```html\n<button onclick="pay()">Pay</button>\n```'
        }
      />,
    );
    expect(output).toContain("<h1>Heading</h1>");
    expect(output).toContain("<ul>");
    expect(output).toContain("<blockquote>quote</blockquote>");
    expect(output).toContain("&lt;button");
    expect(output).not.toContain("<button");
  });
});
