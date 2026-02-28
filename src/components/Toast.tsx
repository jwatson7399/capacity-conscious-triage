import { useEffect } from 'react';

interface Props {
  message: string;
  onDismiss: () => void;
  durationMs?: number;
}

export default function Toast({ message, onDismiss, durationMs = 3000 }: Props) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [onDismiss, durationMs]);

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium">
      {message}
    </div>
  );
}
