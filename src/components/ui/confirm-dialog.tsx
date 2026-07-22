import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'
import { useT } from '@/i18n'
import { buttonVariants } from './button'

interface ConfirmDialogProps {
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
}

/** Every destructive action goes through this dialog — no silent deletes. */
export function ConfirmDialog({ title, message, onConfirm, onCancel }: ConfirmDialogProps) {
  const t = useT()
  return (
    <AlertDialogPrimitive.Root open onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs" />
        <AlertDialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-5 shadow-lg outline-none">
          <AlertDialogPrimitive.Title className="text-base font-semibold">{title}</AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">
            {message}
          </AlertDialogPrimitive.Description>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialogPrimitive.Cancel className={buttonVariants({ variant: 'secondary' })}>
              {t('common.cancel')}
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action className={buttonVariants({ variant: 'destructive' })} onClick={onConfirm}>
              {t('common.delete')}
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  )
}
