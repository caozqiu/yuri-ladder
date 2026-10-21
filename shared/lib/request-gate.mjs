// Reserve slots across both workers so they cannot burst at page boundaries.
export function createRequestGate(intervalMs=2000,clock=()=>Date.now(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))){
  let next=0;
  return async()=>{const slot=Math.max(clock(),next);next=slot+intervalMs;const delay=slot-clock();if(delay>0)await sleep(delay);};
}
