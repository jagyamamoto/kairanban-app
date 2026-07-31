// Web Push用のVAPID鍵ペアを生成する(公開鍵はwrangler.jsonc、秘密鍵はSecretへ)
import { webcrypto } from "node:crypto";

const { subtle } = webcrypto;

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
  "sign",
  "verify",
]);
const publicRaw = await subtle.exportKey("raw", pair.publicKey); // 65バイト非圧縮
const privatePkcs8 = await subtle.exportKey("pkcs8", pair.privateKey);

console.log("VAPID_PUBLIC_KEY=" + b64url(publicRaw));
console.log("VAPID_PRIVATE_KEY=" + b64url(privatePkcs8));
