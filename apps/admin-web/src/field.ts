import { cloneElement, createElement, isValidElement, useId, type ReactNode } from 'react';

type NativeControlProps = { id?: string; 'aria-describedby'?: string; 'aria-labelledby'?: string };

/** A Field's visible title names its native control; hints are descriptions, not names. */
export function Field({ label, children, hint, wide = false }: {
    label: string;
    children: ReactNode;
    hint?: string;
    wide?: boolean;
}) {
    const generatedId = useId();
    const labelId = `${generatedId}-label`, hintId = `${generatedId}-hint`;
    const nativeControl = isValidElement<NativeControlProps>(children)
        && typeof children.type === 'string'
        && ['input', 'select', 'textarea'].includes(children.type);
    if (!nativeControl) {
        // Existing composite controls retain their own labels and interaction model.
        return createElement('label', { className: 'field' + (wide ? ' wide' : '') },
            createElement('span', null, label), children, hint && createElement('small', null, hint));
    }
    const controlId = children.props.id || `${generatedId}-control`;
    const descriptions = new Set((children.props['aria-describedby'] || '').split(/\s+/).filter(Boolean));
    if (hint) descriptions.add(hintId);
    return createElement('label', { className: 'field' + (wide ? ' wide' : ''), htmlFor: controlId },
        createElement('span', { id: labelId }, label),
        cloneElement(children, {
            id: controlId,
            'aria-labelledby': labelId,
            'aria-describedby': [...descriptions].join(' ') || undefined,
        }),
        hint && createElement('small', { id: hintId }, hint));
}
