"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { brand } from "@/lib/branding";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

function CodeBlock({ className, children }: { className?: string; children: React.ReactNode }) {
  const [copied, setCopied] = React.useState(false);

  const lang = /language-(\w+)/.exec(className || "")?.[1] || "text";
  const raw = String(children).replace(/\n$/, "");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  // The theme is brand-forced (layout.tsx forcedTheme); next-themes'
  // resolvedTheme still reports the OS preference, which painted the One
  // Light palette onto the dark UI for light-preference viewers.
  const isDark = brand.theme === "dark";

  return (
    <div className="group relative my-3 overflow-hidden rounded-lg border border-border bg-muted">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
          {lang}
          {/* A ```ui fence is the console's own generative-UI format; in
              Markdown mode it would otherwise read as an unexplained JSON
              wall. Say where the rendered version lives. */}
          {lang === "ui" && (
            <span className="ml-2 font-sans normal-case">
              interactive block · set Chat rendering to Generative UI in Tweaks to render it
            </span>
          )}
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-background hover:text-foreground cursor-pointer"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <SyntaxHighlighter
        language={lang}
        style={isDark ? oneDark : oneLight}
        customStyle={{
          margin: 0,
          background: "transparent",
          padding: "0.75rem",
          fontSize: "0.78rem",
          lineHeight: 1.55,
        }}
        codeTagProps={{ style: { fontFamily: "var(--font-mono)" } }}
        wrapLongLines={false}
      >
        {raw}
      </SyntaxHighlighter>
    </div>
  );
}

export const Markdown = React.memo(function Markdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={cn("markdown-body", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className: c, children, ...props }) {
            const inline = !/\n/.test(String(children)) && !/language-/.test(c || "");
            if (inline) {
              return (
                <code className={c} {...props}>
                  {children}
                </code>
              );
            }
            return <CodeBlock className={c}>{children}</CodeBlock>;
          },
          pre({ children }) {
            return <>{children}</>;
          },
          ol({ start, node, ...props }) {
            // The CSS numbering uses a counter (globals.css), which ignores the
            // `start` attribute react-markdown emits for continued/non-1 lists.
            // Seed the counter from `start` so numbering matches the source.
            const style =
              typeof start === "number" && start !== 1
                ? { counterReset: `li ${start - 1}` }
                : undefined;
            return <ol style={style} {...props} />;
          },
          a({ children, ...props }) {
            return (
              <a target="_blank" rel="noopener noreferrer" {...props}>
                {children}
              </a>
            );
          },
          table({ children, ...props }) {
            // Wrap wide tables so they scroll inside their own box instead of
            // pushing the whole transcript into horizontal scroll.
            return (
              <div style={{ overflowX: "auto", maxWidth: "100%" }}>
                <table {...props}>{children}</table>
              </div>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
