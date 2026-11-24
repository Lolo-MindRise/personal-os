import type { MovementSearchDto } from '../shared/api.js';
import type { SearchQuery } from './movementSearch.js';

// State of the movement search on the movements screen, as a reducer so the transitions
// (search, page, leave, late answers) can be tested without a browser.

export interface SearchState {
  /** The filter panel is open. */
  showFilters: boolean;
  /** The active search; undefined in the monthly view. */
  search: { query: SearchQuery; page: number } | undefined;
  result: MovementSearchDto | undefined;
  error: string | undefined;
  /** A request for the active search is in flight. */
  busy: boolean;
}

export type SearchAction =
  | { type: 'open' }
  /** Close the panel; leaves the search too when one is active. */
  | { type: 'close' }
  /** A new search: starts on page 1 and drops the previous results while it loads. */
  | { type: 'search'; query: SearchQuery }
  /** Another page of the same search: the current results stay visible while it loads. */
  | { type: 'page'; page: number }
  | { type: 'loaded'; result: MovementSearchDto }
  | { type: 'failed'; error: string }
  /** Back to the monthly view. */
  | { type: 'leave' };

export const initialSearchState: SearchState = {
  showFilters: false,
  search: undefined,
  result: undefined,
  error: undefined,
  busy: false,
};

export function searchReducer(state: SearchState, action: SearchAction): SearchState {
  switch (action.type) {
    case 'open':
      return { ...state, showFilters: true };
    case 'close':
    case 'leave':
      // Leaving also forgets any request in flight: its answer is ignored below.
      return initialSearchState;
    case 'search':
      return {
        showFilters: true,
        search: { query: action.query, page: 1 },
        result: undefined,
        error: undefined,
        busy: true,
      };
    case 'page':
      return state.search === undefined
        ? state
        : {
            ...state,
            search: { ...state.search, page: action.page },
            error: undefined,
            busy: true,
          };
    case 'loaded':
      // A late answer after the user left the search must not bring it back.
      return state.search === undefined
        ? state
        : { ...state, result: action.result, error: undefined, busy: false };
    case 'failed':
      return state.search === undefined ? state : { ...state, error: action.error, busy: false };
  }
}
