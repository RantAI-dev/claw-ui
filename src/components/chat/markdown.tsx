"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useTheme } from "next-themes";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

function CodeBlock({ className, children }: { className?: string; children: React.ReactNode }) {
  const [copied, setCopied] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const { resolvedTheme } = useTheme();
  React.useEffect(() => setMounted(true), []);

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

  const isDark = mounted ? resolvedTheme === "dark" : true;

  return (
    <div className="group relative my-3 overflow-hidden rounded-lg border border-border bg-muted">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {lang}
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-background hover:text-foreground cursor-pointer"
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
          a({ children, ...props }) {
            return (
              <a target="_blank" rel="noopener noreferrer" {...props}>
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
