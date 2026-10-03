// What the screens hold about the signed-in owner, and the one way it is let go.
//
// Everything that came from the platform about this owner lives in this one
// state: who they are, their garages and which one is chosen. The pages' own
// figures live in the pages, which are taken off the screen with the frame.
// On sign-out, and on any 401 from any request, `drop` puts this state back
// to EMPTY_OWNER in one step, so nothing of one owner is left for the next.

export const EMPTY_OWNER = {
  status: 'checking', // 'checking' | 'signedOut' | 'signedIn'
  notice: null, // a Problem kind shown on the sign-in screen, or null
  who: null,
  garages: null,
  garagesProblem: null,
  garageId: null,
  epoch: 0,
};

/** THE clear: nothing of the last owner is carried over, only the count of sign-ins. */
const cleared = (state) => ({ ...EMPTY_OWNER, epoch: state.epoch + 1 });

export function ownerReducer(state, action) {
  switch (action.type) {
    case 'drop':
      return { ...cleared(state), status: 'signedOut', notice: action.notice ?? null };
    case 'signedIn':
      return { ...cleared(state), status: 'signedIn', who: action.who };
    case 'garages': {
      const only = action.garages.length === 1 ? action.garages[0].id : null;
      return { ...state, garages: action.garages, garagesProblem: null, garageId: only };
    }
    case 'garagesProblem':
      return { ...state, garagesProblem: action.kind };
    case 'choose':
      return { ...state, garageId: action.garageId };
    default:
      return state;
  }
}
