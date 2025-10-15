import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

interface DeletionStep {
  message: string;
  status: 'pending' | 'in-progress' | 'success' | 'error';
  error?: string;
}

interface DeletionReportingDialogProps {
  open: boolean;
  branchName: string;
  worktreePath: string;
  steps: DeletionStep[];
  isComplete: boolean;
  onClose: () => void;
}

export function DeletionReportingDialog({
  open,
  branchName,
  worktreePath,
  steps,
  isComplete,
  onClose,
}: DeletionReportingDialogProps) {
  const hasErrors = steps.some(step => step.status === 'error');

  return (
    <Dialog open={open} onOpenChange={isComplete ? onClose : undefined}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isComplete
              ? hasErrors
                ? 'Deletion Failed'
                : 'Deletion Complete'
              : 'Deleting Worktree'}
          </DialogTitle>
          <DialogDescription>
            {isComplete
              ? hasErrors
                ? 'Some errors occurred during deletion'
                : 'Worktree has been successfully deleted'
              : 'Please wait while the worktree is being deleted...'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="bg-muted/50 border rounded-md p-3 mb-4">
            <p className="text-sm">
              <strong>Branch:</strong> {branchName}
            </p>
            <p className="text-sm">
              <strong>Path:</strong> {worktreePath}
            </p>
          </div>

          <ScrollArea className="h-[300px] w-full border rounded-md p-4">
            <div className="space-y-3">
              {steps.map((step, index) => (
                <div key={index} className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {step.status === 'pending' && (
                      <div className="w-4 h-4 rounded-full border-2 border-muted" />
                    )}
                    {step.status === 'in-progress' && (
                      <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                    )}
                    {step.status === 'success' && (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    )}
                    {step.status === 'error' && (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{step.message}</p>
                    {step.error && (
                      <p className="text-xs text-red-500 mt-1">{step.error}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {isComplete && (
          <div className="flex justify-end">
            <Button onClick={onClose} data-testid="deletion-dialog-close-button">Close</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
