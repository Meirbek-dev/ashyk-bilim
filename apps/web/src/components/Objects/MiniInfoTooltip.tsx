import { motion } from 'motion/react';
import { X } from 'lucide-react';
import type React from 'react';

interface MiniInfoTooltipProps {
  icon?: React.ReactNode;
  message: string;
  onClose: () => void;
  iconColor?: string;
  iconSize?: number;
  width?: string;
}

export default function MiniInfoTooltip({
  icon,
  message,
  onClose,
  iconColor = 'text-teal-600',
  iconSize = 20,
  width = 'w-48',
}: MiniInfoTooltipProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className={`soft-shadow bg-background absolute -top-20 left-1/2 -translate-x-1/2 rounded-lg p-3 ${width}`}
    >
      <div className="flex items-center space-x-3">
        {icon ? (
          <div
            className={`${iconColor} shrink-0`}
            style={{ width: iconSize, height: iconSize }}
          >
            {icon}
          </div>
        ) : null}
        <p className="text-sm text-gray-700">{message}</p>
      </div>
      <div className="bg-background absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45" />
      <button
        onClick={onClose}
        className="absolute top-1 right-1 text-gray-400 hover:text-gray-600"
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}
