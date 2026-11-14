import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { isoCBOR } from '@simplewebauthn/server/helpers'
import * as crypto from 'node:crypto'

/**
 * A software WebAuthn authenticator for specs: an ES256 (P-256) key pair and a
 * discoverable credential, answering the API's options the way a passkey
 * provider would (attestation `none`, user present and verified, synced).
 * The responses are verified for real by `@simplewebauthn/server`.
 */

type CborValue = Parameters<typeof isoCBOR.encode>[0]

const FLAG_UP = 0x01
const FLAG_UV = 0x04
const FLAG_BE = 0x08
const FLAG_BS = 0x10
const FLAG_AT = 0x40

const b64url = (bytes: Uint8Array | Buffer) =>
  Buffer.from(bytes).toString('base64url')
const sha256 = (data: Uint8Array | string) =>
  crypto.createHash('sha256').update(data).digest()

function uint32(value: number): Buffer {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32BE(value)
  return buffer
}

export interface SoftAuthenticatorOptions {
  /** Origin written in the client data (default `http://localhost:3000`). */
  origin?: string
  /** RP id hashed into the authenticator data (default: the options' RP id). */
  rpId?: string
  /** Leave the user-verified flag off. */
  skipUserVerification?: boolean
}

export class SoftAuthenticator {
  readonly credentialId = b64url(crypto.randomBytes(16))
  private readonly keys = crypto.generateKeyPairSync('ec', {
    namedCurve: 'P-256',
  })
  private userHandle: string | undefined
  private counter = 0

  private flags(extra: number, options: SoftAuthenticatorOptions): number {
    const uv = options.skipUserVerification ? 0 : FLAG_UV
    return FLAG_UP | uv | FLAG_BE | FLAG_BS | extra
  }

  private cosePublicKey(): Uint8Array {
    const jwk = this.keys.publicKey.export({ format: 'jwk' })
    const key = new Map<number, CborValue>([
      [1, 2], // kty: EC2
      [3, -7], // alg: ES256
      [-1, 1], // crv: P-256
      [-2, new Uint8Array(Buffer.from(jwk.x!, 'base64url'))],
      [-3, new Uint8Array(Buffer.from(jwk.y!, 'base64url'))],
    ])
    return isoCBOR.encode(key)
  }

  private clientData(
    type: 'webauthn.create' | 'webauthn.get',
    challenge: string,
    options: SoftAuthenticatorOptions,
  ): Buffer {
    return Buffer.from(
      JSON.stringify({
        type,
        challenge,
        origin: options.origin ?? 'http://localhost:3000',
        crossOrigin: false,
      }),
    )
  }

  register(
    creation: PublicKeyCredentialCreationOptionsJSON,
    options: SoftAuthenticatorOptions = {},
  ): RegistrationResponseJSON {
    this.userHandle = creation.user.id
    const credentialIdBytes = Buffer.from(this.credentialId, 'base64url')
    const credentialIdLength = Buffer.alloc(2)
    credentialIdLength.writeUInt16BE(credentialIdBytes.length)
    const authData = Buffer.concat([
      sha256(options.rpId ?? creation.rp.id!),
      Buffer.from([this.flags(FLAG_AT, options)]),
      uint32(this.counter),
      Buffer.alloc(16), // AAGUID
      credentialIdLength,
      credentialIdBytes,
      Buffer.from(this.cosePublicKey()),
    ])
    const attestation = new Map<string, CborValue>()
    attestation.set('fmt', 'none')
    attestation.set('attStmt', new Map<string, CborValue>())
    attestation.set('authData', new Uint8Array(authData))
    const attestationObject = isoCBOR.encode(attestation)
    return {
      id: this.credentialId,
      rawId: this.credentialId,
      type: 'public-key',
      response: {
        clientDataJSON: b64url(
          this.clientData('webauthn.create', creation.challenge, options),
        ),
        attestationObject: b64url(attestationObject),
        transports: ['internal', 'hybrid'],
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    }
  }

  authenticate(
    request: PublicKeyCredentialRequestOptionsJSON,
    options: SoftAuthenticatorOptions = {},
  ): AuthenticationResponseJSON {
    const authData = Buffer.concat([
      sha256(options.rpId ?? request.rpId!),
      Buffer.from([this.flags(0, options)]),
      uint32(this.counter),
    ])
    const clientDataJSON = this.clientData(
      'webauthn.get',
      request.challenge,
      options,
    )
    const signature = crypto.sign(
      'sha256',
      Buffer.concat([authData, sha256(clientDataJSON)]),
      this.keys.privateKey,
    )
    return {
      id: this.credentialId,
      rawId: this.credentialId,
      type: 'public-key',
      response: {
        clientDataJSON: b64url(clientDataJSON),
        authenticatorData: b64url(authData),
        signature: b64url(signature),
        userHandle: this.userHandle,
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    }
  }
}
