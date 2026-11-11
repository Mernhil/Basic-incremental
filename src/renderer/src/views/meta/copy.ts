/** On-screen text of package 9d's piles and views. */
export const META_COPY = {
  points: (n: number) => (n === 1 ? '1 point to spend' : `${n} points to spend`),
  of: (n: number, of: number) => `${n} of ${of}`,
  amount: (value: string, name: string) => `${value} ${name}`,
  ready: (n: number) => `${n} ready to buy`,
  upgrades: {
    run: 'This run',
    runNote: 'reset by an Ascension',
    permanent: 'Permanent',
    permanentNote: 'kept for good',
    bought: 'Bought',
    lifetime: 'Lifetime Money earned',
    noneReady: 'Nothing to buy yet',
    emptyRun: 'Nothing new yet. Level up trees and mines to unlock more.',
    emptyPermanent: 'Nothing permanent unlocked yet.',
  },
  skills: {
    subtitle: (learned: number, total: number) =>
      `${learned} of ${total} learned · drag to pan, wheel to zoom`,
  },
  achievements: {
    subtitle: (done: number, total: number) => `${done} of ${total} · each gives a skill point`,
  },
  shop: {
    subtitle: (starlight: string, shards: string) => `${starlight} Starlight · ${shards} Shards`,
  },
  settings: {
    subtitle: (version: string) => `version ${version}`,
  },
};
