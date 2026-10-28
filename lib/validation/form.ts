/** What every form Server Action returns: field errors keyed by input name, plus the values to put back. */
export type FormState = {
  ok: boolean;
  errors?: Record<string, string>;
  values?: Record<string, string>;
  message?: string;
};

export const initialFormState: FormState = { ok: false };
