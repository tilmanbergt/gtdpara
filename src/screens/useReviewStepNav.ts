/**
 * App's half of opening a Review step from outside the Review screen
 * (docs/dev/history/technical-design-engage-in-context.md §2.3, §2.10): when
 * a step is requested (screens/review/reviewNav.ts), the tab shell shows the
 * Review tab with no overlay over it; ReviewScreen then takes the request.
 */
import {useEffect, useRef} from 'react';
import {useReviewStepRequestNonce} from './review/reviewNav';

/** Calls `showReview` once per new request. */
export function useReviewStepNav(showReview: () => void): void {
  const nonce = useReviewStepRequestNonce();
  const showRef = useRef(showReview);
  showRef.current = showReview;
  useEffect(() => {
    if (nonce > 0) showRef.current();
  }, [nonce]);
}
