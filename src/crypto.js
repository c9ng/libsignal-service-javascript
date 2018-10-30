/*
 * vim: ts=2:sw=2:expandtab
 */

"use strict";
const ByteBuffer = require("bytebuffer");
const getRandomValues = require("get-random-values");
const libsignal = require("@throneless/libsignal-protocol");
const WebCrypto = require("node-webcrypto-ossl");
const webcrypto = new WebCrypto();
const WebSocketMessage = require("./protobufs.js").lookupType(
  "signalservice.WebSocketMessage"
);

/* eslint-disable more/no-then, no-bitwise */

// eslint-disable-next-line func-names
const {
  encrypt,
  decrypt,
  calculateMAC,
  getRandomBytes
} = libsignal._crypto.crypto;
const verifyMAC = libsignal._crypto.verifyMAC;

const PROFILE_IV_LENGTH = 12; // bytes
const PROFILE_KEY_LENGTH = 32; // bytes
const PROFILE_TAG_LENGTH = 128; // bits
const PROFILE_NAME_PADDED_LENGTH = 26; // bytes

function verifyDigest(data, theirDigest) {
  return webcrypto.subtle.digest({ name: "SHA-256" }, data).then(ourDigest => {
    const a = new Uint8Array(ourDigest);
    const b = new Uint8Array(theirDigest);
    let result = 0;
    for (let i = 0; i < theirDigest.byteLength; i += 1) {
      result |= a[i] ^ b[i];
    }
    if (result !== 0) {
      throw new Error("Bad digest");
    }
  });
}
function calculateDigest(data) {
  return webcrypto.subtle.digest({ name: "SHA-256" }, data);
}

