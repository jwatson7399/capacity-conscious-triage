// © 2026 New York University. All rights reserved.
import { clock } from '../ui/model';

/** Header time with a smaller AM/PM, so it fits the phone header. */
export default function HeaderClock({ ms }: { ms: number }) {
  const [time, ampm] = clock(ms).split(' ');
  return <span className="clock num">{time}<small>{ampm}</small></span>;
}
