// © 2026 New York University. All rights reserved.
import { describe, expect, it } from 'vitest';
import { isSurveyResponse, meanRating, parseRating, ratingsFor, type SheetRow } from './delphiResponses';

const COLS = ['Senior Resident', 'Intern'];

describe('Delphi missing values: blank versus zero', () => {
  it('reads blank, missing and non-numeric cells as non-responses', () => {
    expect(parseRating('')).toBeNull();
    expect(parseRating('   ')).toBeNull();
    expect(parseRating(null)).toBeNull();
    expect(parseRating(undefined)).toBeNull();
    expect(parseRating('n/a')).toBeNull();
  });

  it('keeps 0 as a valid rating, as a number or a string', () => {
    expect(parseRating(0)).toBe(0);
    expect(parseRating('0')).toBe(0);
    expect(parseRating('12.5')).toBe(12.5);
  });

  it('treats values off the 0 to 20 scale as missing', () => {
    expect(parseRating(-1)).toBeNull();
    expect(parseRating(21)).toBeNull();
    expect(parseRating(20)).toBe(20);
  });

  it('a blank leaves the mean alone; a zero pulls it down', () => {
    const rows: SheetRow[] = [
      { 'Senior Resident': 16, Intern: 0 },
      { 'Senior Resident': 14, Intern: '' },
      { 'Senior Resident': '', Intern: 6 },
    ];
    expect(ratingsFor(rows, 'Senior Resident')).toEqual([16, 14]);
    expect(meanRating(ratingsFor(rows, 'Senior Resident'))).toBe(15);
    expect(ratingsFor(rows, 'Intern')).toEqual([0, 6]);
    expect(meanRating(ratingsFor(rows, 'Intern'))).toBe(3);
  });

  it('has no mean when nobody rated the role', () => {
    expect(meanRating(ratingsFor([{ Intern: '' }], 'Intern'))).toBeNull();
  });

  it('counts a row of zeros as a response, but not a row of blanks or an attestation', () => {
    expect(isSurveyResponse({ 'Senior Resident': 0, Intern: 0 }, COLS)).toBe(true);
    expect(isSurveyResponse({ 'Senior Resident': '', Intern: '' }, COLS)).toBe(false);
    expect(isSurveyResponse({ Type: 'attestation', 'Senior Resident': 10 }, COLS)).toBe(false);
  });
});
