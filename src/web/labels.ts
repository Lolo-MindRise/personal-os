import type { Kind, MilestoneStatus } from '../shared/constants.js';

export const KIND_LABELS: Record<Kind, string> = {
  income: 'Ingreso',
  expense: 'Gasto',
  repayment: 'Amortización',
};

export const STATUS_LABELS: Record<MilestoneStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  done: 'Hecho',
};
