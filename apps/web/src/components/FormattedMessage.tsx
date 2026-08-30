import React from 'react';

interface FormattedMessageProps {
  content: string;
  isUser?: boolean;
}

// Parses inline formatting like **bold**, `code`, etc.
function renderInline(text: string): React.ReactNode[] {
  // Regex to match **bold** or `code`
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const inner = part.slice(2, -2);
      return (
        <strong key={index} className="font-bold text-slate-950 font-sans">
          {inner}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      const inner = part.slice(1, -1);
      return (
        <code
          key={index}
          className="font-mono text-xs bg-orange-50 text-orange-800 border border-orange-200/60 px-1.5 py-0.5 rounded font-semibold"
        >
          {inner}
        </code>
      );
    }
    return part;
  });
}

export function FormattedMessage({ content, isUser = false }: FormattedMessageProps) {
  if (isUser) {
    return <span className="whitespace-pre-wrap">{content}</span>;
  }

  // Split content into blocks (paragraphs, headers, list items)
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let currentList: { type: 'ul' | 'ol'; items: React.ReactNode[] } | null = null;

  const flushList = () => {
    if (currentList) {
      if (currentList.type === 'ul') {
        elements.push(
          <ul key={`list-${elements.length}`} className="space-y-1.5 my-2.5 pl-1">
            {currentList.items.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-slate-800 text-sm leading-relaxed">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500 mt-2 shrink-0" />
                <span className="flex-1">{item}</span>
              </li>
            ))}
          </ul>
        );
      } else {
        elements.push(
          <ol key={`list-${elements.length}`} className="space-y-2 my-2.5 pl-1">
            {currentList.items.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-slate-800 text-sm leading-relaxed">
                <span className="h-5 w-5 rounded-full bg-orange-100 text-orange-800 border border-orange-200 text-[11px] font-bold font-mono flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span className="flex-1">{item}</span>
              </li>
            ))}
          </ol>
        );
      }
      currentList = null;
    }
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();

    if (!line) {
      flushList();
      return;
    }

    // Header with ### or standalone **Heading**
    const isMarkdownHeader = line.startsWith('#');
    const isStandaloneBoldHeader = /^(\*\*)[^*]+(\*\*)$/.test(line) && line.length < 60;

    if (isMarkdownHeader || isStandaloneBoldHeader) {
      flushList();
      let headerText = line;
      if (isMarkdownHeader) {
        headerText = line.replace(/^#+\s*/, '');
      } else if (isStandaloneBoldHeader) {
        headerText = line.slice(2, -2);
      }

      elements.push(
        <div key={`header-${idx}`} className="pt-2 pb-1 first:pt-0">
          <h4 className="text-sm font-extrabold text-slate-950 font-display-serif tracking-tight flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-orange-500" />
            <span>{headerText}</span>
          </h4>
        </div>
      );
      return;
    }

    // Task checklist item (- [ ] or - [x])
    const taskMatch = line.match(/^[-*•]\s*\[([ xX])\]\s*(.*)$/);
    if (taskMatch && taskMatch[1] !== undefined && taskMatch[2] !== undefined) {
      flushList();
      const isChecked = taskMatch[1].toLowerCase() === 'x';
      elements.push(
        <div
          key={`task-${idx}`}
          className="flex items-start gap-2.5 my-1.5 p-2.5 rounded-xl bg-gradient-to-r from-orange-50/60 to-amber-50/40 border border-orange-200/70 text-slate-900 text-xs shadow-xs"
        >
          <span
            className={`h-4 w-4 rounded-md border flex items-center justify-center shrink-0 mt-0.5 font-bold text-[11px] ${
              isChecked
                ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                : 'border-slate-300 bg-white text-slate-400'
            }`}
          >
            {isChecked ? '✓' : ''}
          </span>
          <div className="flex-1 text-slate-900 leading-relaxed font-medium">
            {renderInline(taskMatch[2])}
          </div>
        </div>
      );
      return;
    }

    // Unordered list item (- or *)
    const ulMatch = line.match(/^[-*•]\s+(.*)$/);
    if (ulMatch && ulMatch[1] !== undefined) {
      if (!currentList || currentList.type !== 'ul') {
        flushList();
        currentList = { type: 'ul', items: [] };
      }
      currentList.items.push(renderInline(ulMatch[1]));
      return;
    }

    // Ordered list item (1. or 2.)
    const olMatch = line.match(/^\d+\.\s+(.*)$/);
    if (olMatch && olMatch[1] !== undefined) {
      if (!currentList || currentList.type !== 'ol') {
        flushList();
        currentList = { type: 'ol', items: [] };
      }
      currentList.items.push(renderInline(olMatch[1]));
      return;
    }

    // Regular paragraph
    flushList();
    elements.push(
      <p key={`p-${idx}`} className="text-sm text-slate-800 leading-relaxed my-1.5 first:mt-0 last:mb-0">
        {renderInline(line)}
      </p>
    );
  });

  flushList();

  return <div className="space-y-1 text-sm">{elements}</div>;
}
