export interface TourStep {
  targetSelector: string | null;
  title: string;
  description: string;
  onEnter?: () => void;       // runs immediately (React state changes)
  onAfterRender?: () => void; // runs after DOM settles (open <details>, etc.)
}

export function buildTourSteps(helpers: {
  openHelp: () => void;
  closeHelp: () => void;
}): TourStep[] {
  const { openHelp, closeHelp } = helpers;

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
      description:
        'Each provider has a weighted strength based on role and status. The team total is the sum.',
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
