import type { Editor } from '@tiptap/react';
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { extractHeadingOutline } from '@components/Objects/Editor/core';

interface TableOfContentsProps {
  editor: Editor | null;
}

const TableOfContents = ({ editor }: TableOfContentsProps) => {
  const [headings, setHeadings] = useState<ReturnType<typeof extractHeadingOutline>>([]);

  useEffect(() => {
    if (!editor) return;

    const updateHeadings = () => {
      setHeadings(extractHeadingOutline(editor.state.doc));
    };

    editor.on('update', updateHeadings);
    updateHeadings();

    return () => {
      editor.off('update', updateHeadings);
    };
  }, [editor]);

  if (headings.length === 0) return null;

  return (
    <div className="m-0 flex h-fit w-full flex-col items-stretch border-0 bg-transparent p-0 shadow-none">
      <ul className="m-0 !list-none !p-0">
        {headings.map((heading, index) => (
          <li
            key={index}
            style={{ paddingLeft: `${(heading.level - 1) * 1}rem` }}
            className="my-2 flex !list-none items-start gap-1"
          >
            <span className="text-foreground mt-[0.1rem] flex shrink-0 items-center">
              <Check
                size={15}
                strokeWidth={1.7}
              />
            </span>
            <a
              style={{
                fontWeight: heading.level === 1 ? 500 : 400,
                fontSize: heading.level === 1 ? '1rem' : heading.level === 2 ? '0.97rem' : '0.95rem',
              }}
              className="text-foreground hover:text-primary block min-w-0 flex-1 bg-transparent p-0 leading-[1.4] break-words hyphens-auto no-underline transition-none"
              href={`#${heading.id}`}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default TableOfContents;
