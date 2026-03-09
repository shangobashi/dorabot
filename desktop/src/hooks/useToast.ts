import { useState, useEffect } from 'react';

type Toast = { id: string; message: string; type: 'info' | 'success' | 'error' };

let listeners: Array<(toasts: Toast[]) => void> = [];
let toasts: Toast[] = [];
let nextId = 0;

function notify() { listeners.forEach(l => l([...toasts])); }

export function toast(message: string, type: 'info' | 'success' | 'error' = 'info') {
  const id = String(nextId++);
  toasts = [...toasts, { id, message, type }];
  notify();
  setTimeout(() => { dismissToast(id); }, 3000);
}

export function dismissToast(id: string) {
  toasts = toasts.filter(t => t.id !== id);
  notify();
}

export function useToasts() {
  const [state, setState] = useState<Toast[]>([]);
  useEffect(() => {
    listeners.push(setState);
    return () => { listeners = listeners.filter(l => l !== setState); };
  }, []);
  return state;
}
