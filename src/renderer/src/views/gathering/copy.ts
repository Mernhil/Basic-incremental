/** On-screen text of package 9b's wings and views (the table update's view copy lives with its view). */
export const GATHERING_COPY = {
  rate: (value: string) => `${value}/s`,
  level: (n: number) => `Lv ${n}`,
  locked: 'locked',
  noWorker: 'no worker',
  age: (n: number, max: number) => `Age ${n} of ${max}`,
  layer: (n: number, max: number) => `Layer ${n} of ${max}`,
  tools: 'Tools',
  toolsReady: (n: number) => `Tools · ${n} ready`,
  forgeHint: 'Recipes and tools',
  upgradesHint: (n: number) => (n === 1 ? '1 ready to buy' : `${n} ready to buy`),
};
