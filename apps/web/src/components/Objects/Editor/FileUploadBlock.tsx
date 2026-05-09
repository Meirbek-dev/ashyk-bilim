'use client';

import type { ButtonHTMLAttributes, FC, HTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Upload } from 'lucide-react';

import { cn } from '@/lib/utils';

const FileUploadBlockInput: FC<InputHTMLAttributes<HTMLInputElement> & { ariaLabel?: string }> = ({
  onChange,
  className,
  ariaLabel,
  ...props
}) => {
  const t = useTranslations('DashPage.Editor.FileUploadBlock');
  return (
    <input
      className={cn(
        'cursor-pointer rounded-lg p-3 file:mr-4 file:rounded-full file:border-0 file:file:bg-gray-200 file:px-4 file:py-2 file:text-gray-500 hover:file:cursor-pointer',
        className,
      )}
      onChange={onChange}
      type="file"
      required
      aria-label={ariaLabel || t('selectFile')}
      title={ariaLabel || t('selectFile')}
      {...props}
    />
  );
};

const FileUploadBlockButton: FC<ButtonHTMLAttributes<HTMLButtonElement>> = ({ onClick, className, ...props }) => {
  const t = useTranslations('DashPage.Editor.FileUploadBlock');
  return (
    <button
      className={cn(
        'flex items-center space-x-2 rounded-lg bg-gray-200 p-2 px-3 text-gray-500 transition enabled:hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      onClick={onClick}
      {...props}
    >
      <Upload />
      <p>{t('submit')}</p>
    </button>
  );
};

type UploadBlockComponentProps = {
  isLoading: boolean;
  isEditable: boolean;
  isEmpty: boolean;
  Icon: any;
  children: ReactNode;
} & HTMLAttributes<HTMLDivElement>;

const FileUploadBlock = ({ isLoading, isEditable, isEmpty, Icon, children }: UploadBlockComponentProps) => {
  const t = useTranslations('DashPage.Editor.FileUploadBlock');

  if (isLoading) {
    return (
      <Loader2
        className="animate-spin text-gray-200"
        size={50}
      />
    );
  }

  if (!isEditable && isEmpty) {
    return (
      <div className="flex items-center gap-5">
        <Icon
          className="text-gray-200"
          size={50}
        />
        <p>{t('noFilePreview')}</p>
      </div>
    );
  }

  return (
    <>
      <Icon
        className="text-gray-200"
        size={50}
      />
      {children}
    </>
  );
};

const FileUploadBlockWrapper = ({ children, isEmpty, ...props }: UploadBlockComponentProps) => {
  return (
    isEmpty && (
      <div
        className="border-gray-150 flex items-center justify-center space-x-3 rounded-xl border-2 border-dashed bg-gray-50 px-3 py-7 text-sm text-gray-900"
        contentEditable={false}
      >
        <FileUploadBlock
          isEmpty
          {...props}
        >
          {children}
        </FileUploadBlock>
      </div>
    )
  );
};

export { FileUploadBlockWrapper as FileUploadBlock, FileUploadBlockButton, FileUploadBlockInput };
