// Domain-separated key derivation. Only the public verification key leaves the
// existing server environment; the signing scalar is never stored or logged.
export async function usernameSigningScalar(secret){
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('yuri-username-registry-signing-v1\n'+secret)));
 const order=BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
 const value=BigInt('0x'+[...bytes].map(n=>n.toString(16).padStart(2,'0')).join(''))%(order-1n)+1n;
 return Uint8Array.from(value.toString(16).padStart(64,'0').match(/../g).map(n=>parseInt(n,16)));
}
export const base64url=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
export const canonicalPublicKey=key=>JSON.stringify({kty:'EC',crv:'P-256',x:key.x,y:key.y});