exports = module.exports = {
  // Decrypts message into a raw string
  decryptWebsocketMessage(message, signalingKey) {
    if (signalingKey.byteLength !== 52) {
      throw new Error("Got invalid length signalingKey");
    }
    if (message.byteLength < 1 + 16 + 10) {
      throw new Error("Got invalid length message");
    }
    if (new Uint8Array(message)[0] !== 1) {
      throw new Error(`Got bad version number: ${message[0]}`);
    }

    const aesKey = signalingKey.slice(0, 32);
    const macKey = signalingKey.slice(32, 32 + 20);

    const iv = message.slice(1, 1 + 16);
    const ciphertext = message.slice(1 + 16, message.byteLength - 10);
    const ivAndCiphertext = message.slice(0, message.byteLength - 10);
    const mac = message.slice(message.byteLength - 10, message.byteLength);

    return verifyMAC(ivAndCiphertext, macKey, mac, 10).then(() =>
      decrypt(aesKey, ciphertext, iv)
    );
  },

  decryptAttachment(encryptedBin, keys, theirDigest) {
    if (keys.byteLength !== 64) {
      throw new Error("Got invalid length attachment keys");
    }
    if (encryptedBin.byteLength < 16 + 32) {
      throw new Error("Got invalid length attachment");
    }

    const aesKey = keys.slice(0, 32);
    const macKey = keys.slice(32, 64);

    const iv = encryptedBin.slice(0, 16);
    const ciphertext = encryptedBin.slice(16, encryptedBin.byteLength - 32);
    const ivAndCiphertext = encryptedBin.slice(0, encryptedBin.byteLength - 32);
    const mac = encryptedBin.slice(
      encryptedBin.byteLength - 32,
      encryptedBin.byteLength
    );

    return verifyMAC(ivAndCiphertext, macKey, mac, 32)
      .then(() => {
        if (theirDigest !== null) {
          return verifyDigest(encryptedBin, theirDigest);
        }
        return null;
      })
      .then(() => decrypt(aesKey, ciphertext, iv));
  },

  encryptAttachment(plaintext, keys, iv) {
    if (!(plaintext instanceof ArrayBuffer) && !ArrayBuffer.isView(plaintext)) {
      throw new TypeError(
        `\`plaintext\` must be an \`ArrayBuffer\` or \`ArrayBufferView\`; got: ${typeof plaintext}`
      );
    }

    if (keys.byteLength !== 64) {
      throw new Error("Got invalid length attachment keys");
    }
    if (iv.byteLength !== 16) {
      throw new Error("Got invalid length attachment iv");
    }
    const aesKey = keys.slice(0, 32);
    const macKey = keys.slice(32, 64);

    return encrypt(aesKey, plaintext, iv).then(ciphertext => {
      const ivAndCiphertext = new Uint8Array(16 + ciphertext.byteLength);
      ivAndCiphertext.set(new Uint8Array(iv));
      ivAndCiphertext.set(new Uint8Array(ciphertext), 16);

      return calculateMAC(macKey, ivAndCiphertext.buffer).then(mac => {
        const encryptedBin = new Uint8Array(16 + ciphertext.byteLength + 32);
        encryptedBin.set(ivAndCiphertext);
        encryptedBin.set(new Uint8Array(mac), 16 + ciphertext.byteLength);
        return calculateDigest(encryptedBin.buffer).then(digest => ({
          ciphertext: encryptedBin.buffer,
          digest
        }));
      });
    });
  },

  encryptProfile(data, key) {
    const iv = this.getRandomBytes(PROFILE_IV_LENGTH);
    if (key.byteLength !== PROFILE_KEY_LENGTH) {
      throw new Error("Got invalid length profile key");
    }
    if (iv.byteLength !== PROFILE_IV_LENGTH) {
      throw new Error("Got invalid length profile iv");
    }
    return webcrypto.subtle
      .importKey("raw", key, { name: "AES-GCM" }, false, ["encrypt"])
      .then(keyForEncryption =>
        webcrypto.subtle
          .encrypt(
            { name: "AES-GCM", iv, tagLength: PROFILE_TAG_LENGTH },
            keyForEncryption,
            data
          )
          .then(ciphertext => {
            const ivAndCiphertext = new Uint8Array(
              PROFILE_IV_LENGTH + ciphertext.byteLength
            );
            ivAndCiphertext.set(new Uint8Array(iv));
            ivAndCiphertext.set(new Uint8Array(ciphertext), PROFILE_IV_LENGTH);
            return ivAndCiphertext.buffer;
          })
      );
  },

  decryptProfile(data, key) {
    if (data.byteLength < 12 + 16 + 1) {
      throw new Error(`Got too short input: ${data.byteLength}`);
    }
    const iv = data.slice(0, PROFILE_IV_LENGTH);
    const ciphertext = data.slice(PROFILE_IV_LENGTH, data.byteLength);
    if (key.byteLength !== PROFILE_KEY_LENGTH) {
      throw new Error("Got invalid length profile key");
    }
    if (iv.byteLength !== PROFILE_IV_LENGTH) {
      throw new Error("Got invalid length profile iv");
    }
    const error = new Error(); // save stack
    return webcrypto.subtle
      .importKey("raw", key, { name: "AES-GCM" }, false, ["decrypt"])
      .then(keyForEncryption =>
        webcrypto.subtle
          .decrypt(
            { name: "AES-GCM", iv, tagLength: PROFILE_TAG_LENGTH },
            keyForEncryption,
            ciphertext
          )
          .catch(e => {
            if (e.name === "OperationError") {
              // bad mac, basically.
              error.message =
                "Failed to decrypt profile data. Most likely the profile key has changed.";
              error.name = "ProfileDecryptError";
              throw error;
            }
          })
      );
  },

  encryptProfileName(name, key) {
    const padded = new Uint8Array(PROFILE_NAME_PADDED_LENGTH);
    padded.set(new Uint8Array(name));
    return this.encryptProfile(padded.buffer, key);
  },

  decryptProfileName(encryptedProfileName, key) {
    const data = ByteBuffer.wrap(
      encryptedProfileName,
      "base64"
    ).toArrayBuffer();
    return this.decryptProfile(data, key).then(decrypted => {
      // unpad
      const padded = new Uint8Array(decrypted);
      let i;
      for (i = padded.length; i > 0; i -= 1) {
        if (padded[i - 1] !== 0x00) {
          break;
        }
      }

      return ByteBuffer.wrap(padded)
        .slice(0, i)
        .toArrayBuffer();
    });
  },

  getRandomBytes: getRandomBytes,

  getRandomValues: getRandomValues
};
