import { useState, useEffect } from 'react';
import type { ProviderType } from '../types';
import { CAPACITY_WEIGHTS } from '../constants';
import { isSurveyResponse, meanRating, ratingsFor, type SheetRow } from '../utils/delphiResponses';

const SHEETS_API = import.meta.env.VITE_DELPHI_SHEETS_URL || '';
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const ACTIVE_ROUND_KEY = 'delphi-active-round';

const ROLE_KEYS: { sheet: string; type: ProviderType }[] = [
  { sheet: 'Senior Resident', type: 'senior_resident' },
  { sheet: 'Junior Resident', type: 'junior_resident' },
  { sheet: 'Intern', type: 'intern' },
  { sheet: 'PA', type: 'pa' },
  { sheet: 'Rotator', type: 'rotator' },
];

function getActiveRound(): 1 | 2 {
  const raw = localStorage.getItem(ACTIVE_ROUND_KEY);
  return raw === '2' ? 2 : 1;
}

async function fetchSurveyAverages(activeRound: 1 | 2): Promise<Record<ProviderType, number> | null> {
  if (!SHEETS_API) return null;
  try {
    const res = await fetch(SHEETS_API);
    const allRows: SheetRow[] = await res.json();
    const columns = ROLE_KEYS.map(r => r.sheet);
    const validRows = allRows.filter(row => isSurveyResponse(row, columns));

    const rowsForRound = (round: 1 | 2) => validRows.filter(r => {
      const n = Number(r['Round']);
      const rowRound = n === 2 ? 2 : 1;
      return rowRound === round;
    });

    // Prefer active round; fall back to the other round if empty.
    let rows = rowsForRound(activeRound);
    if (rows.length === 0) rows = rowsForRound(activeRound === 1 ? 2 : 1);
    if (rows.length === 0) return null;

    const weights: Record<string, number> = { attending: 20 };
    for (const { sheet, type } of ROLE_KEYS) {
      // Blank is a non-response, 0 is a valid rating (src/utils/delphiResponses.ts).
      const m = meanRating(ratingsFor(rows, sheet));
      weights[type] = m === null ? CAPACITY_WEIGHTS[type] : Math.round(m * 10) / 10;
    }
    return weights as Record<ProviderType, number>;
  } catch {
    return null;
  }
}

export function useSurveyWeights(): Record<ProviderType, number> {
  const [weights, setWeights] = useState<Record<ProviderType, number>>(CAPACITY_WEIGHTS);
  const [activeRound, setActiveRound] = useState<1 | 2>(getActiveRound);

  useEffect(() => {
    const onStorage = () => setActiveRound(getActiveRound());
    window.addEventListener('storage', onStorage);
    window.addEventListener('delphi-active-round-changed', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('delphi-active-round-changed', onStorage);
    };
  }, []);

  useEffect(() => {
    if (!SHEETS_API) return;
    const poll = () => fetchSurveyAverages(activeRound).then(w => { if (w) setWeights(w); });
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [activeRound]);

  return weights;
}
