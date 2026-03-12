import type { ReactNode } from 'react';
import type { Provider, ProviderType } from './types';
import { STATUS_MULTIPLIERS } from './constants';

export interface TourStep {
  targetSelector: string | null;
  title: string;
  description: ReactNode;
  wide?: boolean;             // wider tooltip (for tables, etc.)
  onEnter?: () => void;       // runs immediately (React state changes)
  onAfterRender?: () => void; // runs after DOM settles (open <details>, etc.)
}

// Provider weight labels in display order (matches HelpSection)
const WEIGHT_DISPLAY_ORDER: { type: ProviderType; label: string }[] = [
  { type: 'attending', label: 'Attending' },
  { type: 'senior_resident', label: 'Senior Resident (PGY 3-4)' },
  { type: 'pa', label: 'PA' },
  { type: 'junior_resident', label: 'Resident (PGY-2)' },
  { type: 'intern', label: 'Intern (PGY-1)' },
  { type: 'rotator', label: 'Rotator' },
];

export function buildTourSteps(helpers: {
  openHelp: () => void;
  closeHelp: () => void;
  capacityWeights: Record<ProviderType, number>;
  team1Providers: Provider[];
}): TourStep[] {
  const { openHelp, closeHelp, capacityWeights, team1Providers } = helpers;

  const closeAllDetails = () => {
    document.querySelectorAll('details[data-tour]').forEach(el => {
      (el as HTMLDetailsElement).open = false;
    });
  };

  const openDetails = (selector: string) => {
    closeAllDetails();
    const el = document.querySelector(selector);
    if (el && el.tagName === 'DETAILS') {
      (el as HTMLDetailsElement).open = true;
    }
  };

  return [
    // 1. Welcome
    {
      targetSelector: null,
      title: 'Welcome',
      description:
        "Let's make all this make sense.",
    },
    // 2. Why Not Round-Robin
    {
      targetSelector: '[data-tour="help-problems"]',
      title: 'Why Not Round-Robin',
      description:
        'Round-robin ignores team composition, patient severity, and current workload. This tool fixes all three.',
      onEnter: () => {
        openHelp();
      },
    },
    // 3. Team Strength
    {
      targetSelector: '[data-tour="provider-list"][data-tour-team="1"]',
      title: 'Team Strength',
      wide: true,
      description: (() => {
        const teamStrength = team1Providers.reduce(
          (sum, p) => sum + capacityWeights[p.type] * STATUS_MULTIPLIERS[p.status],
          0
        );
        return (
          <div className="space-y-2">
            <p>Each provider has a weighted strength based on role and status. The team total is the sum.</p>
            <p className="font-semibold text-blue-600 dark:text-blue-400">
              Team strength: {teamStrength.toFixed(1)}
            </p>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 dark:border-slate-600">
                  <th className="text-left py-0.5 font-semibold text-gray-600 dark:text-gray-300">Type</th>
                  <th className="text-right py-0.5 font-semibold text-gray-600 dark:text-gray-300">Weight</th>
                </tr>
              </thead>
              <tbody>
                {WEIGHT_DISPLAY_ORDER.map(({ type, label }) => (
                  <tr key={type} className="border-b border-gray-50 dark:border-slate-700 last:border-0">
                    <td className="py-0.5 text-gray-600 dark:text-gray-400">{label}</td>
                    <td className="py-0.5 text-right text-gray-700 dark:text-gray-300">{capacityWeights[type]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })(),
      onEnter: () => {
        closeHelp();
      },
      onAfterRender: () => {
        const providerSection = document.querySelector('[data-tour="provider-list"][data-tour-team="1"]');
        if (providerSection) {
          const btn = providerSection.querySelector('button');
          const chevron = btn?.querySelector('svg');
          if (chevron && !chevron.classList.contains('rotate-90')) {
            btn?.click();
          }
        }
      },
    },
    // 4. Patient Demand & Decay
    {
      targetSelector: '[data-tour="help-patient-load-chart"]',
      title: 'Patient Demand & Decay',
      description:
        'Each patient adds demand based on acuity color. Demand decays over time as patients stabilize.',
      onEnter: () => {
        openHelp();
      },
      onAfterRender: () => {
        openDetails('[data-tour="help-patient-load"]');
      },
    },
    // 5. The Formula in Action
    {
      targetSelector: '[data-tour="capacity-ratio"]',
      title: 'The Formula in Action',
      description:
        "Strength ÷ Demand = Capacity. The big number on each card. Higher = more bandwidth.",
      onEnter: () => {
        closeHelp();
      },
    },
    // 6. The Buffer System
    {
      targetSelector: '[data-tour="buffer-bar"][data-tour-team="1"]',
      title: 'The Buffer System',
      description:
        'After assignment, a cooldown buffer prevents back-to-back assignments. Duration depends on acuity (Red 35m, Yellow 25m, Purple 15m).',
      onEnter: () => {
        closeHelp();
      },
    },
    // 7. Recommended Team
    {
      targetSelector: '[data-tour="recommended-team"]',
      title: 'Recommended Team',
      description:
        "Highest unbuffered capacity gets the yellow outline — the system's pick. Team 4 is never auto-recommended.",
      onEnter: () => {
        closeHelp();
      },
    },
    // 8. Assign a Patient
    {
      targetSelector: '[data-tour="fab-assign"]',
      title: 'Assign a Patient',
      description:
        'Tap to assign a new patient. Pick acuity color, then accept or override the recommendation.',
    },
    // 9. Patient Actions
    {
      targetSelector: '[data-tour="patient-badge"]',
      title: 'Patient Actions',
      description:
        'Tap any patient to upgrade, reassign, or remove them from A-Side.',
      onEnter: () => {
        closeHelp();
      },
    },
    // 10. Provider Status
    {
      targetSelector: '[data-tour="provider-list"][data-tour-team="1"]',
      title: 'Provider Status',
      description:
        'Tap Status to mark providers In Procedure, Off Floor, etc. Statuses auto-expire.',
      onEnter: () => {
        closeHelp();
      },
      onAfterRender: () => {
        const providerSection = document.querySelector('[data-tour="provider-list"][data-tour-team="1"]');
        if (providerSection) {
          const btn = providerSection.querySelector('button');
          const chevron = btn?.querySelector('svg');
          if (chevron && !chevron.classList.contains('rotate-90')) {
            btn?.click();
          }
        }
      },
    },
    // 11. That's It!
    {
      targetSelector: null,
      title: "That's It!",
      description:
        'Tap ? anytime for the full help section. Every recommendation can be overridden.',
      onEnter: () => {
        closeHelp();
      },
    },
  ];
}
