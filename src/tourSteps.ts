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
      title: 'Start Tour',
      description:
        'Lets make all this make sense.',
    },
    // 2. The Three Problems
    {
      targetSelector: '[data-tour="help-problems"]',
      title: 'The Three Problems',
      description:
        'A round-robin system has three shortcomings.',
      onEnter: () => {
        openHelp();
      },
    },
    // 2. Team Composition problem
    {
      targetSelector: '[data-tour="help-problem-composition"]',
      title: 'Team Composition',
      description:
        'So how does this tool solve this first problem?',
      onEnter: () => {
        openHelp();
      },
    },
    // 3. Team Capacity section
    {
      targetSelector: '[data-tour="help-team-capacity-weights"]',
      title: 'Team Capacity',
      description:
        'Each provider type has a weight reflecting their ability to manage critical patients. Status modifiers temporarily reduce these weights.',
      onEnter: () => {
        openHelp();
      },
      onAfterRender: () => {
        openDetails('[data-tour="help-team-capacity"]');
      },
    },
    // 4. Capacity in action — Team 1's card with providers expanded
    {
      targetSelector: '[data-tour="provider-list"][data-tour-team="1"]',
      title: 'Capacity In Action',
      description:
        'Here\'s Team 1: an Attending (17.5), two Juniors (7.5 each, but one is In Procedure at 25%), a PA (10), and a Rotator (1). Sum it up: 17.5 + 1.9 + 7.5 + 10 + 1 = 37.9 capacity.',
      onEnter: () => {
        closeHelp();
      },
      onAfterRender: () => {
        // Open Team 1's provider list if collapsed
        const providerSection = document.querySelector('[data-tour="provider-list"][data-tour-team="1"]');
        if (providerSection) {
          const btn = providerSection.querySelector('button');
          const chevron = btn?.querySelector('svg');
          // If chevron is NOT rotated, providers are collapsed — click to open
          if (chevron && !chevron.classList.contains('rotate-90')) {
            btn?.click();
          }
        }
      },
    },
    // 5. Acuity & Load problems
    {
      targetSelector: '[data-tour="help-problem-acuity-load"]',
      title: 'Acuity & Load Problems',
      description:
        'How does this tool solve these last two problems?',
      onEnter: () => {
        openHelp();
      },
    },
    // 6. Patient Load & Decay section
    {
      targetSelector: '[data-tour="help-patient-load-chart"]',
      title: 'Patient Load & Decay',
      description:
        'Each new A-side patient is marked with an acuity color, a higher acuity adds a higher initial load to that team. This initial load decays over time to reflect how stabilized patients require less attention over time.',
      onEnter: () => {
        openHelp();
      },
      onAfterRender: () => {
        openDetails('[data-tour="help-patient-load"]');
      },
    },
    // 7. The Core Formula
    {
      targetSelector: '[data-tour="help-formula"]',
      title: 'The Core Formula',
      description:
        'This tool then divides a teams Capacity by its Patient Load to generate its Capacity Ratio. Higher team ratio means more team bandwidth. The team with the highest ratio is recommended.',
      onEnter: () => {
        openHelp();
      },
      onAfterRender: () => {
        openDetails('[data-tour="help-formula"]');
      },
    },
    // 8. Capacity Ratio on the card
    {
      targetSelector: '[data-tour="capacity-ratio"]',
      title: 'Capacity Ratio on Card',
      description:
        'This is that formula in action — the big number on each card is the team\'s capacity ratio. Below it, the label and color give you a quick read on team status.',
      onEnter: () => {
        closeHelp();
      },
    },
    // 9. Buffer bar on Team 1
    {
      targetSelector: '[data-tour="buffer-bar"][data-tour-team="1"]',
      title: 'The Buffer System',
      description:
        'After assignment, a cooldown buffer prevents back-to-back assignments. Duration depends on acuity (Red 35m, Yellow 25m, Purple 15m). The colored bar shrinks as time passes.',
      onEnter: () => {
        closeHelp();
      },
    },
    // 10. Recommendation Algorithm
    {
      targetSelector: '[data-tour="help-recommendations"]',
      title: 'Recommendation Algorithm',
      description:
        '5 steps: exclude Trauma, check buffers, compare ratios, tiebreak by recency, tiebreak by team number.',
      onEnter: () => {
        openHelp();
      },
      onAfterRender: () => {
        openDetails('[data-tour="help-recommendations"]');
      },
    },
    // 11. Recommended Team
    {
      targetSelector: '[data-tour="recommended-team"]',
      title: 'Recommended Team',
      description:
        'Team 2 currently has the highest unbuffered capacity ratio so this team card is outlined in yellow as the system\'s pick for the next patient assignment. Reminder, Team 4 is never recommended.',
      onEnter: () => {
        closeHelp();
      },
    },
    // 12. Assign Patient FAB
    {
      targetSelector: '[data-tour="fab-assign"]',
      title: 'Assign Patient',
      description:
        'Tap to assign a new patient. The system recommends the best team, but you can override and must give a reason.',
    },
    // 13. Floor Patient FAB
    {
      targetSelector: '[data-tour="fab-floor"]',
      title: 'Floor Patient',
      description:
        'Upgrade a patient from the regular ER area to the Critical Area.',
    },
    // 14. Finish
    {
      targetSelector: null,
      title: "That's It!",
      description:
        'Tap ? anytime in the top right corner for the full help section. Every recommendation can be overridden — the final call always belongs to the staff.',
      onEnter: () => {
        closeHelp();
      },
    },
  ];
}
