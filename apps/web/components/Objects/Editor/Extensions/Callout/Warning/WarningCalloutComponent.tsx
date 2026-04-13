import { useEditorProvider } from '@components/Contexts/Editor/EditorContext';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import type { TypedNodeViewProps } from '@components/Objects/Editor/core';

interface CalloutOptions {
  dismissible?: boolean;
  variant?: 'default' | 'filled' | 'outlined';
  size?: 'sm' | 'md' | 'lg';
}

type WarningCalloutAttrs = CalloutOptions;

const WarningCalloutComponent = (props: TypedNodeViewProps<WarningCalloutAttrs>) => {
  const editorState = useEditorProvider();
  const { isEditable } = editorState;
  const [dismissed, setDismissed] = useState(false);

  // Extract options from props or use defaults
  const options: CalloutOptions = {
    dismissible: props.node?.attrs?.dismissible,
    variant: props.node?.attrs?.variant || 'default',
    size: props.node?.attrs?.size || 'md',
  };

  if (dismissed) return null;

  const getVariantClasses = () => {
    switch (options.variant) {
      case 'filled': {
        return 'bg-yellow-500 text-white';
      }
      case 'outlined': {
        return 'bg-transparent border-2 border-yellow-500 text-yellow-700';
      }
      default: {
        return 'bg-yellow-200 text-yellow-900';
      }
    }
  };

  const getSizeClasses = () => {
    switch (options.size) {
      case 'sm': {
        return 'py-1 px-2 text-sm';
      }
      case 'lg': {
        return 'py-3 px-4 text-lg';
      }
      default: {
        return 'py-2 px-3';
      }
    }
  };

  return (
    <NodeViewWrapper>
      <div
        className={cn(
          'w-full flex relative my-4 [&>svg]:p-0',
          'flex items-center rounded-lg shadow-inner',
          getVariantClasses(),
          getSizeClasses(),
          options.size === 'sm' ? 'max-sm:flex-row max-sm:items-center' : 'max-sm:flex-col max-sm:items-start',
        )}
      >
        <div
          className={cn(
            'flex items-center justify-center shrink-0 mr-2 pl-2 [&>svg]:w-5 [&>svg]:min-w-5 [&>svg]:h-5',
            options.size === 'sm'
              ? 'max-sm:self-center max-sm:mr-1'
              : 'max-sm:self-start max-sm:pt-2 max-sm:pl-[0.375rem]',
          )}
        >
          <AlertTriangle />
        </div>
        <div className="w-full grow break-words">
          <NodeViewContent
            className={cn(
              'm-[5px] p-2 rounded-lg',
              isEditable ? 'border-2 border-dashed border-muted/30' : 'border-none',
              options.size === 'sm'
                ? 'max-sm:mx-[3px] max-sm:my-[3px] max-sm:p-1'
                : 'max-sm:w-full max-sm:mx-0 max-sm:my-[5px] max-sm:p-2',
            )}
          />
        </div>
        {options.dismissible && !isEditable ? (
          <button
            className="ml-2 flex cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-1 hover:bg-black/10"
            onClick={() => {
              setDismissed(true);
            }}
          >
            <X size={16} />
          </button>
        ) : null}
      </div>
    </NodeViewWrapper>
  );
};

export default WarningCalloutComponent;
