import type { ComponentPropsWithoutRef } from 'react';
import { Icon } from '../ios/icons';

type Props = Pick<ComponentPropsWithoutRef<'button'>,
  'aria-controls' | 'aria-expanded' | 'className' | 'onClick' | 'title'> & {
    label: string;
    opensDialog?: boolean;
  };

const GEAR_ICON = 'gear' as const;
const DIALOG_POPUP = 'dialog' as const;

export function CustomizeButton({ label, className, opensDialog, ...props }: Props) {
  return (
    <button {...props} type="button" aria-haspopup={opensDialog ? DIALOG_POPUP : undefined}
      className={className ? `customize-button ${className}` : 'customize-button'}>
      <Icon name={GEAR_ICON} size={18} />
      <span>{label}</span>
    </button>
  );
}
