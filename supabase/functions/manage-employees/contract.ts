// Additive contract: legacy request/response fields remain supported.
export const employeeContract = {
  version: 'employees-2026-11-status-v3',
  actions: ['contract', 'catalogs', 'pending', 'list', 'detail', 'create', 'recover', 'update', 'state'],
  features: ['mutation-readback', 'auth-state-control', 'deactivation-impact', 'live-role-revocation', 'restore-authorized-roles'],
} as const
