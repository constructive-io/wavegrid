import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';

interface SwitchProjectDialogProps {
  /** The project being switched to, or null when nothing is pending. */
  pending: string | null;
  current: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Switching projects restarts a running brain onto the new one — the lasers go
 * dark for a moment — so it is confirmed while a show is live and silent when
 * it isn't. Every switch path (the sidebar switcher, the Projects screen) goes
 * through this one dialog so none of them can quietly skip the warning.
 */
export function SwitchProjectDialog({ pending, current, onCancel, onConfirm }: SwitchProjectDialogProps) {
  return (
    <AlertDialog open={pending != null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Switch to {pending} and restart the show?</AlertDialogTitle>
          <AlertDialogDescription>
            The show is running on {current}. Switching restarts it on {pending}, so the lasers go
            dark for a moment and anyone connected reloads.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Stay on {current}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Switch and restart</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
