import './Skeleton.css';

interface SkeletonProps {
  /** Extra class that sets the reserved size (width/height or aspect-ratio). */
  className?: string;
}

/** Quiet placeholder shape. Decorative, no spinner. */
export function Skeleton({ className }: SkeletonProps) {
  return <div className={className ? `skeleton ${className}` : 'skeleton'} aria-hidden="true" />;
}
