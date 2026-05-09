/**
 * Compound Card Component System
 *
 * Flexible, composable card primitives for gamification UI.
 * Supports compound pattern: <GamificationCard><Card.Header>...</Card.Header></GamificationCard>
 */

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { animations, spacing } from '../design-tokens';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

// ============================================================================
// Main Card Component
// ============================================================================

interface GamificationCardProps {
  title?: string;
  children: ReactNode;
  headerAction?: ReactNode;
  className?: string;
  animated?: boolean;
}

/**
 * Base card component with optional compound children
 */
export function GamificationCard({ title, children, headerAction, className, animated = true }: GamificationCardProps) {
  const CardWrapper = animated ? motion.div : 'div';
  const animationProps = animated
    ? {
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: animations.duration.normal / 1000 },
      }
    : {};

  return (
    <CardWrapper {...animationProps}>
      <Card className={cn('overflow-hidden', className)}>
        {title && (
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>{title}</CardTitle>
            {headerAction}
          </CardHeader>
        )}
        <CardContent className={cn(!title && 'py-0')}>{children}</CardContent>
      </Card>
    </CardWrapper>
  );
}

// ============================================================================
// Card.Header - Compound Component
// ============================================================================

interface CardHeaderCompoundProps {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  action?: ReactNode;
  className?: string;
}

function CardHeaderCompound({ icon: Icon, title, subtitle, badge, action, className }: CardHeaderCompoundProps) {
  return (
    <div className={cn('flex items-start justify-between', spacing.card.padding, 'pb-4', className)}>
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="bg-primary/10 mt-1 rounded-lg p-2">
            <Icon className="text-primary h-5 w-5" />
          </div>
        )}
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          {subtitle && <p className="text-muted-foreground text-sm">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {badge}
        {action}
      </div>
    </div>
  );
}

// ============================================================================
// Card.Content - Compound Component
// ============================================================================

interface CardContentCompoundProps {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}

function CardContentCompound({ children, className, padded = true }: CardContentCompoundProps) {
  return <div className={cn(padded && spacing.card.padding, className)}>{children}</div>;
}

// ============================================================================
// Card.Stat - Primitive Component
// ============================================================================

interface CardStatProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: number | 'up' | 'down' | 'neutral';
  trendLabel?: string;
  color?: string;
  className?: string;
  animated?: boolean;
}

function CardStat({ label, value, icon: Icon, trend, trendLabel, color, className, animated = true }: CardStatProps) {
  const trendInfo = getTrendInfo(trend);

  const StatWrapper = animated ? motion.div : 'div';
  const animationProps = animated
    ? {
        initial: { scale: 0.8, opacity: 0 },
        animate: { scale: 1, opacity: 1 },
        transition: { duration: animations.duration.fast / 1000 },
        whileHover: { scale: 1.02 },
      }
    : {};

  return (
    <StatWrapper
      {...animationProps}
      className={cn('group rounded-lg border bg-card p-4 transition-shadow hover:shadow-md', className)}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-muted-foreground text-sm font-medium">{label}</p>
          <p className={cn('mt-1 text-2xl font-bold tabular-nums', color)}>{value}</p>
          {(trend !== undefined || trendLabel) && (
            <div className="mt-2 flex items-center gap-1">
              {trendInfo.icon && <trendInfo.icon className={cn('h-3 w-3', trendInfo.color)} />}
              {trendLabel && <span className={cn('text-xs font-medium', trendInfo.color)}>{trendLabel}</span>}
            </div>
          )}
        </div>
        {Icon && (
          <div className={cn('rounded-lg bg-muted/50 p-2', color)}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </StatWrapper>
  );
}

// ============================================================================
// Card.MetricRow - Primitive Component
// ============================================================================

interface CardMetricRowProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  sublabel?: string;
  trend?: number | 'up' | 'down' | 'neutral';
  color?: string;
  className?: string;
}

function CardMetricRow({ label, value, icon: Icon, sublabel, trend, color, className }: CardMetricRowProps) {
  const trendInfo = getTrendInfo(trend);

  return (
    <div
      className={cn('flex items-center justify-between rounded-lg p-3 transition-colors hover:bg-muted/70', className)}
    >
      <div className="flex items-center gap-3">
        {Icon && (
          <div className={cn('rounded-lg bg-muted p-2', color)}>
            <Icon className="h-4 w-4" />
          </div>
        )}
        <div>
          <p className="text-sm font-medium">{label}</p>
          {sublabel && <p className="text-muted-foreground text-xs">{sublabel}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={cn('text-sm font-semibold tabular-nums', color)}>{value}</span>
        {trendInfo.icon && <trendInfo.icon className={cn('h-3 w-3', trendInfo.color)} />}
      </div>
    </div>
  );
}

// ============================================================================
// Card.TrendIndicator - Primitive Component
// ============================================================================

interface CardTrendIndicatorProps {
  value: number;
  label?: string;
  format?: 'percentage' | 'number';
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

function CardTrendIndicator({
  value,
  label,
  format = 'number',
  size = 'md',
  showIcon = true,
  className,
}: CardTrendIndicatorProps) {
  const trendInfo = getTrendInfo(value);
  const formattedValue = format === 'percentage' ? `${Math.abs(value)}%` : Math.abs(value).toString();

  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  return (
    <div className={cn('inline-flex items-center gap-1', className)}>
      {showIcon && trendInfo.icon && <trendInfo.icon className={cn(iconSizes[size], trendInfo.color)} />}
      <span className={cn('font-medium tabular-nums', sizeClasses[size], trendInfo.color)}>
        {value > 0 ? '+' : ''}
        {formattedValue}
      </span>
      {label && <span className={cn('text-muted-foreground', sizeClasses[size])}>{label}</span>}
    </div>
  );
}

// ============================================================================
// Card.Grid - Layout Helper
// ============================================================================

interface CardGridProps {
  children: ReactNode;
  columns?: 1 | 2 | 3 | 4;
  gap?: 'sm' | 'md' | 'lg';
  className?: string;
}

function CardGrid({ children, columns = 2, gap = 'md', className }: CardGridProps) {
  const columnClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
  };

  const gapClasses = {
    sm: 'gap-3',
    md: 'gap-4',
    lg: 'gap-6',
  };

  return <div className={cn('grid', columnClasses[columns], gapClasses[gap], className)}>{children}</div>;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getTrendInfo(trend?: number | 'up' | 'down' | 'neutral') {
  if (trend === undefined) return { icon: null, color: '' };

  if (trend === 'neutral' || trend === 0) {
    return {
      icon: Minus,
      color: 'text-muted-foreground',
    };
  }

  const isPositive = trend === 'up' || (typeof trend === 'number' && trend > 0);

  return {
    icon: isPositive ? TrendingUp : TrendingDown,
    color: isPositive ? 'text-green-500' : 'text-red-500',
  };
}

// ============================================================================
// Compound Pattern Exports
// ============================================================================

GamificationCard.Header = CardHeaderCompound;
GamificationCard.Content = CardContentCompound;
GamificationCard.Stat = CardStat;
GamificationCard.MetricRow = CardMetricRow;
GamificationCard.Trend = CardTrendIndicator;
GamificationCard.Grid = CardGrid;

// Export individual components for non-compound usage
export {
  CardHeaderCompound as CardHeader,
  CardContentCompound as CardContent,
  CardStat,
  CardMetricRow,
  CardTrendIndicator,
  CardGrid,
};
