import { cn } from '@/lib/utils';

interface BarLoaderProps {
  width?: number;
  color?: string;
  className?: string;
  cssOverride?: React.CSSProperties;
}

export const BarLoader: React.FC<BarLoaderProps> = ({ width = 60, color = '#000000', className, cssOverride }) => {
  return (
    <>
      <style>
        {`
          @keyframes bar-loader-slide {
            0% {
              transform: translateX(-100%);
            }
            50% {
              transform: translateX(0%);
            }
            100% {
              transform: translateX(100%);
            }
          }
        `}
      </style>
      <div
        className={cn('bar-loader', className)}
        style={{
          width: `${width}px`,
          height: '4px',
          backgroundColor: 'rgba(255, 255, 255, 0.2)',
          borderRadius: '2px',
          overflow: 'hidden',
          position: 'relative',
          ...cssOverride,
        }}
      >
        <div
          className="bar-loader-fill"
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: color,
            borderRadius: 'inherit',
            transform: 'translateX(-100%)',
            animation: 'bar-loader-slide 1.5s ease-in-out infinite',
          }}
        />
      </div>
    </>
  );
};
