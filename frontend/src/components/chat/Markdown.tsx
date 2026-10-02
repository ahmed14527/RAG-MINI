import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { linkCitations } from "@/lib/format";

function Markdown({
  content,
  sourceIds,
  onCite,
}: {
  content: string;
  sourceIds: number[];
  onCite: (id: number) => void;
}) {
  const components: Components = {
    a({ href, children }) {
      const cite = href?.match(/^#cite-(\d+)$/);
      if (cite) {
        const id = Number(cite[1]);
        return (
          <button
            type="button"
            onClick={() => onCite(id)}
            className="citation mx-0.5 inline-grid h-[1.15rem] min-w-[1.15rem] -translate-y-px place-items-center rounded-md bg-accent-soft px-1 align-middle text-[11px] font-semibold text-accent tabular-nums transition-colors hover:bg-accent hover:text-accent-fg"
            aria-label={`Show source ${id}`}
          >
            {id}
          </button>
        );
      }
      return (
        <a href={href} target="_blank" rel="noreferrer noopener">
          {children}
        </a>
      );
    },
  };

  return (
    <div className="prose-answer">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {linkCitations(content, sourceIds)}
      </ReactMarkdown>
    </div>
  );
}

export default memo(Markdown);
