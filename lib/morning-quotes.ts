export const morningQuotes = [
  "Strength does not come from physical capacity. It comes from an indomitable will.",
  "Discipline is the bridge between goals and accomplishment.",
  "Willpower is what separates the successful from the unsuccessful. Successful people strive no matter what they feel by applying their will to overcome apathy, doubt or fear.",
  "We are what we repeatedly do. Excellence, then, is not an act, but a habit.",
  "Morning is an important time of day, because how you spend your morning can often tell you what kind of day you are going to have.",
  "Write it on your heart that every day is the best day in the year.",
  "When you arise in the morning, think of what a precious privilege it is to be alive-to breathe, to think, to enjoy, to love.",
  "The secret of getting ahead is getting started.",
  "Do not wait; the time will never be 'just right.' Start where you stand, and work with whatever tools you may have at your command, and better tools will be found as you go along.",
  "I attribute my success to this: I never gave or took any excuse.",
  "You don't have to be great to start, but you have to start to be great.",
] as const;

export function getMorningQuoteText(index = 0) {
  const safeIndex = Number.isFinite(index) ? index : 0;
  const normalizedIndex = ((safeIndex % morningQuotes.length) + morningQuotes.length) % morningQuotes.length;

  return morningQuotes[normalizedIndex];
}
