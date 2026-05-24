'use client';

import {
  Download,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Upload,
  ArrowUp,
  ArrowDown,
  Info,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import type { CodeChallengeSettings, TestCase } from '@/services/courses/code-challenges';
import { generateUUID } from '@/lib/utils';

interface TestSuiteBuilderProps {
  draft: CodeChallengeSettings;
  onChange: (patch: Partial<CodeChallengeSettings>) => void;
}

export function TestSuiteBuilder({ draft, onChange }: TestSuiteBuilderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  const tests = [...(draft.visible_tests ?? []), ...(draft.hidden_tests ?? [])];
  
  // Find currently selected test case details
  const selectedTestCase = tests.find((t) => t.id === selectedCaseId) ?? null;

  const updateTest = (id: string, patch: Partial<TestCase>) => {
    const next = tests.map((t) => (t.id === id ? { ...t, ...patch } : t));
    onChange({
      visible_tests: next.filter((t) => t.is_visible),
      hidden_tests: next.filter((t) => !t.is_visible),
    });
  };

  const removeTest = (id: string) => {
    if (selectedCaseId === id) setSelectedCaseId(null);
    const next = tests.filter((t) => t.id !== id);
    onChange({
      visible_tests: next.filter((t) => t.is_visible),
      hidden_tests: next.filter((t) => !t.is_visible),
    });
    toast.success('Test case removed.');
  };

  const addTest = (visible: boolean) => {
    const newCase: TestCase = {
      id: `test_${generateUUID()}`,
      input: '',
      expected_output: '',
      description: '',
      is_visible: visible,
      weight: 1,
      match_mode: 'EXACT',
    };
    onChange({
      visible_tests: visible ? [...(draft.visible_tests ?? []), newCase] : (draft.visible_tests ?? []),
      hidden_tests: !visible ? [...(draft.hidden_tests ?? []), newCase] : (draft.hidden_tests ?? []),
    });
    setSelectedCaseId(newCase.id);
  };

  const moveTest = (idx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= tests.length) return;
    
    const next = [...tests];
    const temp = next[idx]!;
    next[idx] = next[targetIdx]!;
    next[targetIdx] = temp;

    onChange({
      visible_tests: next.filter((t) => t.is_visible),
      hidden_tests: next.filter((t) => !t.is_visible),
    });
  };

  // CSV/JSON Export
  const handleExport = (format: 'json' | 'csv') => {
    try {
      let dataStr = '';
      let mimeType = '';
      let filename = `test_cases_${draft.title || 'challenge'}`;

      if (format === 'json') {
        dataStr = JSON.stringify(tests, null, 2);
        mimeType = 'application/json';
        filename += '.json';
      } else {
        // Simple CSV serialize
        const headers = ['id', 'is_visible', 'description', 'input', 'expected_output', 'weight', 'match_mode'];
        const csvRows = [headers.join(',')];
        
        for (const t of tests) {
          const values = [
            t.id,
            t.is_visible,
            `"${(t.description || '').replace(/"/g, '""')}"`,
            `"${t.input.replace(/"/g, '""')}"`,
            `"${t.expected_output.replace(/"/g, '""')}"`,
            t.weight ?? 1,
            t.match_mode ?? 'EXACT',
          ];
          csvRows.push(values.join(','));
        }
        dataStr = csvRows.join('\n');
        mimeType = 'text/csv';
        filename += '.csv';
      }

      const blob = new Blob([dataStr], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported test suite as ${format.toUpperCase()}.`);
    } catch (err) {
      toast.error('Failed to export test suite.');
    }
  };

  // CSV/JSON Import
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        let imported: TestCase[] = [];

        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            imported = parsed.map((item) => ({
              id: item.id || `test_${generateUUID()}`,
              input: String(item.input ?? ''),
              expected_output: String(item.expected_output ?? ''),
              description: String(item.description ?? ''),
              is_visible: Boolean(item.is_visible),
              weight: Number(item.weight ?? 1),
              match_mode: item.match_mode || 'EXACT',
            }));
          }
        } else if (file.name.endsWith('.csv')) {
          // Naive CSV parsing
          const lines = text.split('\n').filter((l) => l.trim());
          const headers = lines[0]?.split(',').map((h) => h.trim());
          
          if (headers && headers.includes('input') && headers.includes('expected_output')) {
            imported = lines.slice(1).map((line) => {
              // Quick quote splits
              const regex = /(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^",]*))/g;
              const matches = [];
              let match;
              while ((match = regex.exec(line)) !== null) {
                matches.push(match[1] ? match[1].replace(/""/g, '"') : match[2]);
              }
              
              return {
                id: matches[0] || `test_${generateUUID()}`,
                is_visible: matches[1] === 'true',
                description: matches[2] || '',
                input: matches[3] || '',
                expected_output: matches[4] || '',
                weight: Number(matches[5] || 1),
                match_mode: (matches[6] as any) || 'EXACT',
              };
            });
          } else {
            throw new Error('CSV headers must include "input" and "expected_output".');
          }
        }

        if (imported.length > 0) {
          onChange({
            visible_tests: [...(draft.visible_tests ?? []), ...imported.filter((t) => t.is_visible)],
            hidden_tests: [...(draft.hidden_tests ?? []), ...imported.filter((t) => !t.is_visible)],
          });
          toast.success(`Successfully imported ${imported.length} test cases.`);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Invalid import file format.');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // clear
  };

  // Math stats
  const totalWeight = tests.reduce((sum, t) => sum + (t.weight ?? 1), 0);
  const sampleCount = draft.visible_tests?.length ?? 0;
  const hiddenCount = draft.hidden_tests?.length ?? 0;

  return (
    <div className="flex h-full min-h-0 grid-cols-[1fr_360px] flex-col md:grid overflow-hidden">
      {/* Left Pane: test suite spreadsheet */}
      <div className="flex flex-col h-full min-h-0 border-r overflow-hidden">
        {/* Tool bar */}
        <div className="flex h-11 shrink-0 items-center justify-between border-b px-4 bg-muted/20">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => addTest(true)}
              className="h-7 text-xs gap-1.5"
            >
              <Plus className="size-3.5" />
              Add Sample (Visible)
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => addTest(false)}
              className="h-7 text-xs gap-1.5"
            >
              <Plus className="size-3.5" />
              Add Hidden Case
            </Button>
          </div>

          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={handleImportClick}
              className="h-7 text-xs gap-1"
            >
              <Upload className="size-3.5" />
              Import
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".csv,.json"
              className="hidden"
            />
            
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => handleExport('json')}
              className="h-7 text-xs gap-1"
            >
              <Download className="size-3.5" />
              JSON
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => handleExport('csv')}
              className="h-7 text-xs gap-1"
            >
              <Download className="size-3.5" />
              CSV
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead className="w-24">Visibility</TableHead>
                  <TableHead className="w-32">Match Mode</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-20">Weight</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tests.map((test, index) => {
                  const isSelected = test.id === selectedCaseId;
                  return (
                    <TableRow
                      key={test.id}
                      className={cn(
                        'cursor-pointer hover:bg-muted/10',
                        isSelected ? 'bg-primary/5' : ''
                      )}
                      onClick={() => setSelectedCaseId(test.id)}
                    >
                      <TableCell className="py-2.5">
                        <div className="flex flex-col gap-0.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => moveTest(index, 'up')}
                            className="text-muted-foreground hover:text-foreground disabled:opacity-20"
                          >
                            <ArrowUp className="size-3" />
                          </button>
                          <button
                            type="button"
                            disabled={index === tests.length - 1}
                            onClick={() => moveTest(index, 'down')}
                            className="text-muted-foreground hover:text-foreground disabled:opacity-20"
                          >
                            <ArrowDown className="size-3" />
                          </button>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <div onClick={(e) => e.stopPropagation()}>
                          <NativeSelect
                            value={test.is_visible ? 'visible' : 'hidden'}
                            onChange={(e) => updateTest(test.id, { is_visible: e.target.value === 'visible' })}
                            className="h-8 py-0 select-xs"
                          >
                            <NativeSelectOption value="visible">Visible</NativeSelectOption>
                            <NativeSelectOption value="hidden">Hidden</NativeSelectOption>
                          </NativeSelect>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <div onClick={(e) => e.stopPropagation()}>
                          <NativeSelect
                            value={test.match_mode ?? 'EXACT'}
                            onChange={(e) => updateTest(test.id, { match_mode: e.target.value as any })}
                            className="h-8 py-0 select-xs"
                          >
                            <NativeSelectOption value="EXACT">Exact Match</NativeSelectOption>
                            <NativeSelectOption value="TRIMMED">Trimmed Match</NativeSelectOption>
                            <NativeSelectOption value="IGNORE_WHITESPACE">Ignore Whitespace</NativeSelectOption>
                            <NativeSelectOption value="NUMERIC_TOLERANCE">Float Tolerance</NativeSelectOption>
                          </NativeSelect>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <div onClick={(e) => e.stopPropagation()}>
                          <Input
                            value={test.description ?? ''}
                            onChange={(e) => updateTest(test.id, { description: e.target.value })}
                            className="h-8 px-2"
                            placeholder="e.g. Empty list check"
                          />
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <div onClick={(e) => e.stopPropagation()}>
                          <Input
                            type="number"
                            min={1}
                            value={test.weight ?? 1}
                            onChange={(e) => updateTest(test.id, { weight: Number(e.target.value) })}
                            className="h-8 px-2"
                          />
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <div onClick={(e) => e.stopPropagation()}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeTest(test.id)}
                            className="size-8"
                          >
                            <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </ScrollArea>

        {/* Aggregate summary footer */}
        <div className="h-10 shrink-0 border-t px-4 flex items-center justify-between text-xs text-muted-foreground bg-muted/10 font-medium select-none">
          <div className="flex gap-4">
            <span>Samples: <strong>{sampleCount}</strong></span>
            <span>Hidden tests: <strong>{hiddenCount}</strong></span>
            <span>Total cases: <strong>{tests.length}</strong></span>
          </div>
          <span>Total weights: <strong>{totalWeight}</strong></span>
        </div>
      </div>

      {/* Right Pane: selected case details */}
      <div className="flex flex-col h-full min-h-0 bg-muted/5 overflow-hidden border-t md:border-t-0">
        <div className="flex h-11 shrink-0 items-center justify-between border-b px-4 bg-muted/20">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Assertion Details
          </span>
          {selectedTestCase && (
            <Badge variant={selectedTestCase.is_visible ? 'success' : 'secondary'} className="text-[10px]">
              {selectedTestCase.is_visible ? 'Sample Case' : 'Hidden Case'}
            </Badge>
          )}
        </div>

        <ScrollArea className="flex-1 min-h-0">
          {selectedTestCase ? (
            <div className="p-4 space-y-4">
              <label className="grid gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase">Stdin Input</span>
                <Textarea
                  value={selectedTestCase.input}
                  onChange={(e) => updateTest(selectedTestCase.id, { input: e.target.value })}
                  className="min-h-36 font-mono text-xs leading-relaxed"
                  placeholder="Console inputs feed here"
                />
              </label>

              <label className="grid gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase">Expected stdout</span>
                <Textarea
                  value={selectedTestCase.expected_output}
                  onChange={(e) => updateTest(selectedTestCase.id, { expected_output: e.target.value })}
                  className="min-h-36 font-mono text-xs leading-relaxed"
                  placeholder="Expected output assertion here"
                />
              </label>

              <div className="rounded-md border bg-muted/20 p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Info className="size-3.5 text-muted-foreground" />
                  Asserting Matches
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {selectedTestCase.match_mode === 'EXACT' && 'Exact Match requires character-for-character comparison including whitespace and trailing newlines.'}
                  {selectedTestCase.match_mode === 'TRIMMED' && 'Trimmed Match strips surrounding leading/trailing blank spaces and newlines before comparing.'}
                  {selectedTestCase.match_mode === 'IGNORE_WHITESPACE' && 'Ignore Whitespace strips all whitespace, tabs, and line boundaries for comparative checks.'}
                  {selectedTestCase.match_mode === 'NUMERIC_TOLERANCE' && 'Float Tolerance parses float numbers in outputs and compares them within delta = 1e-6.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-52 text-center text-muted-foreground text-xs p-6">
              <Info className="size-8 text-muted-foreground/30 mb-2" />
              Select a test case row in the spreadsheet to edit stdin/stdout.
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
