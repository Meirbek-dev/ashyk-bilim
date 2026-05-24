'use client';

import { ChevronLeft, ChevronRight, Clock, HelpCircle, LayoutGrid, List, Play, Rocket, Send } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { CodeChallengeProblem, CodeVerdict } from '../domain';
import { verdictLabel, verdictTone } from '../domain';

interface CodeArenaHeaderProps {
  problem: CodeChallengeProblem;
  verdict: CodeVerdict | null;
  isRunning: boolean;
  onRunCustom: () => void;
  onRunTests: () => void;
  onSubmit: () => void;
  onOpenShortcuts: () => void;
  disabled?: boolean;
}

export function CodeArenaHeader({
  problem,
  verdict,
  isRunning,
  onRunCustom,
  onRunTests,
  onSubmit,
  onOpenShortcuts,
  disabled = false,
}: CodeArenaHeaderProps) {
  const [timeElapsed, setTimeElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="bg-muted/40 flex h-14 shrink-0 items-center justify-between border-b px-4">
      {/* Left: Breadcrumbs & Problem Select */}
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground hidden text-xs font-medium md:inline-block">
          Course / Challenges
        </span>
        <span className="text-muted-foreground hidden md:inline">/</span>
        
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5 font-semibold text-sm h-8"
              />
            }
          >
            <List className="size-4" />
            Problems
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem className="font-semibold">{problem.title}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs text-muted-foreground">Practice mode active</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="bg-border h-4 w-px" />

        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            disabled
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            disabled
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Center: Title & Info */}
      <div className="flex items-center gap-3 truncate">
        <h1 className="truncate text-sm font-semibold">{problem.title}</h1>
        {problem.difficulty ? (
          <Badge variant={difficultyTone(problem.difficulty)} className="text-[10px] py-0 px-1.5 uppercase font-bold">
            {problem.difficulty}
          </Badge>
        ) : null}
        {problem.points ? (
          <span className="text-muted-foreground hidden text-xs md:inline-block">
            {problem.points} pts
          </span>
        ) : null}
        {verdict ? (
          <Badge variant={verdictTone(verdict)} className="text-[10px] py-0 px-1.5 uppercase font-bold animate-pulse">
            {verdictLabel(verdict)}
          </Badge>
        ) : null}
      </div>

      {/* Right: Timer, Console Buttons, Fullscreen */}
      <div className="flex items-center gap-2">
        <div className="bg-muted text-muted-foreground flex h-8 items-center gap-1.5 rounded-md px-2.5 font-mono text-xs select-none">
          <Clock className="size-3.5" />
          {formatTime(timeElapsed)}
        </div>

        <div className="bg-border h-4 w-px" />

        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onRunCustom}
          disabled={disabled || isRunning}
          className="h-8 gap-1.5 text-xs"
        >
          <Play className="size-3.5" />
          Run
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onRunTests}
          disabled={disabled || isRunning}
          className="h-8 gap-1.5 text-xs"
        >
          <Rocket className="size-3.5" />
          Test
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onSubmit}
          disabled={disabled || isRunning}
          className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 gap-1.5 text-xs"
        >
          <Send className="size-3.5" />
          Submit
        </Button>

        <div className="bg-border h-4 w-px" />

        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onOpenShortcuts}
          className="size-8"
        >
          <HelpCircle className="size-4" />
        </Button>
        
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={() => {
            if (document.fullscreenElement) {
              void document.exitFullscreen();
            } else {
              void document.documentElement.requestFullscreen();
            }
          }}
          className="size-8"
        >
          <LayoutGrid className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function DropdownMenuSeparator() {
  return <div className="bg-border my-1 h-px" />;
}

function difficultyTone(difficulty: string): 'success' | 'warning' | 'destructive' | 'secondary' {
  if (difficulty === 'EASY') return 'success';
  if (difficulty === 'MEDIUM') return 'warning';
  if (difficulty === 'HARD') return 'destructive';
  return 'secondary';
}
