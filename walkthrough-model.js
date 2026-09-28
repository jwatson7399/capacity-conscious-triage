// © 2026 New York University. All rights reserved.
//
// Numbers behind the walkthrough (walkthrough-v4.html). Every strength, load, ratio,
// suggestion, peak and load-minute total on its slides is computed here, from one weights
// table and the facts of the real morning. Nothing on a slide is typed in by hand.
//
// The weights, acuity weights and decay must match src/constants.ts, and the ratios and
// suggestions must match src/engine/recommendation.ts. src/walkthrough/walkthroughModel.test.ts
// fails if they drift apart.
//
// The morning: NYU Langone Brooklyn A-side, Monday December 29, 2025, 09:55 to 12:21.
// Arrivals from the A-side census; rosters from the week-of-December-29 schedule. Names are
// replaced with roles. Checked 2026-09-28.
(function (root) {
  'use strict';

  // Provider weights: frozen for the study (Delphi Round 1 means).
  var WEIGHTS = {
    attending: 20,
    senior_resident: 15.2,
    junior_resident: 10.8,
    intern: 6.6,
    pa: 11.4,
    rotator: 2.4,
  };

  var ROLE_LABEL = {
    attending: 'Attending',
    senior_resident: 'Senior Resident',
    junior_resident: 'Junior Resident',
    intern: 'Intern',
    pa: 'PA',
    rotator: 'Rotator',
  };

  // Acuity weight at placement and minutes until it has decayed (linearly) to zero.
  var ACUITY = {
    Red: { w: 4, minutes: 180 },
    Yellow: { w: 2, minutes: 180 },
    Purple: { w: 1, minutes: 90 },
  };

  var TEAM_IDS = ['T1', 'T2', 'T3'];

  // Illustrative teams for the intro (slides 2, 5, 7 and 8).
  var INTRO_TEAMS = {
    T1: ['attending', 'senior_resident', 'junior_resident', 'pa'],
    T2: ['attending', 'pa', 'intern'],
    T3: ['attending', 'rotator'],
  };

  // The real morning. Minutes are counted from 09:55.
  var START_CLOCK = 9 * 60 + 55;
  var NOON = 125;
  var ROSTER = [
    { team: 'T1', role: 'attending', from: 0 },
    { team: 'T1', role: 'pa', from: 0 },
    { team: 'T1', role: 'junior_resident', from: 0 },
    { team: 'T1', role: 'intern', from: NOON },
    { team: 'T2', role: 'attending', from: 0 },
    { team: 'T2', role: 'pa', from: 0 },
    { team: 'T2', role: 'intern', from: 0 },
    { team: 'T3', role: 'attending', from: 0 },
    { team: 'T3', role: 'senior_resident', from: 0 },
  ];
  var ARRIVALS = [
    { n: 1, t: 0, acuity: 'Purple', actual: 'T1' },
    { n: 2, t: 50, acuity: 'Yellow', actual: 'T1' },
    { n: 3, t: 51, acuity: 'Red', actual: 'T2' },
    { n: 4, t: 64, acuity: 'Yellow', actual: 'T1' },
    { n: 5, t: 86, acuity: 'Yellow', actual: 'T2' },
    { n: 6, t: 127, acuity: 'Yellow', actual: 'T2' },
    { n: 7, t: 131, acuity: 'Yellow', actual: 'T3' },
    { n: 8, t: 146, acuity: 'Yellow', actual: 'T1' },
  ];
  var WINDOW = 146; // last arrival, minutes after 09:55

  function strengthOf(roles) {
    var s = 0;
    for (var i = 0; i < roles.length; i++) s += WEIGHTS[roles[i]];
    return Math.round(s * 1e9) / 1e9; // drop float noise such as 42.199999
  }

  function rolesAt(team, min) {
    return ROSTER.filter(function (r) { return r.team === team && r.from <= min; })
      .map(function (r) { return r.role; });
  }

  function strengthAt(team, min) { return strengthOf(rolesAt(team, min)); }

  /** [label, weight] pairs for a list of roles, for the small roster cards. */
  function providerRows(roles, newRole) {
    return roles.map(function (r) {
      var label = ROLE_LABEL[r];
      if (r === newRole) label = 'PGY-1 Intern';
      return [label, WEIGHTS[r]];
    });
  }

  /** What one patient adds at `age` minutes after placement (linear decay to zero). */
  function weightAt(acuity, age) {
    var d = ACUITY[acuity];
    if (age < 0) return 0;
    if (age >= d.minutes) return 0;
    return d.w * (1 - age / d.minutes);
  }

  /** assigns: [{ acuity, team, t }]. Patients not yet placed at `min` add nothing. */
  function loadAt(team, min, assigns) {
    var load = 0;
    for (var i = 0; i < assigns.length; i++) {
      var a = assigns[i];
      if (a.team !== team || a.t > min) continue;
      load += weightAt(a.acuity, min - a.t);
    }
    return load;
  }

  /** Each patient's current share of its team's load, for the load chips. */
  function chipsAt(team, min, assigns) {
    var out = [];
    for (var i = 0; i < assigns.length; i++) {
      var a = assigns[i];
      if (a.team !== team || a.t > min) continue;
      var w = weightAt(a.acuity, min - a.t);
      if (w > 0) out.push({ tone: a.acuity.toLowerCase(), w: w });
    }
    return out;
  }

  function ratio(strength, load) { return load === 0 ? Infinity : strength / load; }

  function formatRatio(r) { return isFinite(r) ? r.toFixed(1) : '∞'; }

  /**
   * The team capacity suggests, as the engine ranks it: highest ratio, then least recently
   * assigned, then lowest team number. `strengths` maps team to strength at that minute.
   */
  function recommend(min, assigns, strengths) {
    var last = {};
    for (var i = 0; i < assigns.length; i++) {
      var a = assigns[i];
      if (a.t <= min && (last[a.team] === undefined || a.t > last[a.team])) last[a.team] = a.t;
    }
    var ranked = TEAM_IDS.map(function (id) {
      return { id: id, r: ratio(strengths[id], loadAt(id, min, assigns)), last: last[id] === undefined ? -Infinity : last[id] };
    });
    ranked.sort(function (x, y) {
      if (x.r !== y.r) return y.r - x.r;
      if (x.last !== y.last) return x.last - y.last;
      return x.id < y.id ? -1 : 1;
    });
    return ranked[0].id;
  }

  function morningStrengths(min) {
    return { T1: strengthAt('T1', min), T2: strengthAt('T2', min), T3: strengthAt('T3', min) };
  }

  /**
   * Replays the morning. 'actual' places each patient where it really went and records what
   * capacity suggested at that moment; 'formula' places each on the suggested team.
   * Returns [{ n, t, acuity, actual, suggested, team, ratios }], ratios taken on arrival.
   */
  var _replays = {};
  function replay(strategy) {
    if (_replays[strategy]) return _replays[strategy];
    var assigns = [];
    var out = ARRIVALS.map(function (p) {
      var st = morningStrengths(p.t);
      var ratios = {};
      TEAM_IDS.forEach(function (id) { ratios[id] = ratio(st[id], loadAt(id, p.t, assigns)); });
      var suggested = recommend(p.t, assigns, st);
      var team = strategy === 'actual' ? p.actual : suggested;
      assigns.push({ acuity: p.acuity, team: team, t: p.t, n: p.n });
      return { n: p.n, t: p.t, acuity: p.acuity, actual: p.actual, suggested: suggested, team: team, ratios: ratios };
    });
    _replays[strategy] = out;
    return out;
  }

  function assignsOf(strategy, count) {
    var steps = replay(strategy);
    var k = count === undefined ? steps.length : count;
    return steps.slice(0, k).map(function (s) { return { acuity: s.acuity, team: s.team, t: s.t, n: s.n }; });
  }

  function counts(strategy) {
    var c = { T1: 0, T2: 0, T3: 0 };
    replay(strategy).forEach(function (s) { c[s.team]++; });
    return c;
  }

  /** Highest load any team reaches; load only jumps at an arrival, so check those. */
  function worstPeak(strategy) {
    var assigns = assignsOf(strategy);
    var best = { team: null, load: 0, t: 0 };
    assigns.forEach(function (a) {
      var l = loadAt(a.team, a.t, assigns);
      if (l > best.load) best = { team: a.team, load: l, t: a.t };
    });
    return best;
  }

  /** Area under the team's load line from 09:55 to the last arrival, one-minute trapezoids. */
  function loadMinutes(team, strategy) {
    var assigns = assignsOf(strategy);
    var sum = 0;
    for (var m = 0; m < WINDOW; m++) sum += (loadAt(team, m, assigns) + loadAt(team, m + 1, assigns)) / 2;
    return sum;
  }

  function clock(min) {
    var t = START_CLOCK + min;
    var h = Math.floor(t / 60), mm = t % 60;
    return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm;
  }

  var api = {
    WEIGHTS: WEIGHTS, ROLE_LABEL: ROLE_LABEL, ACUITY: ACUITY, TEAM_IDS: TEAM_IDS,
    INTRO_TEAMS: INTRO_TEAMS, ROSTER: ROSTER, ARRIVALS: ARRIVALS, NOON: NOON, WINDOW: WINDOW,
    strengthOf: strengthOf, rolesAt: rolesAt, strengthAt: strengthAt, providerRows: providerRows,
    weightAt: weightAt, loadAt: loadAt, chipsAt: chipsAt, ratio: ratio, formatRatio: formatRatio,
    recommend: recommend, morningStrengths: morningStrengths, replay: replay, assignsOf: assignsOf,
    counts: counts, worstPeak: worstPeak, loadMinutes: loadMinutes, clock: clock,
  };
  root.CCTWalk = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
