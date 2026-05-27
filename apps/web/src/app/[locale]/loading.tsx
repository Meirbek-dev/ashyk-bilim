import { Spinner } from '@/components/ui/spinner';

export default function Loading() {
  return (
    <main className="flex min-h-svh items-center justify-center">
      <Spinner className="size-8" />
    </main>
  );
}
