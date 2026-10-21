// Preserve IDs even if the upstream changes a quoted ID to an integer token.
export function parseSourceJSON(text){return JSON.parse(text.replace(/"(?:[^"\\]|\\.)*"|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,(token,number)=>number&&/^-?\d+$/.test(number)&&!Number.isSafeInteger(Number(number))?JSON.stringify(number):token));}
