import { useState, useEffect } from 'react';
import type { ProviderType } from '../types';
import { CAPACITY_WEIGHTS } from '../constants';

const SHEETS_API = import.meta.env.VITE_DELPHI_SHEETS_URL || '';
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const ROLE_KEYS: { sheet: string; type: ProviderType }[] = [
  { sheet: 'Senior Resident', type: 'senior_resident' },
  { sheet: 'Junior Resident', type: 'junior_resident' },
  { sheet: 'Intern', type: 'intern' },
  { sheet: 'PA', type: 'pa' },
  { sheet: 'Rotator', type: 'rotator' },
];

async function fetchSurveyAverages(): Promise<Record<ProviderType, number> | null> {
  if (!SHEETS_API) return null;
  try {
    const res = await fetch(SHEETS_API);
    const allRows: Record<string, string | number>[] = await res.json();
    const rows = allRows.filter(row =>
      ROLE_KEYS.some(({ sheet }) => row[sheet] !== '' && row[sheet] != null && Number(row[sheet]) !== 0)
    );
    if (rows.length === 0) return null;

    const weights: Record<string, number> = { attending: 20 };
    for (const { sheet, type } of ROLE_KEYS) {
      let sum = 0;
      for (const row of rows) sum += Number(row[sheet] ?? 0);
      weights[type] = Math.round((sum / rows.length) * 10) / 10;
    }
    return weights as Record<ProviderType, number>;
  } catch {
    return null;
  }
}

export function useSurveyWeights(): Record<ProviderType, number> {
  const [weights, setWeights] = useState<Record<ProviderType, number>>(CAPACITY_WEIGHTS);

  useEffect(() => {
    if (!SHEETS_API) return;

    const poll = () => fetchSurveyAverages().then(w => { if (w) setWeights(w); });
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return weights;
}
