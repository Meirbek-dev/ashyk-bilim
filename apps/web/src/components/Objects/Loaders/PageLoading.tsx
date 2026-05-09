'use client';
import { Spinner } from '@components/ui/spinner';

const PageLoading = () => {
  return (
    <div className="fixed inset-0 flex items-center justify-center">
      <Spinner className="size-10" />
    </div>
  );
};

export default PageLoading;
