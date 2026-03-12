import { useState, useEffect, useCallback } from 'react';
import type { TourStep } from '../tourSteps';

interface Props {
  steps: TourStep[];
  onComplete: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export default function GuidedTour({ steps, onComplete }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);

  const step = steps[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;

  const measureNow = useCallback(() => {
    if (!step.targetSelector) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(step.targetSelector);
    if (el) {
      const r = el.getBoundingClientRect();
      setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      // Scroll into view if needed
      if (r.top < 0 || r.bottom > window.innerHeight) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Re-measure after scroll
        requestAnimationFrame(() => {
          const r2 = el.getBoundingClientRect();
          setTargetRect({ top: r2.top, left: r2.left, width: r2.width, height: r2.height });
        });
      }
    } else {
      setTargetRect(null);
    }
  }, [step.targetSelector]);

  useEffect(() => {
    // Phase 1: React state changes (open/close help section)
    step.onEnter?.();
    // Phase 2: after DOM settles, manipulate rendered elements (open <details>, etc.)
    const timer = setTimeout(() => {
      step.onAfterRender?.();
      // Brief extra delay for <details> open animation, then measure
      setTimeout(() => measureNow(), 30);
    }, 80);
    window.addEventListener('resize', measureNow);
    window.addEventListener('scroll', measureNow, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', measureNow);
      window.removeEventListener('scroll', measureNow, true);
    };
  }, [currentStep, measureNow, step]);

  const next = () => {
    if (isLast) { onComplete(); return; }
    setCurrentStep(s => s + 1);
  };
  const back = () => setCurrentStep(s => Math.max(0, s - 1));

  // Tooltip positioning
  const pad = 8;
  const tooltipStyle: React.CSSProperties = {};
  let arrowPosition: 'top' | 'bottom' = 'top';

  if (targetRect) {
    const spaceBelow = window.innerHeight - (targetRect.top + targetRect.height + pad);
    const spaceAbove = targetRect.top - pad;
    if (spaceBelow > 180 || spaceBelow >= spaceAbove) {
      // Show below
      tooltipStyle.top = targetRect.top + targetRect.height + pad + 8;
      arrowPosition = 'top';
    } else {
      // Show above
      tooltipStyle.bottom = window.innerHeight - targetRect.top + pad + 8;
      arrowPosition = 'bottom';
    }
    const w = step.wide ? 360 : 300;
    tooltipStyle.left = Math.max(16, Math.min(
      targetRect.left + targetRect.width / 2 - w / 2,
      window.innerWidth - w - 16
    ));
    tooltipStyle.width = w;
  }

  return (
    <div className="fixed inset-0 z-[9999]" role="dialog" aria-label="Guided tour">
      {/* Overlay with cutout */}
      {targetRect ? (
        <div
          className="absolute rounded-lg"
          style={{
            top: targetRect.top - pad,
            left: targetRect.left - pad,
            width: targetRect.width + pad * 2,
            height: targetRect.height + pad * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
            zIndex: 1,
            pointerEvents: 'none',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/60" />
      )}

      {/* Click-blocking layer (doesn't block the cutout area) */}
      <div className="absolute inset-0 z-0" onClick={(e) => e.stopPropagation()} />

      {/* Tooltip */}
      <div
        className="absolute z-10 bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-4"
        style={targetRect ? tooltipStyle : {
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 320,
        }}
      >
        {/* Arrow */}
        {targetRect && (
          <div
            className={`absolute w-3 h-3 bg-white dark:bg-slate-800 rotate-45 ${
              arrowPosition === 'top' ? '-top-1.5' : '-bottom-1.5'
            }`}
            style={{ left: Math.min(Math.max(24, (targetRect.left + targetRect.width / 2) - (parseFloat(String(tooltipStyle.left)) || 0)), (tooltipStyle.width as number) - 30) }}
          />
        )}

        <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">
          {currentStep + 1} / {steps.length}
        </div>
        <h3 className="font-bold text-gray-900 dark:text-gray-100 text-base mb-1">
          {step.title}
        </h3>
        <div className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          {step.description}
        </div>
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={onComplete}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            Skip Tour
          </button>
          <div className="flex gap-2">
            {!isFirst && (
              <button
                onClick={back}
                className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200 font-medium"
              >
                Back
              </button>
            )}
            <button
              onClick={next}
              className="px-4 py-1.5 text-sm rounded-lg bg-blue-600 text-white font-medium"
            >
              {isLast ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
