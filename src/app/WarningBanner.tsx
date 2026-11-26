import { TriangleAlert } from 'lucide-react';

export function WarningBanner({ children }: { children: string }) {
  return (
    <div className="warning-banner" role="alert">
      <TriangleAlert aria-hidden size={20} />
      <p>
        <strong>Warning:</strong> {children}
      </p>
    </div>
  );
}
