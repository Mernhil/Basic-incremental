/** On-screen text of package 9d's piles and views. */
export const META_COPY = {
  points: (n: number) => (n === 1 ? '1 point to spend' : `${n} points to spend`),
  of: (n: number, of: number) => `${n} of ${of}`,
  amount: (value: string, name: string) => `${value} ${name}`,
  ready: (n: number) => `${n} ready to buy`,
};
