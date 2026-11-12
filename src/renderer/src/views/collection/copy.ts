/** On-screen text of package 9c's piles and views. */
export const COLLECTION_COPY = {
  owned: (n: number, of: number) => `${n} of ${of} owned`,
  pulls: (n: number) => (n === 1 ? '1 pull ready' : `${n} pulls ready`),
  teamsTitle: 'Teams by dungeon',
  teamsAbout: 'Each dungeon remembers the team you last fought it with and puts it back on.',
  teamEmpty: 'No cards',
  teamActive: 'In the slots now',
  teamOver: 'Over the cost cap',
};
